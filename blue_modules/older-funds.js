// Find older funds.
//
// Earlier versions of the Republic's website wallet kept coins on other
// derivations of the same recovery words than the one this app uses. This
// module looks in those places and, when asked, moves what it finds to a
// receive address of the app's own wallet in one transaction.
//
// It only reads the wallet's recovery words (through the wallet's own
// accessors) and never changes the wallet: not its derivation, not its stored
// fields, not its address caches. Seeds and keys derived here live in memory
// only. Network access is passed in, so everything here can be tested
// against a fake.
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { Marscoin } from './constants';

const NETWORK = Marscoin.mainnet;

// The app's own derivation. Coins here are the wallet's ordinary balance and
// are never touched by this module.
export const STANDARD_PATH = "m/44'/2'/0'";

export const SCAN_CHUNK = 20; // addresses asked for at a time; also the gap
export const SCAN_MAX_PER_CHAIN = 200; // hard stop, per receive/change chain
export const DUST_LIMIT = 546; // zubrins; an output at or below this is refused
// About 15 kB: far below the 100 kB a transaction may be, and signing stays
// a matter of seconds on a phone. More coins than this take a second move.
export const MAX_SWEEP_INPUTS = 100;
const FEE_FLOOR_BOUND = 1000000; // 0.01 MARS

const SEED_STANDARD = 'standard';
const SEED_TRAILING_SPACE = 'trailing-space';

// The only account paths this module may derive. Ballot keys (m/999999'/...)
// and swap keys (m/1017'/...) can never match.
const ALLOWED_PATHS = ["m/44'/2'/0'", "m/44'/2'/0'/0'", "m/44'/107'/0'"];

const VARIATIONS = Object.freeze(
  [
    {
      id: 'extra-step',
      label: 'Earlier website wallet',
      description: 'Addresses the first website wallet made from your recovery words.',
      seed: SEED_STANDARD,
      path: "m/44'/2'/0'/0'",
    },
    {
      id: 'coin-107',
      label: 'Website wallet, second address set',
      description: 'A second set of addresses the website wallet used for a time.',
      seed: SEED_STANDARD,
      path: "m/44'/107'/0'",
    },
    {
      id: 'space',
      label: 'Words saved with an extra space',
      description: 'Addresses made when the website saved your recovery words with a space at the end.',
      seed: SEED_TRAILING_SPACE,
      path: "m/44'/2'/0'",
    },
    {
      id: 'space-extra-step',
      label: 'Extra space, earlier website wallet',
      description: 'The first website wallet’s addresses, from words saved with a space at the end.',
      seed: SEED_TRAILING_SPACE,
      path: "m/44'/2'/0'/0'",
    },
    {
      id: 'space-coin-107',
      label: 'Extra space, second address set',
      description: 'The second set of website addresses, from words saved with a space at the end.',
      seed: SEED_TRAILING_SPACE,
      path: "m/44'/107'/0'",
    },
  ].map(Object.freeze),
);

export class OlderFundsError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'OlderFundsError';
    this.code = code;
    // What actually went wrong, short enough to show under the message.
    this.detail = detail ? String(detail).slice(0, 160) : '';
  }
}

const NETWORK_MESSAGE = 'Could not reach the Marscoin network. Check your connection and try again.';
const networkError = cause => new OlderFundsError('OLDER_FUNDS_NETWORK', NETWORK_MESSAGE, cause?.message || cause);
const refuse = (code, message) => new OlderFundsError(code, message);

// Only a Marscoin wallet made from recovery words has older addresses to
// look at: not a watch-only wallet, not the Bitcoin wallet used for swaps.
export function isOlderFundsWallet(wallet) {
  try {
    return (
      !!wallet &&
      wallet.type === 'marscoin' &&
      typeof wallet._getSeed === 'function' &&
      typeof wallet.secret === 'string' &&
      bip39.validateMnemonic(wallet.secret)
    );
  } catch (_) {
    return false;
  }
}

