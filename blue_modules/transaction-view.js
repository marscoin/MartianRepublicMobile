// What the transaction page shows, worked out from a wallet transaction: exact amounts in zubrins, where the coins
// went, the Republic record it carries, and how settled it is. Pure functions, so the page's numbers can be tested.
import BigNumber from 'bignumber.js';
import * as bitcoin from 'bitcoinjs-lib';

export const EXPLORER = 'https://explore.marscoin.org';
export const IPFS_GATEWAY = 'https://ipfs.marscoin.org/ipfs/';
export const SETTLED_AT = 6;

export const explorerUrl = txid => `${EXPLORER}/tx/${txid}`;

// A MARS amount as transaction details carry it (328.4054593, "0.00010000", 0) in whole zubrins, or null.
export function zubrinsOf(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  let zubrins;
  try {
    zubrins = new BigNumber(amount).shiftedBy(8);
  } catch {
    return null;
  }
  if (!zubrins.isFinite() || zubrins.isNegative() || zubrins.gt(Number.MAX_SAFE_INTEGER)) return null;
  // Floating-point amounts like 328.40545929999997 are a zubrin's hair from the real value.
  return zubrins.integerValue(BigNumber.ROUND_HALF_UP).toNumber();
}

// −328.40676930 as parts: the sign, the whole MARS, and the decimals split where the page dims the last four.
export function marsParts(zubrins, { signed = true } = {}) {
  const abs = Math.abs(zubrins);
  const whole = Math.floor(abs / 1e8);
  const decimals = String(abs % 1e8).padStart(8, '0');
  const sign = !signed || zubrins === 0 ? '' : zubrins < 0 ? '−' : '+';
  // Below one MARS every digit matters; above it, the last four are the small change.
  const split = whole >= 1 ? 4 : 8;
  return { sign, whole: whole.toLocaleString('en-US'), lead: decimals.slice(0, split), tail: decimals.slice(split) };
}

export function formatMars(zubrins, options) {
  const p = marsParts(zubrins, options);
  return `${p.sign}${p.whole}.${p.lead}${p.tail}`;
}

export function shortAddress(address) {
  return typeof address === 'string' && address.length > 20 ? `${address.slice(0, 8)}…${address.slice(-9)}` : address || '';
}

// The Republic's records, as its chain tracker reads them (martianrepublic scripts/track_blockchain.py).
export const RECORDS = {
  GP: {
    kind: 'Application to join',
    about:
      'An application to become a public member of the Republic. The application is on IPFS; this transaction fixes when it was made and from which civic address.',
  },
  CT: { kind: 'Citizenship', about: 'A citizenship record of the Republic. The details are on IPFS.' },
  ED: {
    kind: 'Endorsement',
    about: 'A citizen vouching for an applicant. The Republic counts endorsements like this one to grant citizenship.',
  },
  PR: {
    kind: 'Proposal put to a vote',
    about: 'A proposal for the Republic to vote on. The full text is on IPFS, and this transaction fixes when it was put forward.',
  },
  PRY: { kind: 'Vote: yes', about: 'A secret ballot. The Republic counts it for the proposal without knowing who cast it.' },
  PRN: { kind: 'Vote: no', about: 'A secret ballot. The Republic counts it for the proposal without knowing who cast it.' },
  PRA: { kind: 'Vote: abstain', about: 'A secret ballot. The Republic counts it for the proposal without knowing who cast it.' },
  SP: {
    kind: 'Signed forum post',
    about:
      'The post is stored on IPFS. This transaction puts its fingerprint on the Marscoin chain, so anyone can check which civic address signed it, and when.',
  },
  LB: {
    kind: 'Logbook entry',
    about: 'An entry in the Republic’s logbook. The entry is on IPFS; this transaction fixes when it was written.',
  },
  MG: { kind: 'Civic wallet move', about: 'A civic identity moving to a new address, recorded so the Republic follows it.' },
};

const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;

function outputScript(output) {
  const hex = output?.scriptPubKey?.hex;
  if (typeof hex === 'string' && /^[0-9a-f]*$/i.test(hex)) return Buffer.from(hex, 'hex');
  const asm = output?.scriptPubKey?.asm;
  if (typeof asm === 'string' && asm.startsWith('OP_RETURN ')) {
    const data = asm.split(' ')[1] || '';
    if (/^[0-9a-f]+$/i.test(data)) return bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from(data, 'hex')]);
  }
  return null;
}

