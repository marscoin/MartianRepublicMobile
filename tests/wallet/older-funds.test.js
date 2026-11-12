// Find older funds: derivations, scanning, sweep planning and signing.
// The network is a fake in this file; BIP39, BIP32, secp256k1 and transaction
// signing are real.
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { Marscoin } from '../../blue_modules/constants';
import { MarsElectrumWallet } from '../../screen/wallets/mars-wallet';
import {
  DUST_LIMIT,
  MAX_SWEEP_INPUTS,
  SCAN_MAX_PER_CHAIN,
  broadcastSweep,
  buildSweepTransaction,
  deriveOlderAddress,
  isOlderFundsWallet,
  maxSweepFee,
  olderFundsVariations,
  planSweep,
  scanOlderFunds,
  selectSweepCoins,
  verifySweepTransaction,
} from '../../blue_modules/older-funds';

jest.mock('../../class', () => ({ HDLegacyP2PKHWallet: class {} }));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({
  AbstractHDElectrumWallet: { defaultRBFSequence: 0xfffffffd },
}));
// The wallet's own network module must never be reached from here.
jest.mock('../../blue_modules/MARSConnection', () => ({}));
jest.mock('../../class/rng', () => ({
  randomBytes: async size => require('crypto').randomBytes(size),
}));

// Key derivation and signing run in plain JavaScript here and are slow.
jest.setTimeout(180000);

// Public BIP39 test vector. Never use this mnemonic for funds.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const network = Marscoin.mainnet;
const newWallet = (passphrase = '') => {
  const wallet = new MarsElectrumWallet();
  wallet.setSecret(mnemonic);
  if (passphrase) wallet.setPassphrase(passphrase);
  return wallet;
};
// Working out addresses is slow under jest, and the module remembers them per
// wallet, so the tests that do not change the wallet share one.
let shared;
const sharedWallet = () => (shared = shared || newWallet());
const variation = (wallet, id) => olderFundsVariations(wallet).find(item => item.id === id);

// Derivation done here from first principles, independently of the module.
const independentNode = (words, fullPath, passphrase = '') =>
  bitcoin.bip32.fromSeed(bip39.mnemonicToSeedSync(words, passphrase), network).derivePath(fullPath);
const independentAddress = (words, fullPath, passphrase) =>
  bitcoin.payments.p2pkh({
    pubkey: independentNode(words, fullPath, passphrase).publicKey,
    network,
  }).address;

// A pretend Electrum server. `ledger[address] = { history: n, coins: [...] }`.
function fakeConnection(ledger = {}) {
  const asked = { history: [], balance: [], utxo: [] };
  const connection = {
    asked,
    multiGetHistoryByAddress: jest.fn(async addresses => {
      asked.history.push(...addresses);
      const ret = {};
      for (const address of addresses) {
        const entry = ledger[address];
        const count = entry ? (entry.history ?? entry.coins?.length ?? 0) : 0;
        ret[address] = Array.from({ length: count }, (_, i) => ({
          tx_hash: 'ab'.repeat(32),
          height: 100 + i,
          address,
        }));
      }
      return ret;
    }),
    multiGetBalanceByAddress: jest.fn(async addresses => {
      asked.balance.push(...addresses);
      const ret = { balance: 0, unconfirmed_balance: 0, addresses: {} };
      for (const address of addresses) {
        const coins = (ledger[address]?.coins || []).filter(coin => Number.isSafeInteger(coin.value));
        ret.addresses[address] = {
          confirmed: coins.filter(coin => coin.height > 0).reduce((sum, coin) => sum + coin.value, 0),
          unconfirmed: coins.filter(coin => !(coin.height > 0)).reduce((sum, coin) => sum + coin.value, 0),
        };
      }
      return ret;
    }),
    // Same shape as MARSConnection.multiGetUtxoByAddress.
    multiGetUtxoByAddress: jest.fn(async addresses => {
      asked.utxo.push(...addresses);
      const ret = {};
      for (const address of addresses) {
        ret[address] = (ledger[address]?.coins || []).map(coin => ({
          ...coin,
          address,
        }));
      }
      return ret;
    }),
  };
  return connection;
}

// A transaction that pays `value` to `address`, as the chain would hold it.
let fixtureCounter = 0;
function fundingTx(address, value, extraOutputs = []) {
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, ++fixtureCounter), 0);
  for (const [extraAddress, extraValue] of extraOutputs) tx.addOutput(bitcoin.address.toOutputScript(extraAddress, network), extraValue);
  tx.addOutput(bitcoin.address.toOutputScript(address, network), value);
  return tx;
}
// A coin on the fake server for that transaction's last output.
const serverCoin = (tx, height = 1000) => ({
  txId: tx.getId(),
  vout: tx.outs.length - 1,
  value: tx.outs[tx.outs.length - 1].value,
  height,
});

let logs;
beforeEach(() => {
  logs = ['log', 'warn', 'error'].map(level => jest.spyOn(console, level).mockImplementation(() => {}));
});
afterEach(() => {
  logs.forEach(log => expect(log).not.toHaveBeenCalled());
  jest.restoreAllMocks();
});