// The places to look, in the order they are checked.
export function olderFundsVariations(wallet) {
  if (!isOlderFundsWallet(wallet)) return [];
  return VARIATIONS.slice();
}

const isStandardVariation = variation => variation.seed === SEED_STANDARD && variation.path === STANDARD_PATH;

function requireVariation(variation) {
  if (
    !variation ||
    !ALLOWED_PATHS.includes(variation.path) ||
    ![SEED_STANDARD, SEED_TRAILING_SPACE].includes(variation.seed) ||
    typeof variation.id !== 'string'
  ) {
    throw refuse('OLDER_FUNDS_INTERNAL', 'This is not one of the places older funds are kept.');
  }
  return variation;
}

// Turning words into a seed is slow on a phone. Each distinct seed is worked
// out once per wallet and kept here, in memory only.
const keyCache = new WeakMap();

function keysFor(wallet) {
  const mnemonic = wallet?.secret;
  const passphrase = wallet?.passphrase;
  let entry = wallet ? keyCache.get(wallet) : undefined;
  if (!entry || entry.mnemonic !== mnemonic || entry.passphrase !== passphrase) {
    if (!isOlderFundsWallet(wallet)) throw refuse('OLDER_FUNDS_WALLET', 'This wallet was not made from recovery words.');
    entry = {
      mnemonic,
      passphrase,
      roots: {},
      chains: new Map(),
      addresses: new Map(),
    };
    keyCache.set(wallet, entry);
  }
  return entry;
}

function rootFor(wallet, seedKind) {
  const entry = keysFor(wallet);
  if (!entry.roots[seedKind]) {
    let seed;
    if (seedKind === SEED_STANDARD) {
      seed = wallet._getSeed(); // the wallet's own seed, already cached by it
    } else if (seedKind === SEED_TRAILING_SPACE) {
      // The website once stored the words with one space after the last.
      seed = bip39.mnemonicToSeedSync(entry.mnemonic + ' ', entry.passphrase);
    } else {
      throw refuse('OLDER_FUNDS_INTERNAL', 'Unknown seed.');
    }
    entry.roots[seedKind] = bitcoin.bip32.fromSeed(seed, NETWORK);
  }
  return entry.roots[seedKind];
}

const isIndex = value => Number.isSafeInteger(value) && value >= 0 && value < 0x80000000;

function chainNode(wallet, seedKind, path, chain) {
  if (!ALLOWED_PATHS.includes(path)) throw refuse('OLDER_FUNDS_INTERNAL', 'This path is not used for older funds.');
  if (chain !== 0 && chain !== 1) throw refuse('OLDER_FUNDS_INTERNAL', 'Unknown address chain.');
  const entry = keysFor(wallet);
  const key = `${seedKind}|${path}|${chain}`;
  let node = entry.chains.get(key);
  if (!node) {
    node = rootFor(wallet, seedKind).derivePath(path).derive(chain);
    entry.chains.set(key, node);
  }
  return node;
}

function keyNode(wallet, seedKind, path, chain, index) {
  if (!isIndex(index)) throw refuse('OLDER_FUNDS_INTERNAL', 'Invalid address index.');
  return chainNode(wallet, seedKind, path, chain).derive(index);
}

const p2pkhAddress = publicKey => bitcoin.payments.p2pkh({ pubkey: publicKey, network: NETWORK }).address;

// Working out an address takes a phone a noticeable moment, so each one is
// worked out once and remembered (in memory only, like the seeds).
function addressAt(wallet, seedKind, path, chain, index) {
  const parent = chainNode(wallet, seedKind, path, chain); // validates path and chain
  if (!isIndex(index)) throw refuse('OLDER_FUNDS_INTERNAL', 'Invalid address index.');
  const { addresses } = keysFor(wallet);
  const key = `${seedKind}|${path}|${chain}|${index}`;
  let address = addresses.get(key);
  if (!address) {
    address = p2pkhAddress(parent.derive(index).publicKey);
    addresses.set(key, address);
  }
  return address;
}