// The data a transaction carries in an OP_RETURN output: a Republic record, other text, or null.
export function civicRecord(outputs) {
  for (const output of outputs || []) {
    const script = outputScript(output);
    if (!script || script[0] !== bitcoin.opcodes.OP_RETURN) continue;
    let chunks;
    try {
      chunks = bitcoin.script.decompile(script) || [];
    } catch {
      continue;
    }
    const data = chunks.slice(1).find(chunk => Buffer.isBuffer(chunk));
    if (!data) continue;
    const text = data.toString('utf8');
    // Only printable text is shown; anything else is reported as data without being displayed.
    if (!/^[\x20-\x7e]+$/.test(text)) {
      return { tag: null, kind: 'Data on the chain', about: `${data.length} bytes of data.`, text: null, cid: null };
    }
    const match = /^([A-Z]{2,3})_(.+)$/.exec(text);
    const known = match && RECORDS[match[1]];
    if (!known) {
      return { tag: null, kind: 'Data on the chain', about: 'Text written into this transaction.', text: text.slice(0, 120), cid: null };
    }
    const body = match[2];
    return { tag: match[1], kind: known.kind, about: known.about, text: null, cid: CID.test(body) ? body : null, body };
  }
  return null;
}

const addressOf = item => {
  const spk = item?.scriptPubKey;
  return (spk && (spk.address || spk.addresses?.[0])) || item?.address || item?.addresses?.[0] || null;
};

// Where the coins came from and went. `owner(address)` says whose an address is: 'this' (this wallet), a label for
// another of the user's wallets, or null.
export function route(tx, owner = () => null) {
  const groups = (items, value) => {
    const map = new Map();
    for (const item of items) {
      const address = addressOf(item);
      if (!address) continue;
      const entry = map.get(address) || { address, value: 0, count: 0, known: true, owner: owner(address) };
      const zubrins = value(item);
      if (zubrins === null) entry.known = false;
      else entry.value += zubrins;
      entry.count += 1;
      map.set(address, entry);
    }
    return [...map.values()];
  };
  const inputs = tx?.inputs || [];
  const outputs = tx?.outputs || [];
  const from = groups(inputs, input => zubrinsOf(input.value));
  const to = groups(outputs, output => zubrinsOf(output.value));
  const record = civicRecord(outputs);
  const allKnown = from.length > 0 && from.every(g => g.known) && from.reduce((n, g) => n + g.count, 0) === inputs.length;
  const totalIn = from.reduce((n, g) => n + g.value, 0);
  const totalOut = outputs.reduce((n, o) => n + (zubrinsOf(o.value) || 0), 0);
  const fee = allKnown && totalIn >= totalOut ? totalIn - totalOut : null;
  const sum = list => list.reduce((n, g) => n + g.value, 0);
  const mine = g => g.owner === 'this';
  // What this wallet lost or gained: the page's headline amount, exact.
  const net = sum(to.filter(mine)) - sum(from.filter(mine));
  return { from, to, record, fee, inputs: inputs.length, outputs: outputs.length, net };
}

// How settled a transaction is, for the confirmations panel.
export function settlement(confirmations) {
  const c = Number.isSafeInteger(confirmations) && confirmations > 0 ? confirmations : 0;
  if (!c) return { lit: 0, state: 'pending', label: 'WAITING FOR A BLOCK', detail: 'Blocks come about every 2 minutes.' };
  if (c < SETTLED_AT) return { lit: c, state: 'confirming', label: 'CONFIRMING', detail: `${c} of ${SETTLED_AT} blocks` };
  return { lit: SETTLED_AT, state: 'settled', label: 'SETTLED', detail: `${c.toLocaleString('en-US')} blocks deep` };
}

// What the headline says the transaction was.
export function direction(r) {
  if (r.record?.tag && r.from.some(g => g.owner === 'this')) return 'record';
  if (r.net < 0) return 'sent';
  if (r.net > 0) return 'received';
  return 'moved';
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// "01:28 UTC", or "APR 1 · 02:54 UTC" when the UTC date is not the local one.
export function utcStamp(ms, localDate = new Date(ms)) {
  const d = new Date(ms);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  return d.getUTCDate() === localDate.getDate() && d.getUTCMonth() === localDate.getMonth()
    ? time
    : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${time}`;
}

// The tip of the chain and the block the transaction is in, fresh from the network. Height 0 means not in a block yet.
export async function chainFacts({ txid, address, history, tip }) {
  const [items, top] = await Promise.all([history(address), tip()]);
  const entry = (items || []).find(item => item.tx_hash === txid);
  if (!entry) throw new Error('The transaction is not in the history of its address.');
  const height = entry.height > 0 ? entry.height : 0;
  if (!Number.isSafeInteger(top) || top <= 0) throw new Error('The chain height is unavailable.');
  return { height, tip: top, confirmations: height ? Math.max(1, top - height + 1) : 0 };
}

// A line of the record's content to quote on the page, from its IPFS JSON. Plain text, short; null when none.
export function previewText(json) {
  const sources = [json?.data, json].filter(source => source && typeof source === 'object');
  for (const source of sources) {
    for (const key of ['post', 'title', 'displayName', 'name', 'message', 'text', 'bio']) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        const clean = value.replace(/\s+/g, ' ').trim();
        return clean.length > 220 ? `${clean.slice(0, 219)}…` : clean;
      }
    }
  }
  return null;
}
