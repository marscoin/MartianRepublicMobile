// Marscoin side of an atomic swap: the offer relay (ElectrumX `atomicswap.*`
// extension methods) and the chain queries needed to verify and claim a
// contract. `request` is an Electrum JSON-RPC call; `fetch` reaches the block
// explorer, an independent full node used to cross-check the relay.
import * as bitcoin from 'bitcoinjs-lib';
import { electrumScriptHash } from './htlc';
import { normalizeOffer } from './safety';

export const SWAP_RELAY = { host: 'electrum.marscoin.org', ssl: '50002' };
export const MARS_EXPLORER = 'https://explore.marscoin.org';

// Relay answers that mean "this acceptance will never succeed".
const FINAL_REFUSAL = /unknown or expired|already taken|already have a swap|daily limit|abandoned swaps/i;

// "70.50000000" -> 7050000000 without floating point.
export function coinsToAtomic(text) {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(String(text));
  if (!match) throw new Error('Invalid amount');
  const value = Number(match[1]) * 100000000 + Number((match[2] || '').padEnd(8, '0'));
  if (!Number.isSafeInteger(value)) throw new Error('Invalid amount');
  return value;
}

export function createMarsSwapChain({ request, fetch, explorer = MARS_EXPLORER, broadcastElsewhere, timeout = 15000 }) {
  // The explorer is a separate full node. A request that never answers must
  // not hold up other swaps.
  async function explore(path) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${explorer}${path}`, controller ? { signal: controller.signal } : undefined);
      if (!response.ok) throw new Error('The Marscoin explorer could not answer.');
      return await response.json();
    } catch (error) {
      throw new Error(error?.message?.startsWith('The Marscoin explorer') ? error.message : 'The Marscoin explorer is unreachable.');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function tipHeight() {
    const header = await request('blockchain.headers.subscribe', []);
    if (!Number.isSafeInteger(header?.height) || header.height <= 0) throw new Error('The Marscoin block height is unavailable.');
    return header.height;
  }

  return {
    tipHeight,

    // For timelock decisions. The relay alone must not be believed about the
    // height: reporting an old block would make a nearly expired Marscoin lock
    // look safe. The explorer's node must agree within a few blocks, and the
    // higher figure (less time remaining) is used.
    async agreedTipHeight() {
      const [relay, status] = await Promise.all([tipHeight(), explore('/api/status')]);
      const node = status?.info?.blocks;
      if (!Number.isSafeInteger(node) || node <= 0 || Math.abs(relay - node) > 3) {
        throw new Error('Marscoin services disagree about the current block. Try again in a few minutes.');
      }
      return Math.max(relay, node);
    },

    async offers() {
      const offers = await request('atomicswap.get_offers', []);
      if (!Array.isArray(offers)) throw new Error('The swap relay returned an invalid offer list.');
      return offers.map(normalizeOffer).filter(Boolean);
    },

    // Resolves true when accepted. A refusal that cannot change on retry is
    // reported with `error.final`; anything else may be retried unchanged.
    async accept(offerId, acceptance) {
      try {
        const result = await request('atomicswap.accept_offer', [offerId, acceptance]);
        if (result !== true) throw new Error('The swap relay did not confirm the acceptance.');
        return true;
      } catch (cause) {
        const message = typeof cause?.message === 'string' ? cause.message : String(cause);
        const error = new Error(message);
        error.final = FINAL_REFUSAL.test(message);
        throw error;
      }
    },

    async unspent(outputScript) {
      const items = await request('blockchain.scripthash.listunspent', [electrumScriptHash(outputScript)]);
      if (!Array.isArray(items)) throw new Error('Invalid response from the Marscoin network.');
      return items.map(item => ({ txid: item.tx_hash, vout: item.tx_pos, value: item.value, height: item.height || 0 }));
    },

    async history(outputScript) {
      const items = await request('blockchain.scripthash.get_history', [electrumScriptHash(outputScript)]);
      if (!Array.isArray(items)) throw new Error('Invalid response from the Marscoin network.');
      return items.map(item => ({ txid: item.tx_hash, height: item.height > 0 ? item.height : 0 }));
    },

    // The bytes must hash to the requested ID.
    async transactionHex(txid) {
      const hex = await request('blockchain.transaction.get', [txid]);
      if (typeof hex !== 'string' || bitcoin.Transaction.fromHex(hex).getId() !== txid) {
        throw new Error('Invalid response from the Marscoin network.');
      }
      return hex;
    },

    async merkle(txid, height) {
      const proof = await request('blockchain.transaction.get_merkle', [txid, height]);
      if (!Array.isArray(proof?.merkle) || !Number.isSafeInteger(proof.pos)) throw new Error('Invalid response from the Marscoin network.');
      return { branch: proof.merkle, position: proof.pos };
    },

    async header(height) {
      const header = await request('blockchain.block.header', [height]);
      if (typeof header !== 'string') throw new Error('Invalid response from the Marscoin network.');
      return header;
    },

    // Through the relay and, when the wallet has one, a second connection, so
    // a relay that swallows a claim cannot keep it off the network.
    async broadcast(hex) {
      const attempts = await Promise.allSettled([
        request('blockchain.transaction.broadcast', [hex]),
        ...(broadcastElsewhere ? [broadcastElsewhere(hex)] : []),
      ]);
      const accepted = attempts.find(
        attempt => attempt.status === 'fulfilled' && typeof attempt.value === 'string' && /^[0-9a-f]{64}$/.test(attempt.value),
      );
      if (!accepted) throw new Error('The Marscoin network did not accept the transaction.');
      return accepted.value;
    },

    // ---- Offering (maker side) ----------------------------------------------

    async postOffer(offer) {
      if ((await request('atomicswap.post_offer', [offer])) !== true) throw new Error('The swap relay did not take the offer.');
      return true;
    },

    // Best effort: only the connection that posted an offer may cancel it, and
    // a phone's address changes. An offer that cannot be cancelled expires.
    async cancelOffer(offerId) {
      try {
        return (await request('atomicswap.cancel_offer', [offerId])) === true;
      } catch {
        return false;
      }
    },

    // The taker's acceptance of one of our offers, or null. Unauthenticated:
    // every field must be checked before acting on it.
    async acceptance(offerId) {
      const found = await request('atomicswap.get_acceptance', [offerId]);
      return found && typeof found === 'object' && !Array.isArray(found) ? found : null;
    },

    async reportAbandoned(offerId) {
      try {
        return (await request('atomicswap.report_abandoned', [offerId])) === true;
      } catch {
        return false;
      }
    },

    // The relay's unfiltered list, for telling our own offers from others'.
    async rawOffers() {
      const offers = await request('atomicswap.get_offers', []);
      return Array.isArray(offers) ? offers : [];
    },

    // ---- Watchtower ---------------------------------------------------------
    // The relay can finish a swap for a phone that is switched off. It is given
    // transactions that are already signed and can only pay our own addresses:
    // the Marscoin claim, complete except for the secret, and Bitcoin refunds
    // that are not valid until the timelock. It cannot redirect either.

    async watchtowerAvailable() {
      try {
        const features = await request('atomicswap.features', []);
        return features?.watchtower === true && features.watchtower_version === 1;
      } catch {
        return false; // an older relay without the method
      }
    },

    async watchRegister(pack) {
      const result = await request('atomicswap.watch_register', [pack]);
      if (typeof result?.watch_id !== 'string' || !/^[0-9a-f]{64}$/.test(result.watch_id)) {
        throw new Error('The watchtower did not confirm the registration.');
      }
      return { id: result.watch_id, expiresAt: result.expires_at };
    },

    async watchStatus(id) {
      const status = await request('atomicswap.watch_status', [id]);
      return status && typeof status === 'object' ? status : null;
    },

    // The transaction that spent an output according to the separate full
    // node: its ID, or null while unspent. Throws when that node does not know
    // the funding transaction.
    async explorerSpender(txid, vout) {
      const tx = await explore(`/api/tx/${txid}`);
      const output = Array.isArray(tx?.vout) ? tx.vout.find(item => item.n === vout) : null;
      if (tx?.txid !== txid || !output) throw new Error('The Marscoin explorer returned an unexpected transaction.');
      return typeof output.spentTxId === 'string' && /^[0-9a-f]{64}$/.test(output.spentTxId) ? output.spentTxId : null;
    },

    // What a separate full node says about one output of a transaction.
    // Throws when that node does not know the transaction.
    async explorerOutput(txid, vout) {
      const tx = await explore(`/api/tx/${txid}`);
      const output = Array.isArray(tx?.vout) ? tx.vout.find(item => item.n === vout) : null;
      if (tx?.txid !== txid || !output) throw new Error('The Marscoin explorer returned an unexpected transaction.');
      return {
        confirmations: Number.isSafeInteger(tx.confirmations) ? tx.confirmations : 0,
        value: coinsToAtomic(output.value),
        scriptHex: output.scriptPubKey?.hex,
      };
    },
  };
}