// The address of one place: chain 0 is receive, chain 1 is change.
export function deriveOlderAddress(wallet, variation, chain, index) {
  requireVariation(variation);
  return addressAt(wallet, variation.seed, variation.path, chain, index);
}

// The app's own addresses, worked out here without touching the wallet's
// caches, as far as the scan has gone. Anything in this set is not "older".
function standardAddresses(wallet) {
  const known = new Set();
  let upTo = 0;
  return {
    extend(count) {
      for (; upTo < count; upTo++) {
        known.add(addressAt(wallet, SEED_STANDARD, STANDARD_PATH, 0, upTo));
        known.add(addressAt(wallet, SEED_STANDARD, STANDARD_PATH, 1, upTo));
      }
    },
    has: address => known.has(address) || wallet.weOwnAddress(address) === true,
  };
}

const isCoinValue = value => Number.isSafeInteger(value) && value > 0;
const isTxid = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function safeSum(values) {
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isSafeInteger(sum)) throw refuse('OLDER_FUNDS_INTERNAL', 'The amount is too large to handle safely.');
  }
  return sum;
}

async function ask(call) {
  try {
    return await call();
  } catch (cause) {
    throw networkError(cause);
  }
}

// History and balance for a batch of addresses. The server must answer for
// every one: a missing answer is a failure, never "unused".
async function lookUp(connection, addresses) {
  const histories = await ask(() => connection.multiGetHistoryByAddress(addresses));
  const balances = await ask(() => connection.multiGetBalanceByAddress(addresses));
  const used = [];
  for (const address of addresses) {
    const history = histories?.[address];
    const balance = balances?.addresses?.[address];
    if (
      !Array.isArray(history) ||
      !balance ||
      !Number.isFinite(Number(balance.confirmed)) ||
      !Number.isFinite(Number(balance.unconfirmed))
    ) {
      throw networkError('The server did not answer for every address.');
    }
    if (history.length > 0 || Number(balance.confirmed) !== 0 || Number(balance.unconfirmed) !== 0) used.push(address);
  }
  return used;
}

async function coinsOf(connection, addresses) {
  if (!addresses.length) return {};
  const listed = await ask(() => connection.multiGetUtxoByAddress(addresses));
  for (const address of addresses) {
    if (!Array.isArray(listed?.[address])) throw networkError('The server did not list the coins of every address.');
  }
  return listed;
}

/**
 * Look in every older place for coins.
 *
 * @param wallet      the Marscoin wallet whose recovery words are checked
 * @param connection  { multiGetHistoryByAddress, multiGetBalanceByAddress, multiGetUtxoByAddress }
 * @param onProgress  called as each place is started and finished
 * @param variations  the places to check; defaults to all of them
 * @returns {Promise<{variations: Array, coins: Array, confirmed: number, unconfirmed: number, total: number}>}
 *          amounts are exact whole zubrins
 * @throws OlderFundsError code OLDER_FUNDS_NETWORK when the network could not
 *         be asked. A failure is never reported as "nothing found".
 */