describe('where older funds are looked for', () => {
  it('lists the five places, none of them the wallet’s own derivation', () => {
    const wallet = sharedWallet();
    const places = olderFundsVariations(wallet);
    expect(places.map(place => [place.id, place.seed, place.path])).toEqual([
      ['extra-step', 'standard', "m/44'/2'/0'/0'"],
      ['coin-107', 'standard', "m/44'/107'/0'"],
      ['space', 'trailing-space', "m/44'/2'/0'"],
      ['space-extra-step', 'trailing-space', "m/44'/2'/0'/0'"],
      ['space-coin-107', 'trailing-space', "m/44'/107'/0'"],
    ]);
    for (const place of places) {
      expect(place.label).toBeTruthy();
      expect(place.description).toBeTruthy();
      expect(place.seed === 'standard' && place.path === wallet.getDerivationPath()).toBe(false);
      expect(place.path).not.toMatch(/999999|1017/);
    }
  });

  it.each([
    ['extra-step', 0, 0, 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR', mnemonic, "m/44'/2'/0'/0'/0/0"],
    ['coin-107', 0, 0, 'MPfb4NUfbgswmwiEoP4njzY9XoFz3ZntQ5', mnemonic, "m/44'/107'/0'/0/0"],
    ['space', 0, 0, 'MA2xLQxc7HYQzieY4kyQFmKwND4wvbCSBL', mnemonic + ' ', "m/44'/2'/0'/0/0"],
    ['space-extra-step', 0, 0, null, mnemonic + ' ', "m/44'/2'/0'/0'/0/0"],
    ['space-coin-107', 0, 0, null, mnemonic + ' ', "m/44'/107'/0'/0/0"],
    ['extra-step', 1, 7, null, mnemonic, "m/44'/2'/0'/0'/1/7"],
    ['coin-107', 1, 3, null, mnemonic, "m/44'/107'/0'/1/3"],
    ['space', 1, 0, null, mnemonic + ' ', "m/44'/2'/0'/1/0"],
    ['space-extra-step', 1, 19, null, mnemonic + ' ', "m/44'/2'/0'/0'/1/19"],
    ['space-coin-107', 0, 25, null, mnemonic + ' ', "m/44'/107'/0'/0/25"],
  ])('derives %s chain %i index %i', (id, chain, index, known, words, fullPath) => {
    const wallet = sharedWallet();
    const address = deriveOlderAddress(wallet, variation(wallet, id), chain, index);
    expect(address).toBe(independentAddress(words, fullPath));
    if (known) expect(address).toBe(known);
    expect(address[0]).toBe('M');
  });

  it('pins the first receive address of every place for the public test vector', () => {
    const wallet = sharedWallet();
    expect(olderFundsVariations(wallet).map(place => deriveOlderAddress(wallet, place, 0, 0))).toEqual([
      'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR',
      'MPfb4NUfbgswmwiEoP4njzY9XoFz3ZntQ5',
      'MA2xLQxc7HYQzieY4kyQFmKwND4wvbCSBL',
      'MJYogemjCL9EWg4HCnrrySE7tvcWmZWfso',
      'MFxbga7dhuEL37qWrVfHmo76etK13MYJHD',
    ]);
  });

  it('really derives a different seed from the words with a trailing space', () => {
    const plain = bip39.mnemonicToSeedSync(mnemonic);
    const spaced = bip39.mnemonicToSeedSync(mnemonic + ' ');
    expect(spaced.equals(plain)).toBe(false);
    const wallet = sharedWallet();
    expect(deriveOlderAddress(wallet, variation(wallet, 'space'), 0, 0)).not.toBe(wallet._getExternalAddressByIndex(0));
    // The app trims what is typed, so its own wallet can never land there.
    const typedWithSpace = new MarsElectrumWallet();
    typedWithSpace.setSecret(mnemonic + ' ');
    expect(typedWithSpace._getExternalAddressByIndex(0)).toBe('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
  });

  it('follows the wallet’s passphrase', () => {
    const wallet = newWallet('TREZOR');
    for (const place of olderFundsVariations(wallet)) {
      const words = place.seed === 'trailing-space' ? mnemonic + ' ' : mnemonic;
      expect(deriveOlderAddress(wallet, place, 0, 0)).toBe(independentAddress(words, `${place.path}/0/0`, 'TREZOR'));
      expect(deriveOlderAddress(wallet, place, 0, 0)).not.toBe(deriveOlderAddress(sharedWallet(), place, 0, 0));
    }
  });

  it('leaves the wallet exactly as it was: same civic address, nothing stored on it', async () => {
    const wallet = sharedWallet();
    wallet.weOwnAddress('prime the wallet’s own address cache');
    const before = {
      keys: Object.keys(wallet).sort(),
      json: JSON.stringify(wallet),
      xpub: wallet.getXpub(),
    };
    await scanOlderFunds({ wallet, connection: fakeConnection() });
    for (const place of olderFundsVariations(wallet)) deriveOlderAddress(wallet, place, 1, 5);
    expect(Object.keys(wallet).sort()).toEqual(before.keys);
    expect(JSON.stringify(wallet)).toBe(before.json);
    expect(wallet.secret).toBe(mnemonic);
    expect(wallet.getDerivationPath()).toBe("m/44'/2'/0'");
    expect(wallet.getXpub()).toBe(before.xpub);
    expect(wallet._getExternalAddressByIndex(0)).toBe('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
    expect(wallet._getInternalAddressByIndex(0)).toBe('MBsrv1TeeR716GQYmgskqZ77WhRQZJgSwZ');
    expect(wallet.next_free_address_index).toBe(0);
    expect(wallet.next_free_change_address_index).toBe(0);
    // No seed or private key was put anywhere a save would pick it up.
    expect(JSON.stringify(wallet)).not.toContain(bip39.mnemonicToSeedSync(mnemonic + ' ').toString('hex'));
    expect(JSON.stringify(wallet)).not.toContain(bip39.mnemonicToSeedSync(mnemonic).toString('hex'));
  });

  it('refuses ballot keys, swap keys and anything else off the list', () => {
    const wallet = sharedWallet();
    for (const path of ["m/999999'/0'", "m/1017'/0'", "m/44'/0'/0'", "m/84'/2'/0'", 'm', "m/44'/2'/1'"]) {
      expect(() => deriveOlderAddress(wallet, { id: 'x', seed: 'standard', path }, 0, 0)).toThrow('not one of the places');
    }
    expect(() => deriveOlderAddress(wallet, { id: 'x', seed: 'other', path: "m/44'/107'/0'" }, 0, 0)).toThrow();
    expect(() => deriveOlderAddress(wallet, variation(wallet, 'extra-step'), 2, 0)).toThrow();
    expect(() => deriveOlderAddress(wallet, variation(wallet, 'extra-step'), 0, -1)).toThrow();
    expect(() => deriveOlderAddress(wallet, variation(wallet, 'extra-step'), 0, 1.5)).toThrow();
  });

  it('only applies to a Marscoin wallet made from recovery words', () => {
    expect(isOlderFundsWallet(newWallet())).toBe(true);
    expect(isOlderFundsWallet(null)).toBe(false);
    expect(isOlderFundsWallet({ type: 'watchOnly', secret: 'xpub…' })).toBe(false);
    expect(isOlderFundsWallet({ type: 'marscoin', secret: mnemonic })).toBe(false); // no seed access
    const noWords = new MarsElectrumWallet();
    expect(isOlderFundsWallet(noWords)).toBe(false);
    noWords.secret = 'not a recovery phrase at all';
    expect(isOlderFundsWallet(noWords)).toBe(false);
    expect(olderFundsVariations(noWords)).toEqual([]);
    const bitcoinWallet = newWallet();
    bitcoinWallet.type = 'HDsegwitBech32';
    expect(isOlderFundsWallet(bitcoinWallet)).toBe(false);
  });
});

describe('scanning', () => {
  it('reports nothing found, and what it checked, when the places are empty', async () => {
    const wallet = sharedWallet();
    const connection = fakeConnection();
    const progress = [];
    const scan = await scanOlderFunds({
      wallet,
      connection,
      onProgress: state => progress.push([state.index, state.variation.id, state.state]),
    });
    expect(scan.total).toBe(0);
    expect(scan.confirmed).toBe(0);
    expect(scan.unconfirmed).toBe(0);
    expect(scan.coins).toEqual([]);
    expect(scan.variations).toHaveLength(5);
    for (const result of scan.variations) {
      expect(result.checked).toEqual({ receive: 20, change: 20 });
      expect(result.addresses).toEqual([]);
      expect(result.reachedLimit).toBe(false);
    }
    // 5 places x 2 chains x 20 addresses, each asked for history and balance.
    expect(connection.asked.history).toHaveLength(200);
    expect(new Set(connection.asked.history).size).toBe(200);
    expect(connection.asked.balance).toEqual(connection.asked.history);
    expect(connection.multiGetUtxoByAddress).not.toHaveBeenCalled();
    expect(progress).toEqual([
      [0, 'extra-step', 'checking'],
      [0, 'extra-step', 'done'],
      [1, 'coin-107', 'checking'],
      [1, 'coin-107', 'done'],
      [2, 'space', 'checking'],
      [2, 'space', 'done'],
      [3, 'space-extra-step', 'checking'],
      [3, 'space-extra-step', 'done'],
      [4, 'space-coin-107', 'checking'],
      [4, 'space-coin-107', 'done'],
    ]);
  });

  it('never asks the network about the wallet’s own addresses', async () => {
    const wallet = sharedWallet();
    const connection = fakeConnection();
    await scanOlderFunds({ wallet, connection });
    const own = new Set();
    for (let i = 0; i < 40; i++) {
      own.add(wallet._getExternalAddressByIndex(i));
      own.add(wallet._getInternalAddressByIndex(i));
    }
    for (const address of connection.asked.history) expect(own.has(address)).toBe(false);
  });

  it('finds funds on the first address of a place', async () => {
    const wallet = sharedWallet();
    const tx = fundingTx('MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR', 1250000000);
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR: { coins: [serverCoin(tx)] },
      }),
    });
    expect(scan.total).toBe(1250000000);
    expect(scan.confirmed).toBe(1250000000);
    expect(scan.unconfirmed).toBe(0);
    const [first, ...rest] = scan.variations;
    expect(first.variation.id).toBe('extra-step');
    expect(first.total).toBe(1250000000);
    expect(first.addresses).toEqual([
      {
        address: 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR',
        chain: 0,
        index: 0,
        path: "m/44'/2'/0'/0'/0/0",
        confirmed: 1250000000,
        unconfirmed: 0,
      },
    ]);
    expect(first.checked).toEqual({ receive: 40, change: 20 }); // one more chunk after the used one
    expect(scan.coins).toEqual([
      {
        txid: tx.getId(),
        vout: 0,
        value: 1250000000,
        address: 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR',
        confirmed: true,
        height: 1000,
        variationId: 'extra-step',
        seed: 'standard',
        accountPath: "m/44'/2'/0'/0'",
        chain: 0,
        index: 0,
        path: "m/44'/2'/0'/0'/0/0",
      },
    ]);
    rest.forEach(result => expect(result.total).toBe(0));
  });

  it('keeps going past the first twenty addresses while they have history', async () => {
    const wallet = sharedWallet();
    const place = variation(wallet, 'coin-107');
    const used = deriveOlderAddress(wallet, place, 0, 3);
    const far = deriveOlderAddress(wallet, place, 0, 25);
    const tx = fundingTx(far, 777);
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        [used]: { history: 2, coins: [] },
        [far]: { coins: [serverCoin(tx)] },
      }),
    });
    const result = scan.variations[1];
    expect(result.addresses.map(found => [found.address, found.index, found.confirmed])).toEqual([[far, 25, 777]]);
    expect(result.checked.receive).toBe(60);
    expect(scan.total).toBe(777);
    expect(scan.coins[0].path).toBe("m/44'/107'/0'/0/25");
  });

  it('stops after twenty unused addresses in a row: funds beyond the gap are not seen', async () => {
    const wallet = sharedWallet();
    const far = deriveOlderAddress(wallet, variation(wallet, 'coin-107'), 0, 25);
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        [far]: { coins: [serverCoin(fundingTx(far, 777))] },
      }),
    });
    expect(scan.total).toBe(0);
  });

  it('finds funds on the change chain and on the trailing-space seed', async () => {
    const wallet = sharedWallet();
    const change = deriveOlderAddress(wallet, variation(wallet, 'space-extra-step'), 1, 2);
    const receive = 'MA2xLQxc7HYQzieY4kyQFmKwND4wvbCSBL';
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        [change]: {
          coins: [serverCoin(fundingTx(change, 5000)), serverCoin(fundingTx(change, 6000))],
        },
        [receive]: { coins: [serverCoin(fundingTx(receive, 100000000))] },
      }),
    });
    expect(scan.total).toBe(100011000);
    expect(scan.variations.map(result => result.total)).toEqual([0, 0, 100000000, 11000, 0]);
    expect(scan.variations[3].addresses).toEqual([
      {
        address: change,
        chain: 1,
        index: 2,
        path: "m/44'/2'/0'/0'/1/2",
        confirmed: 11000,
        unconfirmed: 0,
      },
    ]);
    expect(scan.variations[3].coins).toHaveLength(2);
    expect(scan.variations[3].coins.every(coin => coin.chain === 1 && coin.seed === 'trailing-space')).toBe(true);
  });

  it('counts unconfirmed coins separately', async () => {
    const wallet = sharedWallet();
    const address = 'MPfb4NUfbgswmwiEoP4njzY9XoFz3ZntQ5';
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        [address]: {
          coins: [serverCoin(fundingTx(address, 300), 0), serverCoin(fundingTx(address, 40), -1), serverCoin(fundingTx(address, 5000), 12)],
        },
      }),
    });
    expect(scan.confirmed).toBe(5000);
    expect(scan.unconfirmed).toBe(340);
    expect(scan.total).toBe(5340);
    expect(scan.coins.map(coin => coin.confirmed)).toEqual([false, false, true]);
    expect(selectSweepCoins(scan.coins)).toEqual({
      coins: [scan.coins[2]],
      left: 0,
      waiting: 2,
    });
  });

  it('ignores coins without an exact, positive whole-number value', async () => {
    const wallet = sharedWallet();
    const address = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR';
    const good = serverCoin(fundingTx(address, 900));
    const bad = [1.5, 0, -5, '100', NaN, null, undefined, 2 ** 53, Infinity].map(value => ({
      ...serverCoin(fundingTx(address, 1)),
      value,
    }));
    const malformed = [
      { ...serverCoin(fundingTx(address, 1)), txId: 'nothex' },
      { ...serverCoin(fundingTx(address, 1)), vout: -1 },
      { ...good }, // the same coin listed twice counts once
    ];
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        [address]: { history: 3, coins: [...bad, good, ...malformed] },
      }),
    });
    expect(scan.total).toBe(900);
    expect(scan.coins).toHaveLength(1);
    expect(scan.variations[0].ignoredCoins).toBe(bad.length + malformed.length);
    expect(scan.variations[0].addresses).toHaveLength(1);
  });

  it('leaves out an address whose only coins are unusable', async () => {
    const wallet = sharedWallet();
    const address = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR';
    const scan = await scanOlderFunds({
      wallet,
      connection: fakeConnection({
        [address]: {
          history: 1,
          coins: [{ ...serverCoin(fundingTx(address, 1)), value: 0.5 }],
        },
      }),
    });
    expect(scan.total).toBe(0);
    expect(scan.variations[0].addresses).toEqual([]);
    expect(scan.variations[0].ignoredCoins).toBe(1);
  });

  it('skips every address that belongs to the wallet’s own derivation', async () => {
    const wallet = sharedWallet();
    const own = wallet._getExternalAddressByIndex(0);
    const ownChange = wallet._getInternalAddressByIndex(4);
    const connection = fakeConnection({
      [own]: { coins: [serverCoin(fundingTx(own, 123456))] },
      [ownChange]: { coins: [serverCoin(fundingTx(ownChange, 654321))] },
    });
    const standard = {
      id: 'standard',
      label: 'Own',
      description: 'Own',
      seed: 'standard',
      path: "m/44'/2'/0'",
    };
    const scan = await scanOlderFunds({
      wallet,
      connection,
      variations: [standard],
    });
    expect(scan.total).toBe(0);
    expect(scan.coins).toEqual([]);
    expect(scan.variations[0].skippedOwn).toBe(40);
    expect(connection.asked.history).toEqual([]);
    expect(connection.multiGetUtxoByAddress).not.toHaveBeenCalled();
    // And with the normal list, the wallet's own coins are not reported either.
    expect((await scanOlderFunds({ wallet, connection })).total).toBe(0);
  });

  it('also skips an address the wallet says it owns', async () => {
    const wallet = sharedWallet();
    const address = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR';
    jest.spyOn(wallet, 'weOwnAddress').mockImplementation(candidate => candidate === address);
    const connection = fakeConnection({
      [address]: { coins: [serverCoin(fundingTx(address, 5000))] },
    });
    const scan = await scanOlderFunds({ wallet, connection });
    expect(scan.total).toBe(0);
    expect(scan.variations[0].skippedOwn).toBe(1);
    expect(connection.asked.history).not.toContain(address);
  });

  it('stops at 200 addresses per chain and says so', async () => {
    const wallet = sharedWallet();
    const place = variation(wallet, 'extra-step');
    // Every receive address has history, however far one looks.
    const change = new Set(Array.from({ length: 20 }, (_, index) => deriveOlderAddress(wallet, place, 1, index)));
    const connection = fakeConnection();
    connection.multiGetHistoryByAddress = jest.fn(async addresses => {
      connection.asked.history.push(...addresses);
      return Object.fromEntries(addresses.map(address => [address, change.has(address) ? [] : [{ tx_hash: 'ab'.repeat(32), height: 9 }]]));
    });
    const scan = await scanOlderFunds({
      wallet,
      connection,
      variations: [place],
    });
    expect(scan.variations[0].checked).toEqual({
      receive: SCAN_MAX_PER_CHAIN,
      change: 20,
    });
    expect(scan.variations[0].reachedLimit).toBe(true);
    expect(connection.asked.history).toHaveLength(220);
    expect(connection.asked.history).not.toContain(deriveOlderAddress(wallet, place, 0, 200));
    for (const call of connection.multiGetHistoryByAddress.mock.calls) expect(call[0]).toHaveLength(20);
  });

  it('treats a balance without history as used, so a dropped history answer cannot hide coins', async () => {
    const wallet = sharedWallet();
    const address = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR';
    const connection = fakeConnection({
      [address]: { history: 0, coins: [serverCoin(fundingTx(address, 4242))] },
    });
    expect((await scanOlderFunds({ wallet, connection })).total).toBe(4242);
  });

  describe('network failures are errors, never "nothing found"', () => {
    const failing = (method, implementation) => {
      const connection = fakeConnection({
        MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR: {
          coins: [serverCoin(fundingTx('MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR', 5000))],
        },
      });
      connection[method] = jest.fn(implementation);
      return connection;
    };
    it.each([
      ['history request fails', 'multiGetHistoryByAddress', async () => Promise.reject(new Error('Electrum client is not connected'))],
      ['balance request fails', 'multiGetBalanceByAddress', async () => Promise.reject(new Error('socket hang up'))],
      ['coin request fails', 'multiGetUtxoByAddress', async () => Promise.reject(new Error('timeout'))],
      ['history answer is empty', 'multiGetHistoryByAddress', async () => ({})],
      ['history answer is missing', 'multiGetHistoryByAddress', async () => undefined],
      ['balance answer lacks addresses', 'multiGetBalanceByAddress', async () => ({ balance: 0, unconfirmed_balance: 0, addresses: {} })],
      [
        'balance answer is not a number',
        'multiGetBalanceByAddress',
        async addresses => ({
          addresses: Object.fromEntries(addresses.map(address => [address, { confirmed: 'x', unconfirmed: 0 }])),
        }),
      ],
      // What MARSConnection returns when batching is switched off.
      ['coin answer is empty', 'multiGetUtxoByAddress', async () => ({})],
    ])('%s', async (_name, method, implementation) => {
      const error = await scanOlderFunds({
        wallet: sharedWallet(),
        connection: failing(method, implementation),
      }).catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('OlderFundsError');
      expect(error.code).toBe('OLDER_FUNDS_NETWORK');
      expect(error.message).toBe('Could not reach the Marscoin network. Check your connection and try again.');
    });

    it('fails even when the failure comes late, after funds were already seen', async () => {
      const wallet = sharedWallet();
      const connection = fakeConnection({
        MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR: {
          coins: [serverCoin(fundingTx('MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR', 5000))],
        },
      });
      const real = connection.multiGetHistoryByAddress;
      let calls = 0;
      connection.multiGetHistoryByAddress = jest.fn(async addresses => {
        if (++calls === 6) throw new Error('connection lost');
        return real(addresses);
      });
      const error = await scanOlderFunds({ wallet, connection }).catch(e => e);
      expect(error.code).toBe('OLDER_FUNDS_NETWORK');
      expect(error.detail).toBe('connection lost');
    });
  });

  it('refuses a wallet without recovery words', async () => {
    const connection = fakeConnection();
    await expect(scanOlderFunds({ wallet: { type: 'watchOnly' }, connection })).rejects.toMatchObject({ code: 'OLDER_FUNDS_WALLET' });
    expect(connection.multiGetHistoryByAddress).not.toHaveBeenCalled();
  });
});

