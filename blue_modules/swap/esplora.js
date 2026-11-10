// Bitcoin chain access over the Esplora REST API, using two independent
// public services. A single source that stalls or misreports could hide the
// maker's claim (and with it the secret) or skew the timelock we choose.
import * as bitcoin from 'bitcoinjs-lib';

export const ESPLORA_SOURCES = ['https://mempool.space/api', 'https://blockstream.info/api'];
// Bounds on a plausible fee rate, in satoshis per virtual byte.
const MIN_FEE_RATE = 1;
const MAX_FEE_RATE = 500;

export function createEsplora({ fetch, sources = ESPLORA_SOURCES, timeout = 15000 }) {
  async function call(base, path, options) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(base + path, { ...options, signal: controller?.signal });
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(text.slice(0, 200) || `Bitcoin service error ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return text;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Ask every source; keep the answers that arrived.
  async function all(path, parse) {
    const results = await Promise.all(
      sources.map(base =>
        call(base, path)
          .then(text => ({ value: parse(text) }))
          .catch(error => ({ error })),
      ),
    );
    const values = results.filter(result => 'value' in result).map(result => result.value);
    if (!values.length) throw new Error('Bitcoin network services are unreachable. Check your connection and try again.');
    return values;
  }

  // First source that answers.
  async function first(path, parse) {
    let failure;
    for (const base of sources) {
      try {
        return parse(await call(base, path));
      } catch (error) {
        failure = error;
      }
    }
    throw failure?.status ? failure : new Error('Bitcoin network services are unreachable. Check your connection and try again.');
  }

  const integer = text => {
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid height');
    return value;
  };
  const list = text => {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error('Invalid list');
    return value;
  };

  return {
    // For display and monitoring: the highest tip any source reports.
    async tipHeight() {
      return Math.max(...(await all('/blocks/tip/height', integer)));
    },

    // For choosing a timelock. Every configured source must answer and agree
    // within two blocks. The lowest value is used: an inflated tip would push
    // our refund later than the safety margin assumes.
    async agreedTipHeight() {
      const heights = await all('/blocks/tip/height', integer);
      if (heights.length < sources.length || Math.max(...heights) - Math.min(...heights) > 2) {
        throw new Error('Bitcoin services disagree about the current block. Try again in a few minutes.');
      }
      return Math.min(...heights);
    },

    // Unspent outputs: [{ txid, vout, value, confirmed, height }]
    async utxos(address) {
      const items = await first(`/address/${address}/utxo`, list);
      return items.map(item => ({
        txid: item.txid,
        vout: item.vout,
        value: item.value,
        confirmed: !!item.status?.confirmed,
        height: item.status?.block_height || 0,
      }));
    },

    // Transaction history of an address, merged across sources so a claim seen
    // by either service is found.
    async transactions(address) {
      const seen = new Map();
      for (const items of await all(`/address/${address}/txs`, list)) {
        for (const item of items) {
          if (typeof item?.txid === 'string' && !seen.has(item.txid)) seen.set(item.txid, item);
        }
      }
      return [...seen.values()];
    },

    async addressStats(address) {
      const info = await first(`/address/${address}`, JSON.parse);
      const chain = info.chain_stats || {};
      const mempool = info.mempool_stats || {};
      return {
        transactions: (chain.tx_count || 0) + (mempool.tx_count || 0),
        confirmed: (chain.funded_txo_sum || 0) - (chain.spent_txo_sum || 0),
        unconfirmed: (mempool.funded_txo_sum || 0) - (mempool.spent_txo_sum || 0),
      };
    },

    // The raw transaction, from whichever source has it. The bytes must hash
    // to the requested ID, so no source can substitute another transaction.
    async transactionHex(txid) {
      return first(`/tx/${txid}/hex`, text => {
        const hex = text.trim();
        if (!/^([0-9a-f]{2})+$/.test(hex) || bitcoin.Transaction.fromHex(hex).getId() !== txid) throw new Error('Invalid transaction');
        return hex;
      });
    },

    // Block height of a transaction, or 0 while unconfirmed. Every source
    // that answers must agree, so one service cannot vouch for a payment the
    // rest of the network has not seen.
    async confirmedHeight(txid) {
      const answers = await all(`/tx/${txid}/status`, JSON.parse);
      const heights = answers.map(answer => (answer?.confirmed && Number.isSafeInteger(answer.block_height) ? answer.block_height : 0));
      return heights.every(value => value > 0 && value === heights[0]) ? heights[0] : 0;
    },

    // Whether one output has been spent, asking every source. A spend seen by
    // either is reported; the caller must still verify the spending transaction.
    async outspend(txid, vout) {
      const answers = await all(`/tx/${txid}/outspend/${vout}`, JSON.parse);
      const spent = answers.filter(answer => answer?.spent && typeof answer.txid === 'string');
      if (!spent.length) return { spent: false };
      const confirmed = spent.find(answer => answer.status?.confirmed);
      return { spent: true, txid: (confirmed || spent[0]).txid, confirmed: !!confirmed };
    },

    // Satoshis per virtual byte for confirmation within roughly three blocks.
    // When both services answer the lower figure is used, so neither alone can
    // inflate what we pay; the result is kept within plausible bounds.
    async feeRate() {
      const estimate = base =>
        call(base, '/fee-estimates').then(text => {
          const estimates = JSON.parse(text);
          return estimates['3'] ?? estimates['6'];
        });
      const asks = sources.map((base, index) =>
        index === 0
          ? call(base, '/v1/fees/recommended')
              .then(text => JSON.parse(text).halfHourFee)
              .catch(() => estimate(base))
          : estimate(base),
      );
      const rates = (await Promise.all(asks.map(ask => ask.catch(() => null)))).filter(rate => Number.isFinite(rate) && rate > 0);
      if (!rates.length) throw new Error('The Bitcoin network fee is unavailable.');
      return Math.min(MAX_FEE_RATE, Math.max(MIN_FEE_RATE, Math.ceil(Math.min(...rates))));
    },

    // Send to every source. One acceptance is enough; a transaction a service
    // already has is also a success. Only when every source answered and
    // refused the transaction itself is it reported as rejected; an outage or
    // rate limit leaves the outcome unknown and safe to repeat.
    async broadcast(hex) {
      const results = await Promise.all(
        sources.map(base =>
          call(base, '/tx', { method: 'POST', body: hex })
            .then(() => true)
            .catch(error => (/already|known|exists/i.test(error.message) ? true : error)),
        ),
      );
      if (results.some(result => result === true)) return true;
      if (results.every(result => result.status === 400)) {
        const error = new Error(`Bitcoin network rejected the transaction: ${results[0].message}`);
        error.rejected = true;
        throw error;
      }
      throw new Error('Bitcoin network services are unreachable. Check your connection and try again.');
    },
  };
}