export async function scanOlderFunds({ wallet, connection, onProgress, variations }) {
  const places = (variations || olderFundsVariations(wallet)).map(requireVariation);
  if (!isOlderFundsWallet(wallet)) throw refuse('OLDER_FUNDS_WALLET', 'This wallet was not made from recovery words.');
  const standard = standardAddresses(wallet);
  const seen = new Set();
  const report = state => {
    if (typeof onProgress === 'function') onProgress(state);
  };

  const results = [];
  for (let place = 0; place < places.length; place++) {
    const variation = places[place];
    report({
      index: place,
      count: places.length,
      variation,
      state: 'checking',
    });
    const result = {
      variation,
      checked: { receive: 0, change: 0 },
      reachedLimit: false,
      skippedOwn: 0,
      ignoredCoins: 0,
      addresses: [],
      coins: [],
      confirmed: 0,
      unconfirmed: 0,
      total: 0,
    };

    for (const chain of [0, 1]) {
      for (let start = 0; start < SCAN_MAX_PER_CHAIN; start += SCAN_CHUNK) {
        standard.extend(start + SCAN_CHUNK);
        const where = new Map();
        for (let index = start; index < start + SCAN_CHUNK; index++) {
          const address = deriveOlderAddress(wallet, variation, chain, index);
          // The wallet's own coins, and anything already counted, are left alone.
          if (isStandardVariation(variation) || standard.has(address)) {
            result.skippedOwn++;
            continue;
          }
          if (seen.has(address)) continue;
          seen.add(address);
          where.set(address, index);
        }
        result.checked[chain === 0 ? 'receive' : 'change'] = start + SCAN_CHUNK;
        if (!where.size) break;

        const used = await lookUp(connection, [...where.keys()]);
        if (!used.length) break; // twenty unused addresses in a row: stop
        if (start + SCAN_CHUNK >= SCAN_MAX_PER_CHAIN) result.reachedLimit = true;

        const listed = await coinsOf(connection, used);
        for (const address of used) {
          const index = where.get(address);
          const path = `${variation.path}/${chain}/${index}`;
          const found = {
            address,
            chain,
            index,
            path,
            confirmed: 0,
            unconfirmed: 0,
          };
          for (const raw of listed[address]) {
            const txid = raw?.txid || raw?.txId || raw?.tx_hash;
            const vout = raw?.vout ?? raw?.tx_pos;
            const outpoint = `${txid}:${vout}`;
            if (!isCoinValue(raw?.value) || !isTxid(txid) || !isIndex(vout) || seen.has(outpoint)) {
              result.ignoredCoins++;
              continue;
            }
            seen.add(outpoint);
            const confirmed = Number.isSafeInteger(raw.height) && raw.height > 0;
            result.coins.push({
              txid,
              vout,
              value: raw.value,
              address,
              confirmed,
              height: confirmed ? raw.height : 0,
              variationId: variation.id,
              seed: variation.seed,
              accountPath: variation.path,
              chain,
              index,
              path,
            });
            if (confirmed) found.confirmed = safeSum([found.confirmed, raw.value]);
            else found.unconfirmed = safeSum([found.unconfirmed, raw.value]);
          }
          if (found.confirmed + found.unconfirmed > 0) result.addresses.push(found);
        }
      }
    }

    result.confirmed = safeSum(result.addresses.map(found => found.confirmed));
    result.unconfirmed = safeSum(result.addresses.map(found => found.unconfirmed));
    result.total = safeSum([result.confirmed, result.unconfirmed]);
    results.push(result);
    report({
      index: place,
      count: places.length,
      variation,
      state: 'done',
      total: result.total,
    });
  }

  const confirmed = safeSum(results.map(result => result.confirmed));
  const unconfirmed = safeSum(results.map(result => result.unconfirmed));
  return {
    variations: results,
    coins: results.flatMap(result => result.coins),
    confirmed,
    unconfirmed,
    total: safeSum([confirmed, unconfirmed]),
  };
}

// The coins one transaction will move: confirmed ones, largest first, no more
// than fit comfortably in a transaction. `waiting` counts unconfirmed coins
// and `left` those that have to wait for a second transaction.
export function selectSweepCoins(coins) {
  const confirmed = (coins || []).filter(coin => coin.confirmed === true);
  const ordered = confirmed.slice().sort((a, b) => b.value - a.value || (a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : a.vout - b.vout));
  return {
    coins: ordered.slice(0, MAX_SWEEP_INPUTS),
    left: Math.max(0, ordered.length - MAX_SWEEP_INPUTS),
    waiting: (coins || []).length - confirmed.length,
  };
}

function p2pkhScript(address) {
  let script;
  try {
    script = bitcoin.address.toOutputScript(address, NETWORK);
  } catch (_) {
    return null;
  }
  // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  const isP2pkh =
    script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac;
  return isP2pkh ? script : null;
}

const varintSize = count => (count < 253 ? 1 : 3);
// Largest a signed transaction of this shape can be: every input a P2PKH
// spend with a compressed key (148 bytes), one P2PKH output (34 bytes).
const sweepSize = inputs => 4 + varintSize(inputs) + inputs * 148 + 1 + 34 + 4;

