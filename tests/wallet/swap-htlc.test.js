import * as bitcoin from 'bitcoinjs-lib';
import {
  BTC_NETWORK,
  MARS_NETWORK,
  buildClaimTx,
  buildHtlcScript,
  buildRefundTx,
  electrumScriptHash,
  extractPreimage,
  headerMerkleRoot,
  htlcAddress,
  htlcOutputScript,
  merkleRoot,
  outputsPaying,
  spendsOutpoint,
} from '../../blue_modules/swap/htlc';

// Vectors produced offline by the Electrum-Mars reference implementation
// (electrum_mars/atomic_swap_htlc.py). Nothing here was ever broadcast.
const preimage = Buffer.from([...Array(32).keys()]);
const makerKey = Buffer.alloc(32, 1);
const takerKey = Buffer.alloc(32, 2);
const maker = bitcoin.ECPair.fromPrivateKey(makerKey).publicKey;
const taker = bitcoin.ECPair.fromPrivateKey(takerKey).publicKey;
const hash160 = bitcoin.crypto.hash160(preimage);
const MARS_SCRIPT =
  '63a914ea4beb47def8492389a1e16634795441e1b872458821024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac670374e836b17521031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fac68';
const BTC_SCRIPT =
  '63a914ea4beb47def8492389a1e16634795441e1b872458821031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fac670386e10eb17521024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac68';
const MARS_ADDRESS = 'mars1qn3whadz4r8w2jpfn0wrp5dg4grccuyxzp5sxxl5khxp579eegexqm9anzr';
const BTC_ADDRESS = 'bc1qvacw248n8qjszvjkxm27ctt4eq5aqamdvagvh7grjjcp978rugzqaf0g7k';
const MARS_CLAIM =
  '0200000000010111111111111111111111111111111111111111111111111111111111111111110000000000feffffff01e0ef34a4010000002200209c5d7eb45519dca905337b861a351540f18e10c20d20637e96b9834f1739464c04473044022038cd4b29a761e445d1c188d285757479fbdfafddf86c7bc5cad5e8ed33e211b402207251454dd68ecd66b74e0b8bb49063391b952e4e20bd4c9119cbfe5efd7e2ea20120000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01016663a914ea4beb47def8492389a1e16634795441e1b872458821024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac670374e836b17521031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fac6800000000';
const BTC_REFUND =
  '0200000000010111111111111111111111111111111111111111111111111111111111111111110100000000feffffff01971700000000000016001432d702d8186a958b538160ee228a11467bc4875a0347304402202b0d9203ce91bf7af1336bbbad2f7f8c05ae6da9f868a300e50535d31de796d4022029c0a5a96c2df3ccb06901b628c64e699aa5e1ba29df5406cf50883630c86e7601006663a914ea4beb47def8492389a1e16634795441e1b872458821031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fac670386e10eb17521024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6886e10e00';
const PREVOUT = '11'.repeat(32);

const marsScript = () => buildHtlcScript({ hash160, recipientPubkey: taker, senderPubkey: maker, locktime: 3598452 });
const btcScript = () => buildHtlcScript({ hash160, recipientPubkey: maker, senderPubkey: taker, locktime: 975238 });

function verifies(tx, script, value, pubkey) {
  const signature = bitcoin.script.signature.decode(tx.ins[0].witness[0]);
  const digest = tx.hashForWitnessV0(0, script, value, signature.hashType);
  return bitcoin.ECPair.fromPublicKey(pubkey).verify(digest, signature.signature);
}