describe('planning the move', () => {
  const destination = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
  const coin = (value, n = 1) => ({
    txid: n.toString(16).padStart(64, '0'),
    vout: 0,
    value,
    address: 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR',
    confirmed: true,
  });

  it('pays one output: everything found, less size x rate', () => {
    const one = planSweep({
      coins: [coin(100000)],
      destinationAddress: destination,
      feeRate: 1,
    });
    expect(one).toMatchObject({
      size: 192,
      fee: 192,
      total: 100000,
      amount: 99808,
      destinationAddress: destination,
      feeRate: 1,
    });
    const three = planSweep({
      coins: [coin(100000, 1), coin(250000, 2), coin(7, 3)],
      destinationAddress: destination,
      feeRate: 3,
    });
    expect(three.size).toBe(4 + 1 + 3 * 148 + 1 + 34 + 4);
    expect(three.fee).toBe(three.size * 3);
    expect(three.total).toBe(350007);
    expect(three.amount).toBe(350007 - three.fee);
    expect(three.amount + three.fee).toBe(three.total);
    expect(three.coins).toHaveLength(3);
    // A fractional rate rounds the fee up to a whole zubrin.
    expect(
      planSweep({
        coins: [coin(100000)],
        destinationAddress: destination,
        feeRate: 1.5,
      }).fee,
    ).toBe(288);
    expect(
      planSweep({
        coins: [coin(100000)],
        destinationAddress: destination,
        feeRate: 1.01,
      }).fee,
    ).toBe(194);
  });

  it('refuses when what is left is at or below the dust limit', () => {
    const fee = 192;
    for (const value of [1, fee, fee + 1, fee + DUST_LIMIT]) {
      expect(() =>
        planSweep({
          coins: [coin(value)],
          destinationAddress: destination,
          feeRate: 1,
        }),
      ).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_DUST' }));
    }
    expect(
      planSweep({
        coins: [coin(fee + DUST_LIMIT + 1)],
        destinationAddress: destination,
        feeRate: 1,
      }).amount,
    ).toBe(DUST_LIMIT + 1);
  });

  it('refuses a fee above 1% of the total or 0.01 MARS, whichever is larger', () => {
    expect(maxSweepFee(5000)).toBe(1000000);
    expect(maxSweepFee(100000000)).toBe(1000000);
    expect(maxSweepFee(100000000000)).toBe(1000000000);
    // 192 bytes at 5,209 zubrins/byte = 1,000,128: just over 0.01 MARS.
    expect(() =>
      planSweep({
        coins: [coin(50000000)],
        destinationAddress: destination,
        feeRate: 5209,
      }),
    ).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_FEE' }));
    expect(
      planSweep({
        coins: [coin(50000000)],
        destinationAddress: destination,
        feeRate: 5208,
      }).fee,
    ).toBe(999936);
    // With a large total the 1% bound applies instead.
    expect(
      planSweep({
        coins: [coin(1000000000000)],
        destinationAddress: destination,
        feeRate: 10000,
      }).fee,
    ).toBe(1920000);
    expect(() =>
      planSweep({
        coins: [coin(1000000000000)],
        destinationAddress: destination,
        feeRate: 60000000,
      }),
    ).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_FEE' }));
  });

  it.each([[0], [0.99], [-1], [NaN], [Infinity], ['2'], [null], [undefined]])('refuses fee rate %p', feeRate => {
    expect(() =>
      planSweep({
        coins: [coin(100000)],
        destinationAddress: destination,
        feeRate,
      }),
    ).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_FEE' }));
  });

  it.each([
    [''],
    [undefined],
    ['not an address'],
    ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
    ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'],
    ['MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU2'],
  ])('refuses destination %p', destinationAddress => {
    expect(() => planSweep({ coins: [coin(100000)], destinationAddress, feeRate: 1 })).toThrow(
      expect.objectContaining({ code: 'OLDER_FUNDS_DESTINATION' }),
    );
  });

  it('refuses no coins, bad coins, a coin listed twice, and too many coins', () => {
    const plan = coins => () => planSweep({ coins, destinationAddress: destination, feeRate: 1 });
    expect(plan([])).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_EMPTY' }));
    expect(plan(undefined)).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_EMPTY' }));
    for (const bad of [
      { ...coin(1000), value: 1000.5 },
      { ...coin(1000), value: 0 },
      { ...coin(1000), value: '1000' },
      { ...coin(1000), txid: 'zz' },
      { ...coin(1000), vout: 1.5 },
      { ...coin(1000), address: 'nope' },
      null,
    ]) {
      expect(plan([coin(100000, 2), bad])).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_COIN' }));
    }
    expect(plan([coin(100000), coin(100000)])).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_COIN' }));
    const many = Array.from({ length: MAX_SWEEP_INPUTS + 1 }, (_, n) => coin(100000, n + 1));
    expect(plan(many)).toThrow(expect.objectContaining({ code: 'OLDER_FUNDS_TOO_MANY' }));
    expect(
      planSweep({
        coins: many.slice(1),
        destinationAddress: destination,
        feeRate: 1,
      }).size,
    ).toBe(4 + 1 + MAX_SWEEP_INPUTS * 148 + 1 + 34 + 4);
  });

  it('chooses confirmed coins, largest first, and no more than fit', () => {
    const coins = Array.from({ length: MAX_SWEEP_INPUTS + 5 }, (_, n) => coin(1000 + n, n + 1));
    coins.push({ ...coin(999999, 9999), confirmed: false });
    const chosen = selectSweepCoins(coins);
    expect(chosen.coins).toHaveLength(MAX_SWEEP_INPUTS);
    expect(chosen.left).toBe(5);
    expect(chosen.waiting).toBe(1);
    expect(chosen.coins[0].value).toBe(1000 + MAX_SWEEP_INPUTS + 4);
    expect(chosen.coins.every(item => item.confirmed)).toBe(true);
    expect(selectSweepCoins([])).toEqual({ coins: [], left: 0, waiting: 0 });
    expect(selectSweepCoins(undefined)).toEqual({
      coins: [],
      left: 0,
      waiting: 0,
    });
  });
});