// The most a sweep may pay in fees: 1% of what it moves, or 0.01 MARS,
// whichever is larger.
export const maxSweepFee = total => Math.max(Math.floor(total / 100), FEE_FLOOR_BOUND);

/**
 * Work out a transaction that spends every given coin to one address.
 * Nothing is signed or fetched here.
 *
 * @returns {{coins, destinationAddress, feeRate, size, total, fee, amount}}
 * @throws OlderFundsError OLDER_FUNDS_DUST when nothing worth sending is left
 *         after the fee, OLDER_FUNDS_FEE when the fee would be unreasonable.
 */
export function planSweep({ coins, destinationAddress, feeRate }) {
  if (!Array.isArray(coins) || coins.length === 0) throw refuse('OLDER_FUNDS_EMPTY', 'There are no coins to move.');
  if (coins.length > MAX_SWEEP_INPUTS) throw refuse('OLDER_FUNDS_TOO_MANY', 'There are too many coins for one transaction.');
  if (!p2pkhScript(destinationAddress)) throw refuse('OLDER_FUNDS_DESTINATION', 'The destination is not a valid Marscoin address.');
  if (typeof feeRate !== 'number' || !Number.isFinite(feeRate) || feeRate < 1) {
    throw refuse('OLDER_FUNDS_FEE', 'The network fee rate is not valid.');
  }
  const outpoints = new Set();
  for (const coin of coins) {
    const outpoint = `${coin?.txid}:${coin?.vout}`;
    if (
      !coin ||
      !isTxid(coin.txid) ||
      !isIndex(coin.vout) ||
      !isCoinValue(coin.value) ||
      !p2pkhScript(coin.address) ||
      outpoints.has(outpoint)
    ) {
      throw refuse('OLDER_FUNDS_COIN', 'One of the coins cannot be spent. Check again and retry.');
    }
    outpoints.add(outpoint);
  }

  const total = safeSum(coins.map(coin => coin.value));
  const size = sweepSize(coins.length);
  const fee = Math.ceil(size * feeRate);
  const amount = total - fee;
  if (!Number.isSafeInteger(fee) || fee <= 0) throw refuse('OLDER_FUNDS_FEE', 'The network fee could not be worked out.');
  if (amount <= DUST_LIMIT) {
    throw refuse('OLDER_FUNDS_DUST', 'These coins are worth less than the network fee to move them, so there is nothing to move.');
  }
  if (fee > maxSweepFee(total)) {
    throw refuse('OLDER_FUNDS_FEE', 'The network fee for this transaction would be unreasonably high. Nothing was sent.');
  }
  return {
    coins: coins.slice(),
    destinationAddress,
    feeRate,
    size,
    total,
    fee,
    amount,
  };
}

// Is this one of the wallet's own receive addresses (never a change address,
// never somebody else's)? Worked out from the seed, not from caches.
function isOwnReceiveAddress(wallet, address) {
  if (wallet.weOwnAddress(address) !== true) return false;
  const last = Math.max(0, Number(wallet.next_free_address_index) || 0) + (Number(wallet.gap_limit) || 20);
  for (let index = 0; index <= last; index++) {
    if (addressAt(wallet, SEED_STANDARD, STANDARD_PATH, 0, index) === address) return true;
  }
  return false;
}

/**
 * Build and sign the transaction that moves the given coins to a receive
 * address of the wallet. It is checked from scratch before it is returned and
 * is NOT broadcast: see broadcastSweep.
 *
 * @param wallet              the Marscoin wallet the coins belong to
 * @param coins               coins from scanOlderFunds (confirmed ones)
 * @param destinationAddress  a receive address of the same wallet
 * @param feeRate             zubrins per byte, at least 1
 * @param connection          { getTxHex(txid) }
 * @returns {Promise<{txHex, txid, total, fee, amount, size, inputs, destinationAddress}>}
 */