describe('Atomic swap contracts', () => {
  it('builds the reference scripts and addresses on both chains', () => {
    expect(hash160.toString('hex')).toBe('ea4beb47def8492389a1e16634795441e1b87245');
    expect(marsScript().toString('hex')).toBe(MARS_SCRIPT);
    expect(btcScript().toString('hex')).toBe(BTC_SCRIPT);
    expect(htlcAddress(marsScript(), MARS_NETWORK)).toBe(MARS_ADDRESS);
    expect(htlcAddress(btcScript(), BTC_NETWORK)).toBe(BTC_ADDRESS);
  });

  it('claims Marscoin with the secret exactly as the reference client does', () => {
    const tx = buildClaimTx({
      script: marsScript(),
      txid: PREVOUT,
      vout: 0,
      value: 7050000000,
      fee: 100000,
      preimage,
      privkey: takerKey,
      destination: MARS_ADDRESS,
      network: MARS_NETWORK,
    });
    expect(verifies(tx, marsScript(), 7050000000, taker)).toBe(true);
    expect(tx.toHex()).toBe(MARS_CLAIM);
  });

  it('refunds Bitcoin after the timelock exactly as the reference client does', () => {
    const tx = buildRefundTx({
      script: btcScript(),
      txid: PREVOUT,
      vout: 1,
      value: 6239,
      fee: 200,
      locktime: 975238,
      privkey: takerKey,
      destination: 'bc1qxtts9kqcd22ck5upvrhz9zs3geaufp66my95e6',
      network: BTC_NETWORK,
    });
    expect(tx.locktime).toBe(975238);
    expect(tx.ins[0].sequence).toBe(0xfffffffe);
    expect(verifies(tx, btcScript(), 6239, taker)).toBe(true);
    expect(tx.toHex()).toBe(BTC_REFUND);
  });

  it('can pay a claim to a legacy Marscoin address', () => {
    const tx = buildClaimTx({
      script: marsScript(),
      txid: PREVOUT,
      vout: 0,
      value: 7050000000,
      fee: 100000,
      preimage,
      privkey: takerKey,
      destination: 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1',
      network: MARS_NETWORK,
    });
    expect(tx.outs[0].script.toString('hex')).toMatch(/^76a914[0-9a-f]{40}88ac$/);
  });

  it('signs for the real output value, so an overpaid contract stays spendable', () => {
    const tx = buildClaimTx({
      script: marsScript(),
      txid: PREVOUT,
      vout: 0,
      value: 7050000001,
      fee: 100000,
      preimage,
      privkey: takerKey,
      destination: MARS_ADDRESS,
      network: MARS_NETWORK,
    });
    expect(verifies(tx, marsScript(), 7050000001, taker)).toBe(true);
    expect(verifies(tx, marsScript(), 7050000000, taker)).toBe(false);
  });

  it('extracts the secret only when it matches the payment hash', () => {
    expect(extractPreimage(MARS_CLAIM, hash160)).toEqual(preimage);
    expect(extractPreimage(MARS_CLAIM, Buffer.alloc(20, 7))).toBeNull();
    expect(extractPreimage(BTC_REFUND, hash160)).toBeNull();
    expect(extractPreimage('not a transaction', hash160)).toBeNull();
  });

  it('recognises which outpoint a transaction spends and which outputs pay a contract', () => {
    expect(spendsOutpoint(BTC_REFUND, PREVOUT, 1)).toBe(true);
    expect(spendsOutpoint(BTC_REFUND, PREVOUT, 0)).toBe(false);
    const paying = outputsPaying(MARS_CLAIM, htlcOutputScript(marsScript()));
    expect(paying).toHaveLength(1);
    expect(paying[0]).toMatchObject({ vout: 0, value: 7049900000 });
    expect(outputsPaying(MARS_CLAIM, htlcOutputScript(btcScript()))).toHaveLength(0);
  });

  it('rejects malformed contract terms and fees that swallow the amount', () => {
    expect(() => buildHtlcScript({ hash160: Buffer.alloc(19), recipientPubkey: taker, senderPubkey: maker, locktime: 10 })).toThrow('hash');
    expect(() => buildHtlcScript({ hash160, recipientPubkey: Buffer.alloc(33), senderPubkey: maker, locktime: 10 })).toThrow('public key');
    expect(() => buildHtlcScript({ hash160, recipientPubkey: taker, senderPubkey: maker, locktime: 1700000000 })).toThrow('locktime');
    expect(() => buildHtlcScript({ hash160, recipientPubkey: taker, senderPubkey: maker, locktime: 0 })).toThrow('locktime');
    expect(() =>
      buildRefundTx({
        script: btcScript(),
        txid: PREVOUT,
        vout: 1,
        value: 6239,
        fee: 6000,
        locktime: 975238,
        privkey: takerKey,
        destination: 'bc1qxtts9kqcd22ck5upvrhz9zs3geaufp66my95e6',
        network: BTC_NETWORK,
      }),
    ).toThrow('larger than the amount');
  });

  it('checks an Electrum merkle proof against a block header', () => {
    // Bitcoin block 100000: four transactions.
    const txids = [
      '8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87',
      'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4',
      '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4',
      'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d',
    ];
    const root = 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766';
    const le = id => Buffer.from(id, 'hex').reverse();
    const be = buffer => Buffer.from(buffer).reverse().toString('hex');
    const pair = (a, b) => be(bitcoin.crypto.hash256(Buffer.concat([le(a), le(b)])));
    expect(merkleRoot(txids[2], [txids[3], pair(txids[0], txids[1])], 2)).toBe(root);
    expect(merkleRoot(txids[2], [txids[3], pair(txids[0], txids[1])], 3)).not.toBe(root);
    const header = Buffer.concat([Buffer.alloc(36), le(root), Buffer.alloc(12)]).toString('hex');
    expect(headerMerkleRoot(header)).toBe(root);
    expect(() => headerMerkleRoot('00')).toThrow('header');
  });

  it('derives the Electrum script hash of a contract', () => {
    expect(electrumScriptHash(htlcOutputScript(marsScript()))).toMatch(/^[0-9a-f]{64}$/);
    expect(htlcOutputScript(marsScript()).toString('hex')).toBe('00209c5d7eb45519dca905337b861a351540f18e10c20d20637e96b9834f1739464c');
  });
});