describe('the signed transaction', () => {
  // Coins on three places, both chains and both seeds, found by a real scan.
  async function fixture() {
    const wallet = sharedWallet();
    const spots = [
      ['extra-step', 0, 0, 1250000000, mnemonic, "m/44'/2'/0'/0'/0/0"],
      ['extra-step', 1, 2, 30000, mnemonic, "m/44'/2'/0'/0'/1/2"],
      ['coin-107', 0, 1, 4000000, mnemonic, "m/44'/107'/0'/0/1"],
      ['space', 0, 0, 55555, mnemonic + ' ', "m/44'/2'/0'/0/0"],
      ['space-coin-107', 1, 0, 700, mnemonic + ' ', "m/44'/107'/0'/1/0"],
    ];
    const ledger = {};
    const transactions = new Map();
    const signers = new Map();
    for (const [id, chain, index, value, words, fullPath] of spots) {
      const address = deriveOlderAddress(wallet, variation(wallet, id), chain, index);
      // The coin is not always the first output of its transaction.
      const tx = fundingTx(address, value, value === 30000 ? [['MBsrv1TeeR716GQYmgskqZ77WhRQZJgSwZ', 999]] : []);
      transactions.set(tx.getId(), tx);
      signers.set(tx.getId(), independentNode(words, fullPath));
      ledger[address] = { coins: [serverCoin(tx)] };
    }
    const connection = fakeConnection(ledger);
    connection.getTxHex = jest.fn(async txid => transactions.get(txid).toHex());
    connection.broadcastV2 = jest.fn();
    const scan = await scanOlderFunds({ wallet, connection });
    return {
      wallet,
      connection,
      scan,
      transactions,
      signers,
      destination: wallet._getExternalAddressByIndex(1),
    };
  }

  it('spends every found coin to one receive address of the wallet, with valid signatures', async () => {
    const { wallet, connection, scan, transactions, signers, destination } = await fixture();
    expect(scan.total).toBe(1250000000 + 30000 + 4000000 + 55555 + 700);
    const { coins } = selectSweepCoins(scan.coins);
    const sweep = await buildSweepTransaction({
      wallet,
      coins,
      destinationAddress: destination,
      feeRate: 2,
      connection,
    });

    const tx = bitcoin.Transaction.fromHex(sweep.txHex);
    expect(tx.version).toBe(1);
    expect(tx.locktime).toBe(0);
    expect(tx.getId()).toBe(sweep.txid);

    // Inputs: exactly the scanned coins, each once.
    const spent = tx.ins.map(input => `${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`).sort();
    expect(spent).toEqual(scan.coins.map(coin => `${coin.txid}:${coin.vout}`).sort());
    expect(new Set(spent).size).toBe(5);

    // One output, to the wallet's own receive address.
    expect(tx.outs).toHaveLength(1);
    expect(bitcoin.address.fromOutputScript(tx.outs[0].script, network)).toBe(destination);
    expect(wallet.weOwnAddress(destination)).toBe(true);

    // Amounts: inputs - output = fee = estimated size x rate.
    const estimated = 4 + 1 + 5 * 148 + 1 + 34 + 4;
    expect(sweep.total).toBe(scan.total);
    expect(sweep.fee).toBe(estimated * 2);
    expect(tx.outs[0].value).toBe(scan.total - sweep.fee);
    expect(sweep.amount).toBe(tx.outs[0].value);
    expect(sweep.inputs).toBe(5);
    expect(sweep.size).toBe(tx.byteLength());
    expect(sweep.size).toBeLessThanOrEqual(estimated);
    expect(sweep.size).toBeGreaterThan(estimated - 5 * 3);
    expect(sweep.fee / sweep.size).toBeGreaterThanOrEqual(2);

    // Every input is signed by the key of its own derivation, worked out
    // here independently from the recovery words.
    tx.ins.forEach((input, position) => {
      const txid = Buffer.from(input.hash).reverse().toString('hex');
      const previous = transactions.get(txid).outs[input.index];
      const [encoded, publicKey] = bitcoin.script.decompile(input.script);
      const node = signers.get(txid);
      expect(publicKey.equals(node.publicKey)).toBe(true);
      const { signature, hashType } = bitcoin.script.signature.decode(encoded);
      expect(hashType).toBe(bitcoin.Transaction.SIGHASH_ALL);
      expect(node.verify(tx.hashForSignature(position, previous.script, hashType), signature)).toBe(true);
      expect(input.sequence).toBe(0xffffffff);
    });

    // Building does not broadcast.
    expect(connection.broadcastV2).not.toHaveBeenCalled();
    expect(connection.getTxHex).toHaveBeenCalledTimes(5);
  });

  it('refuses any destination that is not a receive address of this wallet', async () => {
    const { wallet, connection, scan } = await fixture();
    const { coins } = selectSweepCoins(scan.coins);
    const stranger = bitcoin.payments.p2pkh({
      pubkey: bitcoin.ECPair.fromPrivateKey(Buffer.alloc(32, 2)).publicKey,
      network,
    }).address;
    for (const destinationAddress of [
      wallet._getInternalAddressByIndex(0), // the wallet's own, but a change address
      stranger,
      scan.coins[0].address, // an older address
      wallet._getExternalAddressByIndex(500), // beyond what the wallet tracks
      'nonsense',
    ]) {
      await expect(
        buildSweepTransaction({
          wallet,
          coins,
          destinationAddress,
          feeRate: 2,
          connection,
        }),
      ).rejects.toMatchObject({
        code: 'OLDER_FUNDS_DESTINATION',
      });
    }
    expect(connection.getTxHex).not.toHaveBeenCalled();
    // The civic address (receive index 0) is accepted.
    const sweep = await buildSweepTransaction({
      wallet,
      coins,
      destinationAddress: 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1',
      feeRate: 2,
      connection,
    });
    expect(bitcoin.address.fromOutputScript(bitcoin.Transaction.fromHex(sweep.txHex).outs[0].script, network)).toBe(
      'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1',
    );
  });

  it('never spends a coin of the wallet’s own derivation or one that does not match its place', async () => {
    const { wallet, connection, scan, transactions, destination } = await fixture();
    const good = scan.coins[0];
    const own = wallet._getExternalAddressByIndex(0);
    const ownTx = fundingTx(own, 900000);
    transactions.set(ownTx.getId(), ownTx);
    const ownCoin = {
      txid: ownTx.getId(),
      vout: 0,
      value: 900000,
      address: own,
      confirmed: true,
      chain: 0,
      index: 0,
    };
    const forged = [
      {
        ...ownCoin,
        variationId: 'standard',
        seed: 'standard',
        accountPath: "m/44'/2'/0'",
        path: "m/44'/2'/0'/0/0",
      },
      {
        ...ownCoin,
        variationId: 'space',
        seed: 'standard',
        accountPath: "m/44'/2'/0'",
        path: "m/44'/2'/0'/0/0",
      },
      {
        ...ownCoin,
        variationId: 'space',
        seed: 'trailing-space',
        accountPath: "m/44'/2'/0'",
        path: "m/44'/2'/0'/0/0",
      },
      {
        ...ownCoin,
        variationId: 'extra-step',
        seed: 'standard',
        accountPath: "m/44'/2'/0'/0'",
        path: "m/44'/2'/0'/0'/0/0",
      },
      { ...good, index: 1 },
      { ...good, chain: 1 },
      { ...good, path: "m/44'/2'/0'/0'/0/1" },
      { ...good, accountPath: "m/999999'/0'" },
      { ...good, accountPath: "m/1017'/0'" },
      { ...good, variationId: 'coin-107' },
      { ...good, variationId: undefined },
      { ...good, confirmed: false },
      { ...good, confirmed: undefined },
    ];
    for (const coin of forged) {
      await expect(
        buildSweepTransaction({
          wallet,
          coins: [coin],
          destinationAddress: destination,
          feeRate: 2,
          connection,
        }),
      ).rejects.toMatchObject({
        code: 'OLDER_FUNDS_COIN',
      });
    }
    expect(connection.getTxHex).not.toHaveBeenCalled();
    // A coin the wallet itself claims is refused too.
    jest.spyOn(wallet, 'weOwnAddress').mockImplementation(address => address === good.address || address === destination);
    await expect(
      buildSweepTransaction({
        wallet,
        coins: [good],
        destinationAddress: destination,
        feeRate: 2,
        connection,
      }),
    ).rejects.toMatchObject({
      code: 'OLDER_FUNDS_COIN',
    });
  });

  it('refuses when the previous transaction is not what the coin claims', async () => {
    const { wallet, connection, scan, transactions, destination } = await fixture();
    const good = scan.coins[0];
    const build = coin =>
      buildSweepTransaction({
        wallet,
        coins: [coin],
        destinationAddress: destination,
        feeRate: 2,
        connection,
      });

    // The server overstated the coin's value.
    await expect(build({ ...good, value: good.value + 1 })).rejects.toMatchObject({ code: 'OLDER_FUNDS_COIN' });
    // The output index points at somebody else's output, or at none.
    const second = scan.coins.find(coin => coin.value === 30000);
    await expect(build({ ...second, vout: 0, value: 999 })).rejects.toMatchObject({ code: 'OLDER_FUNDS_COIN' });
    await expect(build({ ...good, vout: 7 })).rejects.toMatchObject({
      code: 'OLDER_FUNDS_COIN',
    });
    // The server answers with a different transaction, or with rubbish.
    connection.getTxHex.mockResolvedValueOnce([...transactions.values()][1].toHex());
    await expect(build(good)).rejects.toMatchObject({
      code: 'OLDER_FUNDS_NETWORK',
    });
    connection.getTxHex.mockResolvedValueOnce('zz');
    await expect(build(good)).rejects.toMatchObject({
      code: 'OLDER_FUNDS_NETWORK',
    });
    // The server cannot be reached.
    connection.getTxHex.mockRejectedValueOnce(new Error('Connect to the Marscoin network before preparing a transaction.'));
    await expect(build(good)).rejects.toMatchObject({
      code: 'OLDER_FUNDS_NETWORK',
    });
    // And the untouched coin still builds.
    expect((await build(good)).inputs).toBe(1);
  });

  it('refuses dust and unreasonable fees before fetching or signing anything', async () => {
    const { wallet, connection, scan, destination } = await fixture();
    const small = scan.coins.find(coin => coin.value === 700);
    await expect(
      buildSweepTransaction({
        wallet,
        coins: [small],
        destinationAddress: destination,
        feeRate: 1,
      }),
    ).rejects.toMatchObject({
      code: 'OLDER_FUNDS_DUST',
    });
    await expect(
      buildSweepTransaction({
        wallet,
        coins: selectSweepCoins(scan.coins).coins,
        destinationAddress: destination,
        feeRate: 20000,
        connection,
      }),
    ).rejects.toMatchObject({ code: 'OLDER_FUNDS_FEE' });
    expect(connection.getTxHex).not.toHaveBeenCalled();
  });

  it('the final check catches a transaction that differs from the plan', async () => {
    const { wallet, connection, scan, transactions, signers, destination } = await fixture();
    const { coins } = selectSweepCoins(scan.coins);
    const sweep = await buildSweepTransaction({
      wallet,
      coins,
      destinationAddress: destination,
      feeRate: 2,
      connection,
    });
    const plan = planSweep({
      coins,
      destinationAddress: destination,
      feeRate: 2,
    });
    const previousHex = new Map([...transactions].map(([txid, tx]) => [txid, tx.toHex()]));
    const check =
      (txHex, usePlan = plan, usePrevious = previousHex) =>
      () =>
        verifySweepTransaction({
          txHex,
          plan: usePlan,
          previousHex: usePrevious,
        });
    const failed = expect.objectContaining({ code: 'OLDER_FUNDS_INTERNAL' });

    expect(check(sweep.txHex)()).toMatchObject({
      txid: sweep.txid,
      fee: sweep.fee,
      amount: sweep.amount,
    });

    // Sign any variant of the transaction properly, so that only the
    // property under test is wrong.
    const sign = (mutate, ins = plan.coins) => {
      const tx = new bitcoin.Transaction();
      tx.version = 1;
      for (const coin of ins) tx.addInput(Buffer.from(coin.txid, 'hex').reverse(), coin.vout, 0xffffffff);
      tx.addOutput(bitcoin.address.toOutputScript(destination, network), plan.amount);
      mutate(tx);
      ins.forEach((coin, position) => {
        const node = signers.get(coin.txid);
        const script = transactions.get(coin.txid).outs[coin.vout].script;
        const hashType = bitcoin.Transaction.SIGHASH_ALL;
        const signature = bitcoin.script.signature.encode(node.sign(tx.hashForSignature(position, script, hashType)), hashType);
        tx.setInputScript(position, bitcoin.script.compile([signature, node.publicKey]));
      });
      return tx.toHex();
    };
    expect(check(sign(() => {}))()).toMatchObject({ amount: plan.amount }); // the helper itself makes a valid one

    const stranger = bitcoin.payments.p2pkh({
      pubkey: bitcoin.ECPair.fromPrivateKey(Buffer.alloc(32, 2)).publicKey,
      network,
    }).address;
    // Pays somebody else.
    expect(check(sign(tx => (tx.outs[0].script = bitcoin.address.toOutputScript(stranger, network))))).toThrow(failed);
    // Pays less, the rest going to fees.
    expect(check(sign(tx => (tx.outs[0].value = plan.amount - 1)))).toThrow(failed);
    // A second output.
    expect(
      check(
        sign(tx => {
          tx.outs[0].value = plan.amount - 1000;
          tx.addOutput(bitcoin.address.toOutputScript(stranger, network), 1000);
        }),
      ),
    ).toThrow(failed);
    // Leaves a coin out, or spends one twice.
    expect(check(sign(() => {}, plan.coins.slice(1)))).toThrow(failed);
    expect(check(sign(() => {}, [...plan.coins.slice(1), plan.coins[1]]))).toThrow(failed);
    // An input that is not one of the planned coins.
    const other = fundingTx(plan.coins[0].address, plan.coins[0].value);
    signers.set(other.getId(), signers.get(plan.coins[0].txid));
    transactions.set(other.getId(), other);
    expect(check(sign(() => {}, [{ ...plan.coins[0], txid: other.getId() }, ...plan.coins.slice(1)]))).toThrow(failed);
    // A broken signature.
    const broken = bitcoin.Transaction.fromHex(sweep.txHex);
    const [signature, publicKey] = bitcoin.script.decompile(broken.ins[2].script);
    signature[10] = (signature[10] + 1) % 256;
    broken.setInputScript(2, bitcoin.script.compile([signature, publicKey]));
    expect(check(broken.toHex())).toThrow(failed);
    // Signed by a key that does not own the coin.
    const wrongKey = bitcoin.Transaction.fromHex(sweep.txHex);
    wrongKey.setInputScript(0, wrongKey.ins[1].script);
    expect(check(wrongKey.toHex())).toThrow(failed);
    // A plan that disagrees with the transaction, and missing or wrong previous transactions.
    expect(check(sweep.txHex, { ...plan, destinationAddress: stranger })).toThrow(failed);
    expect(check(sweep.txHex, { ...plan, amount: plan.amount + 1 })).toThrow(failed);
    expect(check(sweep.txHex, { ...plan, fee: plan.fee - 1 })).toThrow(failed);
    expect(check(sweep.txHex, { ...plan, total: plan.total + 1 })).toThrow(failed);
    expect(check(sweep.txHex, plan, new Map())).toThrow(failed);
    expect(check(sweep.txHex, plan, new Map([...previousHex].map(([txid], n, all) => [txid, all[(n + 1) % all.length][1]])))).toThrow(
      failed,
    );
    expect(check('00', plan)).toThrow(failed);
  });

  it('signs the largest transaction it allows, within its size estimate', async () => {
    const wallet = sharedWallet();
    const place = variation(wallet, 'coin-107');
    const transactions = new Map();
    const coins = [];
    for (let n = 0; n < MAX_SWEEP_INPUTS; n++) {
      const index = n % 40;
      const address = deriveOlderAddress(wallet, place, 0, index);
      const tx = fundingTx(address, 100000 + n);
      transactions.set(tx.getId(), tx);
      coins.push({
        txid: tx.getId(),
        vout: 0,
        value: 100000 + n,
        address,
        confirmed: true,
        height: 5,
        variationId: place.id,
        seed: place.seed,
        accountPath: place.path,
        chain: 0,
        index,
        path: `${place.path}/0/${index}`,
      });
    }
    const connection = {
      getTxHex: async txid => transactions.get(txid).toHex(),
    };
    const sweep = await buildSweepTransaction({
      wallet,
      coins,
      destinationAddress: wallet._getExternalAddressByIndex(0),
      feeRate: 1,
      connection,
    });
    expect(sweep.inputs).toBe(MAX_SWEEP_INPUTS);
    expect(sweep.size).toBeLessThanOrEqual(4 + 1 + MAX_SWEEP_INPUTS * 148 + 1 + 34 + 4);
    expect(sweep.size).toBeLessThan(100000);
    expect(sweep.fee).toBe(4 + 1 + MAX_SWEEP_INPUTS * 148 + 1 + 34 + 4);
    expect(sweep.amount + sweep.fee).toBe(coins.reduce((sum, coin) => sum + coin.value, 0));
  });
});