export async function buildSweepTransaction({ wallet, coins, destinationAddress, feeRate, connection }) {
  if (!isOlderFundsWallet(wallet)) throw refuse('OLDER_FUNDS_WALLET', 'This wallet was not made from recovery words.');
  const plan = planSweep({ coins, destinationAddress, feeRate });
  if (!isOwnReceiveAddress(wallet, destinationAddress)) {
    throw refuse('OLDER_FUNDS_DESTINATION', 'Older funds can only be moved to a receive address of this wallet.');
  }

  // Every coin must sit on one of the older places, at the address its
  // derivation gives, and must not be one of the wallet's ordinary coins.
  const keys = [];
  for (const coin of plan.coins) {
    const variation = VARIATIONS.find(item => item.id === coin.variationId);
    if (!variation || variation.seed !== coin.seed || variation.path !== coin.accountPath || isStandardVariation(variation)) {
      throw refuse('OLDER_FUNDS_COIN', 'One of the coins is not on an older address. Check again and retry.');
    }
    if (coin.confirmed !== true) throw refuse('OLDER_FUNDS_COIN', 'One of the coins is not confirmed yet. Wait for the next block.');
    const node = keyNode(wallet, variation.seed, variation.path, coin.chain, coin.index);
    if (p2pkhAddress(node.publicKey) !== coin.address || coin.path !== `${variation.path}/${coin.chain}/${coin.index}`) {
      throw refuse('OLDER_FUNDS_COIN', 'One of the coins does not match its address. Check again and retry.');
    }
    if (wallet.weOwnAddress(coin.address) === true) {
      throw refuse('OLDER_FUNDS_COIN', 'One of the coins is already in this wallet. Check again and retry.');
    }
    keys.push(node);
  }

  // The transactions the coins came from. Each must be the transaction the
  // coin names and must really pay that amount to that address.
  const previous = new Map();
  for (const coin of plan.coins) {
    if (!previous.has(coin.txid)) {
      const hex = await ask(() => connection.getTxHex(coin.txid));
      let parsed;
      try {
        parsed = bitcoin.Transaction.fromHex(hex);
      } catch (_) {
        parsed = null;
      }
      if (!parsed || parsed.getId() !== coin.txid)
        throw networkError('The server returned a different transaction than the one asked for.');
      previous.set(coin.txid, { hex, parsed });
    }
    const output = previous.get(coin.txid).parsed.outs[coin.vout];
    if (!output || output.value !== coin.value || !output.script.equals(p2pkhScript(coin.address))) {
      throw refuse('OLDER_FUNDS_COIN', 'One of the coins is not what the network first reported. Check again and retry.');
    }
  }

  const psbt = new bitcoin.Psbt({ network: NETWORK });
  psbt.setVersion(1);
  plan.coins.forEach(coin => {
    psbt.addInput({
      hash: coin.txid,
      index: coin.vout,
      sequence: 0xffffffff,
      nonWitnessUtxo: Buffer.from(previous.get(coin.txid).hex, 'hex'),
    });
  });
  psbt.addOutput({ address: destinationAddress, value: plan.amount });
  plan.coins.forEach((coin, input) => {
    psbt.signInput(
      input,
      bitcoin.ECPair.fromPrivateKey(keys[input].privateKey, {
        network: NETWORK,
      }),
    );
  });
  const txHex = psbt.finalizeAllInputs().extractTransaction().toHex();

  const previousHex = new Map([...previous].map(([txid, entry]) => [txid, entry.hex]));
  return verifySweepTransaction({ txHex, plan, previousHex });
}

/**
 * Read a signed sweep back from its bytes and check all of it. Nothing here
 * trusts the code that built it.
 *
 * @param txHex        the signed transaction
 * @param plan         what planSweep returned
 * @param previousHex  Map of txid -> hex of the transactions being spent from
 * @throws OlderFundsError OLDER_FUNDS_INTERNAL on any mismatch
 */
