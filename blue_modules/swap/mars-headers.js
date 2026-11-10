// Proof-of-work verification for Marscoin block headers.
//
// Marscoin is merge-mined: a block is usually secured not by hashing its own
// header but by a parent-chain block (scrypt) whose coinbase commits to the
// Marscoin block hash. Checking that work on the phone means a server cannot
// simply invent the block that contains a swap's Marscoin lock; it would have
// to mine it.
//
// This is not a full light client. Difficulty adjustment is not re-derived, so
// a floor on the claimed difficulty stands in for it: far below the chain's
// real difficulty, but high enough that every forged block costs real mining.
import * as bitcoin from 'bitcoinjs-lib';

const scrypt = require('scryptsy');

const AUXPOW_FLAG = 0x100;
export const MARS_CHAIN_ID = 0x029c;
const MERGED_MINING_MAGIC = Buffer.from('fabe6d6d', 'hex');
// The network ran at a difficulty of roughly 70,000 to 130,000 in late 2026.
export const MIN_DIFFICULTY = 8000;
// Target of difficulty 1 (compact 0x1d00ffff), the scale nodes report difficulty on.
const DIFFICULTY_ONE = BigInt('0x00000000ffff0000000000000000000000000000000000000000000000000000');

const reversedHex = buffer => Buffer.from(buffer).reverse().toString('hex');
const big = buffer => BigInt(`0x${reversedHex(buffer) || '0'}`);

export function bitsToTarget(bits) {
  // eslint-disable-next-line no-bitwise
  const exponent = bits >>> 24;
  // eslint-disable-next-line no-bitwise
  const mantissa = BigInt(bits & 0x007fffff);
  // eslint-disable-next-line no-bitwise
  if (bits & 0x00800000 || mantissa === 0n) throw new Error('Invalid block header.');
  return exponent <= 3 ? mantissa >> BigInt(8 * (3 - exponent)) : mantissa << BigInt(8 * (exponent - 3));
}

export const targetDifficulty = target => Number((DIFFICULTY_ONE * 1000n) / target) / 1000;

const scryptHash = header80 => scrypt(header80, header80, 1024, 1, 1, 32);

function merkleUp(leaf, branch, index) {
  let node = leaf;
  let position = index;
  for (const sibling of branch) {
    // eslint-disable-next-line no-bitwise
    node = bitcoin.crypto.hash256(position & 1 ? Buffer.concat([sibling, node]) : Buffer.concat([node, sibling]));
    // eslint-disable-next-line no-bitwise
    position >>= 1;
  }
  return node;
}

function readVarInt(buffer, offset) {
  const first = buffer[offset];
  if (first < 0xfd) return { value: first, offset: offset + 1 };
  if (first === 0xfd) return { value: buffer.readUInt16LE(offset + 1), offset: offset + 3 };
  throw new Error('Invalid block header.');
}

function readBranch(buffer, start) {
  let { value: count, offset } = readVarInt(buffer, start);
  if (count > 32) throw new Error('Invalid block header.');
  const hashes = [];
  for (let i = 0; i < count; i++) {
    hashes.push(buffer.slice(offset, offset + 32));
    offset += 32;
  }
  const index = buffer.readInt32LE(offset);
  return { hashes, index, offset: offset + 4 };
}

// Splits a serialised header into its fixed part and, for merge-mined blocks,
// the proof that a parent-chain block committed to it.
export function parseHeader(hex) {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length < 80) throw new Error('Invalid block header.');
  const base = raw.slice(0, 80);
  const version = base.readInt32LE(0);
  const header = {
    base,
    version,
    hash: bitcoin.crypto.hash256(base),
    previous: base.slice(4, 36),
    merkleRoot: reversedHex(base.slice(36, 68)),
    time: base.readUInt32LE(68),
    bits: base.readUInt32LE(72),
    auxpow: null,
  };
  // eslint-disable-next-line no-bitwise
  if (!(version & AUXPOW_FLAG)) {
    if (raw.length !== 80) throw new Error('Invalid block header.');
    return header;
  }
  // eslint-disable-next-line no-bitwise
  if (version >>> 16 !== MARS_CHAIN_ID) throw new Error('This block header is for another chain.');
  const coinbase = bitcoin.Transaction.fromBuffer(raw.slice(80), true);
  let offset = 80 + coinbase.byteLength();
  offset += 32; // parent block hash, unused (derived from the parent header below)
  const coinbaseBranch = readBranch(raw, offset);
  const chainBranch = readBranch(raw, coinbaseBranch.offset);
  const parent = raw.slice(chainBranch.offset, chainBranch.offset + 80);
  if (parent.length !== 80 || chainBranch.offset + 80 !== raw.length) throw new Error('Invalid block header.');
  header.auxpow = { coinbase, coinbaseBranch, chainBranch, parent };
  return header;
}

