// Reads and writes for the anonymous ballot address, through the block
// explorer rather than the wallet's Electrum connection.
//
// The wallet's Electrum server sees every query about the civic address. If it
// also saw the ballot address from the same connection it could pair them,
// which is exactly what the ballot round is meant to prevent. Keeping the two
// on different services removes that easy link. It is not full network
// anonymity: both services can still see the phone's internet address.
import * as bitcoin from 'bitcoinjs-lib';
import { coinsToAtomic } from '../swap/mars-chain';
import { VOTE_TAGS } from './ballot-transactions';

export const BALLOT_EXPLORER = 'https://explore.marscoin.org';

export function createBallotExplorer({ fetch, base = BALLOT_EXPLORER, timeout = 15000 }) {
  async function call(path, options) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${base}${path}`, { ...options, signal: controller?.signal });
      if (!response.ok) {
        const error = new Error((await response.text().catch(() => '')).slice(0, 200) || 'The Marscoin explorer could not answer.');
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error.status) throw error;
      throw new Error('The Marscoin explorer is unreachable. Check your connection and try again.');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // A vote recorded in an explorer transaction: one data output and nothing else.
  function voteIn(tx) {
    if (!Array.isArray(tx?.vout) || tx.vout.length !== 1) return null;
    let chunks;
    try {
      chunks = bitcoin.script.decompile(Buffer.from(tx.vout[0].scriptPubKey.hex, 'hex')) || [];
    } catch {
      return null;
    }
    if (chunks[0] !== bitcoin.opcodes.OP_RETURN || !Buffer.isBuffer(chunks[1])) return null;
    const match = /^(PRY|PRN|PRA)_(.+)$/.exec(chunks[1].toString('utf8'));
    if (!match) return null;
    return {
      choice: Object.keys(VOTE_TAGS).find(key => VOTE_TAGS[key] === match[1]),
      cid: match[2],
      txid: tx.txid,
      confirmed: tx.confirmations > 0,
    };
  }

  return {
    // Coins at the address: [{ txid, vout, value, height }], height 0 while unconfirmed.
    async unspent(address) {
      const items = await call(`/api/addr/${address}/utxo`);
      if (!Array.isArray(items)) throw new Error('The Marscoin explorer returned an unexpected answer.');
      return items.map(item => ({
        txid: item.txid,
        vout: item.vout,
        value: coinsToAtomic(Number(item.amount).toFixed(8)),
        height: item.confirmations > 0 ? item.height || 1 : 0,
      }));
    },

    // Votes already cast from the address, newest first.
    async votes(address) {
      const page = await call(`/api/txs?address=${address}`);
      if (!Array.isArray(page?.txs)) throw new Error('The Marscoin explorer returned an unexpected answer.');
      return page.txs.map(voteIn).filter(Boolean);
    },

    async hasTransaction(txid) {
      try {
        return (await call(`/api/tx/${txid}`))?.txid === txid;
      } catch {
        return false;
      }
    },

    async broadcast(hex) {
      const result = await call('/api/tx/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawtx: hex }),
      });
      const txid = typeof result?.txid === 'string' ? result.txid : result?.txid?.result;
      if (typeof txid !== 'string' || !/^[0-9a-f]{64}$/.test(txid)) throw new Error('The Marscoin network did not accept the transaction.');
      return txid;
    },
  };
}