export function verifySweepTransaction({ txHex, plan, previousHex }) {
  const fail = () => refuse('OLDER_FUNDS_INTERNAL', 'The transaction did not pass its safety checks. Nothing was sent.');
  let tx;
  const previous = new Map();
  try {
    tx = bitcoin.Transaction.fromHex(txHex);
    for (const [txid, hex] of previousHex) {
      const parsed = bitcoin.Transaction.fromHex(hex);
      if (parsed.getId() !== txid) throw fail();
      previous.set(txid, { parsed });
    }
  } catch (_) {
    throw fail();
  }
  if (tx.ins.length !== plan.coins.length || tx.outs.length !== 1) throw fail();

  const expected = new Map(plan.coins.map(coin => [`${coin.txid}:${coin.vout}`, coin]));
  let inputTotal = 0;
  tx.ins.forEach((input, position) => {
    const txid = Buffer.from(input.hash).reverse().toString('hex');
    const coin = expected.get(`${txid}:${input.index}`);
    if (!coin) throw fail(); // not one of the scanned coins, or spent twice
    expected.delete(`${txid}:${input.index}`);
    const output = previous.get(txid)?.parsed.outs[input.index];
    if (!output || output.value !== coin.value) throw fail();
    inputTotal = safeSum([inputTotal, output.value]);

    const parts = bitcoin.script.decompile(input.script);
    if (!parts || parts.length !== 2 || !Buffer.isBuffer(parts[0]) || !Buffer.isBuffer(parts[1])) throw fail();
    const [encoded, publicKey] = parts;
    if (!output.script.equals(p2pkhScript(p2pkhAddress(publicKey)))) throw fail();
    let valid = false;
    try {
      const { signature, hashType } = bitcoin.script.signature.decode(encoded);
      const digest = tx.hashForSignature(position, output.script, hashType);
      valid = hashType === bitcoin.Transaction.SIGHASH_ALL && bitcoin.ECPair.fromPublicKey(publicKey).verify(digest, signature);
    } catch (_) {
      valid = false;
    }
    if (!valid) throw fail();
  });
  if (expected.size !== 0) throw fail();

  const [output] = tx.outs;
  let paidTo;
  try {
    paidTo = bitcoin.address.fromOutputScript(output.script, NETWORK);
  } catch (_) {
    throw fail();
  }
  const fee = inputTotal - output.value;
  const size = tx.byteLength();
  if (paidTo !== plan.destinationAddress || output.value !== plan.amount || output.value <= DUST_LIMIT) throw fail();
  if (inputTotal !== plan.total || fee !== plan.fee || fee <= 0 || fee > maxSweepFee(inputTotal)) throw fail();
  // The fee was worked out for the largest possible size, so the real rate
  // is never below the one asked for.
  if (size > plan.size || fee < size) throw fail();

  return {
    txHex,
    txid: tx.getId(),
    total: inputTotal,
    fee,
    amount: output.value,
    size,
    inputs: tx.ins.length,
    destinationAddress: paidTo,
  };
}

/**
 * Send a signed sweep to the network, once. There is no retry here: when the
 * answer is unclear the caller must look before trying again.
 *
 * @param connection  { broadcastV2(hex) }
 * @returns {Promise<string>} the transaction id
 */
export async function broadcastSweep({ connection, txHex, txid }) {
  if (typeof txHex !== 'string' || !isTxid(txid) || bitcoin.Transaction.fromHex(txHex).getId() !== txid) {
    throw refuse('OLDER_FUNDS_INTERNAL', 'The transaction is not valid. Nothing was sent.');
  }
  let answer;
  try {
    answer = await connection.broadcastV2(txHex);
  } catch (cause) {
    throw new OlderFundsError('OLDER_FUNDS_BROADCAST', 'The network did not accept the transaction.', cause?.message || cause);
  }
  if (answer !== txid) {
    throw new OlderFundsError(
      'OLDER_FUNDS_BROADCAST',
      'The network gave an unexpected answer. Check again in a few minutes before retrying.',
      typeof answer === 'string' ? answer : '',
    );
  }
  return txid;
}