describe('broadcasting', () => {
  const tx = fundingTx('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1', 1000);
  const txHex = tx.toHex();
  const txid = tx.getId();

  it('sends once and returns the transaction id the network confirms', async () => {
    const connection = { broadcastV2: jest.fn(async () => txid) };
    expect(await broadcastSweep({ connection, txHex, txid })).toBe(txid);
    expect(connection.broadcastV2).toHaveBeenCalledTimes(1);
    expect(connection.broadcastV2).toHaveBeenCalledWith(txHex);
  });

  it('reports a rejection without trying again', async () => {
    const connection = {
      broadcastV2: jest.fn(async () => Promise.reject(new Error('min relay fee not met'))),
    };
    const error = await broadcastSweep({ connection, txHex, txid }).catch(e => e);
    expect(error.code).toBe('OLDER_FUNDS_BROADCAST');
    expect(error.detail).toBe('min relay fee not met');
    expect(connection.broadcastV2).toHaveBeenCalledTimes(1);
  });

  it.each([[undefined], [''], ['ok'], ['ab'.repeat(32)], [{ code: 1 }]])('treats the answer %p as a failure', async answer => {
    const connection = { broadcastV2: jest.fn(async () => answer) };
    await expect(broadcastSweep({ connection, txHex, txid })).rejects.toMatchObject({ code: 'OLDER_FUNDS_BROADCAST' });
    expect(connection.broadcastV2).toHaveBeenCalledTimes(1);
  });

  it('does not send a transaction whose id does not match', async () => {
    const connection = { broadcastV2: jest.fn() };
    await expect(broadcastSweep({ connection, txHex, txid: 'ab'.repeat(32) })).rejects.toMatchObject({ code: 'OLDER_FUNDS_INTERNAL' });
    await expect(broadcastSweep({ connection, txHex: undefined, txid })).rejects.toMatchObject({ code: 'OLDER_FUNDS_INTERNAL' });
    expect(connection.broadcastV2).not.toHaveBeenCalled();
  });
});
