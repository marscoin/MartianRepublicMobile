// Hash time-locked contracts for Marscoin <-> Bitcoin atomic swaps (IPAS).
// Wire-compatible with electrum_mars/atomic_swap_htlc.py: the same script on
// both chains, native P2WSH, HASH160 payment hash and an absolute CLTV height.
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../constants';

const OPS = bitcoin.opcodes;

export const BTC_NETWORK = bitcoin.networks.bitcoin;
export const MARS_NETWORK = { ...Marscoin.mainnet, bech32: 'mars' };

// Spends signal a final sequence below 0xffffffff so nLockTime is enforced.
const SEQUENCE = 0xfffffffe;

const isBytes = (value, length) => Buffer.isBuffer(value) && value.length === length;

export function hex(value, length, label) {
  if (typeof value !== 'string' || !/^([0-9a-f]{2})+$/.test(value) || value.length !== length * 2) {
    throw new Error(`Invalid ${label}.`);
  }
  return Buffer.from(value, 'hex');
}

export function buildHtlcScript({ hash160, recipientPubkey, senderPubkey, locktime }) {
  if (!isBytes(hash160, 20)) throw new Error('Invalid payment hash.');
  for (const key of [recipientPubkey, senderPubkey]) {
    if (!isBytes(key, 33) || (key[0] !== 2 && key[0] !== 3)) throw new Error('Invalid swap public key.');
  }
  // Heights only. Values of 500,000,000 and above would be read as timestamps.
  if (!Number.isSafeInteger(locktime) || locktime <= 0 || locktime >= 500000000) throw new Error('Invalid swap locktime.');
  return bitcoin.script.compile([
    OPS.OP_IF,
    OPS.OP_HASH160,
    hash160,
    OPS.OP_EQUALVERIFY,
    recipientPubkey,
    OPS.OP_CHECKSIG,
    OPS.OP_ELSE,
    bitcoin.script.number.encode(locktime),
    OPS.OP_CHECKLOCKTIMEVERIFY,
    OPS.OP_DROP,
    senderPubkey,
    OPS.OP_CHECKSIG,
    OPS.OP_ENDIF,
  ]);
}

export function htlcAddress(script, network) {
  return bitcoin.payments.p2wsh({ redeem: { output: script, network }, network }).address;
}

export function htlcOutputScript(script) {
  return bitcoin.payments.p2wsh({ redeem: { output: script } }).output;
}

// Electrum protocol script hash: sha256 of the output script, byte-reversed.
export function electrumScriptHash(outputScript) {
  return Buffer.from(bitcoin.crypto.sha256(outputScript)).reverse().toString('hex');
}

function spend({ script, txid, vout, value, fee, privkey, destination, network, locktime, witness }) {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(fee) || fee <= 0) throw new Error('Invalid swap amount.');
  const output = value - fee;
  // Below the dust limit a node will not relay the transaction.
  if (output < 546) throw new Error('The network fee is larger than the amount locked in this swap.');
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.locktime = locktime;
  tx.addInput(Buffer.from(txid, 'hex').reverse(), vout, SEQUENCE);
  tx.addOutput(bitcoin.address.toOutputScript(destination, network), output);
  const digest = tx.hashForWitnessV0(0, script, value, bitcoin.Transaction.SIGHASH_ALL);
  const key = bitcoin.ECPair.fromPrivateKey(privkey);
  const signature = bitcoin.script.signature.encode(key.sign(digest, true), bitcoin.Transaction.SIGHASH_ALL);
  tx.setWitness(0, witness(signature));
  return tx;
}

// Claim with the secret. `value` must be the actual amount of the output being
// spent: the signature commits to it, so an agreed amount is not sufficient.
export function buildClaimTx({ script, txid, vout, value, fee, preimage, privkey, destination, network }) {
  if (!isBytes(preimage, 32)) throw new Error('Invalid swap secret.');
  return spend({
    script,
    txid,
    vout,
    value,
    fee,
    privkey,
    destination,
    network,
    locktime: 0,
    witness: signature => [signature, preimage, Buffer.from([1]), script],
  });
}

// Reclaim after the timelock. Valid only once the chain reaches `locktime`.
export function buildRefundTx({ script, txid, vout, value, fee, locktime, privkey, destination, network }) {
  return spend({
    script,
    txid,
    vout,
    value,
    fee,
    privkey,
    destination,
    network,
    locktime,
    witness: signature => [signature, Buffer.alloc(0), script],
  });
}

// Find the secret in a transaction that claimed an HTLC. Matching the known
// hash directly means an unrelated 32-byte witness item can never be accepted.
export function extractPreimage(txHex, hash160) {
  let tx;
  try {
    tx = bitcoin.Transaction.fromHex(txHex);
  } catch {
    return null;
  }
  for (const input of tx.ins) {
    for (const item of input.witness) {
      if (item.length === 32 && bitcoin.crypto.hash160(item).equals(hash160)) return Buffer.from(item);
    }
  }
  return null;
}

// True when the transaction spends the given outpoint.
export function spendsOutpoint(txHex, txid, vout) {
  const hash = Buffer.from(txid, 'hex').reverse();
  return bitcoin.Transaction.fromHex(txHex).ins.some(input => input.index === vout && input.hash.equals(hash));
}

// Outputs of a raw transaction paying the given output script.
export function outputsPaying(txHex, outputScript) {
  const tx = bitcoin.Transaction.fromHex(txHex);
  return tx.outs
    .map((out, vout) => ({ txid: tx.getId(), vout, value: out.value, script: out.script }))
    .filter(out => out.script.equals(outputScript));
}

// Bitcoin merkle branch check for an Electrum `transaction.get_merkle` proof.
export function merkleRoot(txid, branch, position) {
  let node = Buffer.from(txid, 'hex').reverse();
  let index = position;
  for (const sibling of branch) {
    const other = Buffer.from(sibling, 'hex').reverse();
    // eslint-disable-next-line no-bitwise
    node = bitcoin.crypto.hash256(index & 1 ? Buffer.concat([other, node]) : Buffer.concat([node, other]));
    index = Math.floor(index / 2);
  }
  return Buffer.from(node).reverse().toString('hex');
}

// The merkle root sits at bytes 36..68 of a block header (AuxPoW data follows
// the first 80 bytes and does not move it).
export function headerMerkleRoot(headerHex) {
  const header = Buffer.from(headerHex, 'hex');
  if (header.length < 80) throw new Error('Invalid block header.');
  return Buffer.from(header.slice(36, 68)).reverse().toString('hex');
}
