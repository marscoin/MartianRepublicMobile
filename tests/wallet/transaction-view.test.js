import assert from 'assert';
import * as bitcoin from 'bitcoinjs-lib';
import {
  chainFacts,
  civicRecord,
  direction,
  explorerUrl,
  formatMars,
  marsParts,
  previewText,
  route,
  settlement,
  shortAddress,
  utcStamp,
  zubrinsOf,
} from '../../blue_modules/transaction-view';

const CIVIC = 'MLVcSocnecoZqXuk8Hy7DXvXHmnSwcBj4J';
const OTHER = 'MVsv5e9Wg6Ph3xqL43MEsjf7XL1a3X8KQJ';
const opReturn = text => ({
  value: 0,
  scriptPubKey: { type: 'nulldata', hex: bitcoin.payments.embed({ data: [Buffer.from(text, 'utf8')] }).output.toString('hex') },
});
const pay = (address, value) => ({ value, scriptPubKey: { type: 'pubkeyhash', addresses: [address] } });
const owner = address => (address === CIVIC ? 'this' : null);

describe('the transaction page', () => {
  it('counts in whole zubrins, never in floating point', () => {
    assert.strictEqual(zubrinsOf(328.4054593), 32840545930);
    assert.strictEqual(zubrinsOf('0.00010000'), 10000);
    assert.strictEqual(zubrinsOf(0), 0);
    // Floating-point noise (0.30000000000000004) is a zubrin's hair from the real amount.
    assert.strictEqual(zubrinsOf(0.1 + 0.2), 30000000);
    assert.strictEqual(zubrinsOf(undefined), null);
    assert.strictEqual(zubrinsOf('abc'), null);
    assert.strictEqual(zubrinsOf(-1), null);
  });

  it('writes amounts in MARS, dimming the last four decimals only above one MARS', () => {
    assert.deepStrictEqual(marsParts(-32840676930), { sign: '−', whole: '328', lead: '4067', tail: '6930' });
    assert.deepStrictEqual(marsParts(-2580), { sign: '−', whole: '0', lead: '00002580', tail: '' });
    assert.deepStrictEqual(marsParts(645585748720), { sign: '+', whole: '6,455', lead: '8574', tail: '8720' });
    assert.strictEqual(formatMars(131000, { signed: false }), '0.00131000');
    assert.strictEqual(formatMars(0), '0.00000000');
  });

  it('follows a sweep of 43 coins to one address, with the fee', () => {
    const tx = {
      inputs: [...Array(42)].map(() => ({ addresses: [CIVIC], value: 7.8 })).concat([{ addresses: [CIVIC], value: 0.8067693 }]),
      outputs: [pay(OTHER, 328.4054593)],
    };
    const r = route(tx, owner);
    assert.strictEqual(r.inputs, 43);
    assert.strictEqual(r.outputs, 1);
    assert.deepStrictEqual(r.from, [{ address: CIVIC, value: 32840676930, count: 43, known: true, owner: 'this' }]);
    assert.deepStrictEqual(r.to, [{ address: OTHER, value: 32840545930, count: 1, known: true, owner: null }]);
    assert.strictEqual(r.fee, 131000);
    assert.strictEqual(r.net, -32840676930);
    assert.strictEqual(r.record, null);
    assert.strictEqual(direction(r), 'sent');
  });

  it('reads a Republic record: the signed forum post from April', () => {
    const cid = 'QmXrwJULWV3h4uGjiDig35s7vGhmnzTKurfwdUMPUco6hp';
    const tx = {
      inputs: [{ addresses: [CIVIC], value: 198.7699742 }],
      outputs: [opReturn(`SP_${cid}`), pay(CIVIC, 0.0001), pay(CIVIC, 198.7698484)],
    };
    const r = route(tx, owner);
    assert.strictEqual(r.record.tag, 'SP');
    assert.strictEqual(r.record.kind, 'Signed forum post');
    assert.strictEqual(r.record.cid, cid);
    assert.strictEqual(r.fee, 2580);
    assert.strictEqual(r.net, -2580);
    // Both outputs back to the civic wallet are shown as one.
    assert.deepStrictEqual(r.to, [{ address: CIVIC, value: 19876994840, count: 2, known: true, owner: 'this' }]);
    assert.strictEqual(direction(r), 'record');
  });

  it('knows every record the Republic writes, and says so plainly when it does not', () => {
    const cid = 'QmXrwJULWV3h4uGjiDig35s7vGhmnzTKurfwdUMPUco6hp';
    const kinds = ['GP', 'CT', 'ED', 'PR', 'PRY', 'PRN', 'PRA', 'SP', 'LB', 'MG'].map(tag => civicRecord([opReturn(`${tag}_${cid}`)]).kind);
    assert.deepStrictEqual(kinds, [
      'Application to join',
      'Citizenship',
      'Endorsement',
      'Proposal put to a vote',
      'Vote: yes',
      'Vote: no',
      'Vote: abstain',
      'Signed forum post',
      'Logbook entry',
      'Civic wallet move',
    ]);
    assert.deepStrictEqual(civicRecord([opReturn('hello mars')]), {
      tag: null,
      kind: 'Data on the chain',
      about: 'Text written into this transaction.',
      text: 'hello mars',
      cid: null,
    });
    // Binary data is never printed.
    const binary = {
      value: 0,
      scriptPubKey: { hex: bitcoin.payments.embed({ data: [Buffer.from([0, 1, 2, 255])] }).output.toString('hex') },
    };
    assert.strictEqual(civicRecord([binary]).text, null);
    // A tag with something other than an IPFS reference has no link.
    assert.strictEqual(civicRecord([opReturn('MG_MNewAddressGoesHere')]).cid, null);
    // Reading from the asm form works too.
    assert.strictEqual(civicRecord([{ scriptPubKey: { asm: `OP_RETURN ${Buffer.from(`ED_${cid}`).toString('hex')}` } }]).tag, 'ED');
    assert.strictEqual(civicRecord([pay(CIVIC, 1)]), null);
  });

  it('says how settled a transaction is', () => {
    assert.deepStrictEqual(settlement(0), {
      lit: 0,
      state: 'pending',
      label: 'WAITING FOR A BLOCK',
      detail: 'Blocks come about every 2 minutes.',
    });
    assert.deepStrictEqual(settlement(2), { lit: 2, state: 'confirming', label: 'CONFIRMING', detail: '2 of 6 blocks' });
    assert.deepStrictEqual(settlement(3397), { lit: 6, state: 'settled', label: 'SETTLED', detail: '3,397 blocks deep' });
  });

  it('asks the network for the block and the tip, not an estimate', async () => {
    const facts = await chainFacts({
      txid: 'c8',
      address: CIVIC,
      history: async () => [
        { tx_hash: 'a1', height: 3000 },
        { tx_hash: 'c8', height: 3605415 },
      ],
      tip: async () => 3608811,
    });
    assert.deepStrictEqual(facts, { height: 3605415, tip: 3608811, confirmations: 3397 });
    const pending = await chainFacts({
      txid: 'c8',
      address: CIVIC,
      history: async () => [{ tx_hash: 'c8', height: 0 }],
      tip: async () => 5,
    });
    assert.strictEqual(pending.confirmations, 0);
    await assert.rejects(chainFacts({ txid: 'zz', address: CIVIC, history: async () => [], tip: async () => 5 }));
  });

  it('quotes a short line of the record, as plain text', () => {
    assert.strictEqual(
      previewText({ data: { post: 'New version of the Marscoin Electrum Wallet released today' }, meta: { hash: 'x' } }),
      'New version of the Marscoin Electrum Wallet released today',
    );
    assert.strictEqual(previewText({ displayName: '  Valles\n Marineris ' }), 'Valles Marineris');
    assert.strictEqual(previewText({ data: { post: 'x'.repeat(400) } }).length, 220);
    assert.strictEqual(previewText({ photo: 'Qm…' }), null);
    assert.strictEqual(previewText(null), null);
  });

  it('writes the UTC time, with the date when it is not the local one, and links to the live explorer', () => {
    const t = Date.UTC(2026, 3, 1, 2, 54);
    assert.strictEqual(utcStamp(t, new Date(Date.UTC(2026, 3, 1, 12))), '02:54 UTC');
    assert.strictEqual(utcStamp(t, { getDate: () => 31, getMonth: () => 2 }), 'APR 1 · 02:54 UTC');
    assert.strictEqual(explorerUrl('c851'), 'https://explore.marscoin.org/tx/c851');
    assert.strictEqual(shortAddress(OTHER), 'MVsv5e9W…L1a3X8KQJ');
  });
});