// The slot a chain must occupy in a merged-mining tree, so that one unit of
// parent work cannot be counted for the same chain twice.
function expectedChainIndex(nonce, chainId, height) {
  // eslint-disable-next-line no-bitwise
  let rand = (BigInt(nonce) * 1103515245n + 12345n) & 0xffffffffn;
  rand += BigInt(chainId);
  // eslint-disable-next-line no-bitwise
  rand = (rand * 1103515245n + 12345n) & 0xffffffffn;
  // eslint-disable-next-line no-bitwise
  return Number(rand % (1n << BigInt(height)));
}

// Throws unless the header carries valid proof of work at or above the floor.
export function assertHeaderWork(header, minDifficulty = MIN_DIFFICULTY) {
  const target = bitsToTarget(header.bits);
  if (targetDifficulty(target) < minDifficulty) throw new Error('The block claims too little proof of work.');
  if (!header.auxpow) {
    if (big(scryptHash(header.base)) > target) throw new Error('The block lacks proof of work.');
    return;
  }
  const { coinbase, coinbaseBranch, chainBranch, parent } = header.auxpow;
  // The parent block must not itself be a block of this chain.
  // eslint-disable-next-line no-bitwise
  if (parent.readInt32LE(0) >>> 16 === MARS_CHAIN_ID) throw new Error('The block lacks proof of work.');
  // 1. The parent block's coinbase is in the parent block, as its first transaction.
  if (coinbaseBranch.index !== 0) throw new Error('The block lacks proof of work.');
  if (!merkleUp(coinbase.getHash(), coinbaseBranch.hashes, 0).equals(parent.slice(36, 68)))
    throw new Error('The block lacks proof of work.');
  // 2. That coinbase commits to this block: the merged-mining marker followed
  //    by the root of a tree containing our block hash at the required slot.
  const chainRoot = Buffer.from(merkleUp(header.hash, chainBranch.hashes, chainBranch.index)).reverse();
  const script = coinbase.ins[0].script;
  const marker = script.indexOf(MERGED_MINING_MAGIC);
  if (marker < 0 || script.indexOf(MERGED_MINING_MAGIC, marker + 4) >= 0) throw new Error('The block lacks proof of work.');
  const commitment = script.slice(marker + 4);
  if (commitment.length < 40 || !commitment.slice(0, 32).equals(chainRoot)) throw new Error('The block lacks proof of work.');
  const size = commitment.readUInt32LE(32);
  const nonce = commitment.readUInt32LE(36);
  const height = chainBranch.hashes.length;
  // eslint-disable-next-line no-bitwise
  if (size !== 1 << height || chainBranch.index !== expectedChainIndex(nonce, MARS_CHAIN_ID, height)) {
    throw new Error('The block lacks proof of work.');
  }
  // 3. The parent block's own hash meets this block's target.
  if (big(scryptHash(parent)) > target) throw new Error('The block lacks proof of work.');
}

// Verifies consecutive headers: each has valid work and builds on the one
// before. Returns the parsed headers.
export function verifyHeaderChain(headersHex, minDifficulty = MIN_DIFFICULTY) {
  const headers = headersHex.map(parseHeader);
  headers.forEach((header, index) => {
    assertHeaderWork(header, minDifficulty);
    if (index > 0 && !header.previous.equals(headers[index - 1].hash)) throw new Error('The blocks do not form a chain.');
  });
  return headers;
}
