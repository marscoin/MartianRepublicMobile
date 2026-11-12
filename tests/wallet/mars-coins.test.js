import { COINS_UNREACHABLE, isExactCoinValue, loadFreshCoins, marsToExactZubrins } from '../../blue_modules/mars-coins';
import { MarsElectrumWallet } from '../../screen/wallets/mars-wallet';
import * as MARSConnection from '../../blue_modules/MARSConnection';

jest.mock('../../class', () => ({ HDLegacyP2PKHWallet: class {} }));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({
  AbstractHDElectrumWallet: { defaultRBFSequence: 0xfffffffd },
}));
jest.mock('../../blue_modules/MARSConnection', () => ({
  multiGetUtxoByAddress: jest.fn(),
  estimateCurrentBlockheight: jest.fn(() => 3599779),
}));
jest.mock('../../class/rng', () => ({ randomBytes: jest.fn() }));
jest.mock('../../loc', () => ({ wallets: {} }));

// Public BIP39 test vector. Never use this mnemonic for funds.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function makeWallet() {
  const wallet = new MarsElectrumWallet();
  wallet.setSecret(mnemonic);
  wallet.next_free_address_index = 0;
  wallet.next_free_change_address_index = 0;
  wallet._balances_by_external_index = { 0: { c: 668426267450, u: 0 } };
  wallet._balances_by_internal_index = {};
  wallet.getUTXOMetadata = () => ({});
  return wallet;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  MARSConnection.multiGetUtxoByAddress.mockReset();
});
afterEach(() => jest.restoreAllMocks());

describe('exact coin values', () => {
  it('accepts only positive whole numbers of zubrins', () => {
    expect(isExactCoinValue(668426267450)).toBe(true);
    expect(isExactCoinValue(1)).toBe(true);
    for (const value of [0, -5, 0.5, 6684.2626745, NaN, undefined, null, '100', Number.MAX_SAFE_INTEGER + 1]) {
      expect(isExactCoinValue(value)).toBe(false);
    }
  });

  it('converts MARS amounts from transaction details to exact zubrins', () => {
    expect(marsToExactZubrins(6684.2626745)).toBe(668426267450);
    expect(marsToExactZubrins(0.09765625)).toBe(9765625);
    expect(marsToExactZubrins('0.00000001')).toBe(1);
    expect(marsToExactZubrins(1e-8)).toBe(1);
  });

  it('converts every amount with eight decimals exactly', () => {
    let seed = 20261111;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 20000; i++) {
      const zubrins = Math.floor(random() * 4e15) + 1;
      // As a server's JSON carries it: a decimal number of MARS.
      const mars = JSON.parse((zubrins / 1e8).toFixed(8));
      expect(marsToExactZubrins(mars)).toBe(zubrins);
    }
  });

  it('gives nothing rather than an inexact, empty or missing amount', () => {
    // 0.1 + 0.2 - 0.2 is 0.10000000000000003: arithmetic on MARS amounts is refused, not rounded.
    for (const amount of [undefined, null, '', NaN, 0, -1, 0.123456789, 1e-9, 0.1 + 0.2 - 0.2, 'abc', 1e9]) {
      expect(marsToExactZubrins(amount)).toBeNull();
    }
  });
});

describe('loading the coins to spend', () => {
  it('returns the coins the network reported', async () => {
    const coins = [{ txid: 'a', vout: 0, value: 1000 }];
    const wallet = { fetchUtxo: jest.fn().mockResolvedValue(), getUtxo: jest.fn(() => coins) };
    await expect(loadFreshCoins(wallet)).resolves.toBe(coins);
    expect(wallet.fetchUtxo).toHaveBeenCalledTimes(1);
  });

  it('says plainly that the network could not be reached, and does not hand out old coins', async () => {
    const wallet = { fetchUtxo: jest.fn().mockRejectedValue(new Error('close connect')), getUtxo: jest.fn(() => [{ value: 12.5 }]) };
    const failure = await loadFreshCoins(wallet).catch(error => error);
    expect(failure.message).toBe(COINS_UNREACHABLE);
    expect(failure.message).toBe('Could not reach the Marscoin network to load your coins. Check your connection and try again.');
    expect(failure.code).toBe('MARS_COINS_UNREACHABLE');
    expect(wallet.getUtxo).not.toHaveBeenCalled();
  });

  it('gives up on a server that never answers', async () => {
    const wallet = { fetchUtxo: jest.fn(() => new Promise(() => {})), getUtxo: jest.fn() };
    await expect(loadFreshCoins(wallet, { timeout: 20 })).rejects.toThrow(COINS_UNREACHABLE);
    expect(wallet.getUtxo).not.toHaveBeenCalled();
  });
});

describe('the wallet spends only coins the network reported', () => {
  const storedTransactions = address => [
    {
      txid: 'aa'.repeat(32),
      confirmations: 10,
      inputs: [],
      outputs: [
        { n: 0, value: 6684.2626745, scriptPubKey: { addresses: [address] } },
        { n: 1, value: undefined, scriptPubKey: { addresses: [address] } },
        { n: 2, value: 0, scriptPubKey: { addresses: [address] } },
        { n: 3, value: 0.123456789, scriptPubKey: { addresses: [address] } },
      ],
    },
  ];

  it('offers no coins to spend when none were fetched, whatever old transactions suggest', () => {
    const wallet = makeWallet();
    const address = wallet._getExternalAddressByIndex(0);
    wallet._txs_by_external_index = { 0: storedTransactions(address) };
    expect(wallet.getDerivedUtxoFromOurTransaction().length).toBeGreaterThan(0);
    expect(wallet.getUtxo()).toEqual([]);
    expect(wallet.getUtxo(true)).toEqual([]);
  });

  it('works out coins from old transactions only with exact values', () => {
    const wallet = makeWallet();
    const address = wallet._getExternalAddressByIndex(0);
    wallet._txs_by_external_index = { 0: storedTransactions(address) };
    const derived = wallet.getDerivedUtxoFromOurTransaction();
    expect(derived.map(coin => [coin.vout, coin.value])).toEqual([[0, 668426267450]]);
  });

  it('stores fetched coins with their exact values', async () => {
    const wallet = makeWallet();
    const address = wallet._getExternalAddressByIndex(0);
    MARSConnection.multiGetUtxoByAddress.mockResolvedValue({
      [address]: [{ txId: 'bb'.repeat(32), vout: 1, value: 668426267450, height: 3599000, address }],
    });
    await wallet.fetchUtxo();
    expect(wallet.getUtxo().map(coin => coin.value)).toEqual([668426267450]);
  });

  it('keeps the previous coins when the network cannot be reached', async () => {
    const wallet = makeWallet();
    const address = wallet._getExternalAddressByIndex(0);
    const good = { txId: 'bb'.repeat(32), txid: 'bb'.repeat(32), vout: 1, value: 1000, address };
    wallet._utxo = [good];
    MARSConnection.multiGetUtxoByAddress.mockRejectedValue(new Error('Could not reach the Marscoin network.'));
    await expect(wallet.fetchUtxo()).rejects.toThrow('Could not reach');
    expect(wallet.getUtxo()).toEqual([good]);
  });

  it('refuses a fetched coin without an exact value', async () => {
    const wallet = makeWallet();
    const address = wallet._getExternalAddressByIndex(0);
    MARSConnection.multiGetUtxoByAddress.mockResolvedValue({
      [address]: [{ txId: 'bb'.repeat(32), vout: 1, value: 6684.2626745, height: 3599000, address }],
    });
    await expect(wallet.fetchUtxo()).rejects.toThrow('without a valid amount');
    expect(wallet.getUtxo()).toEqual([]);
  });

  it('never plans a payment from a coin whose value is not exact', () => {
    const wallet = makeWallet();
    const change = wallet._getInternalAddressByIndex(0);
    const to = wallet._getExternalAddressByIndex(1);
    for (const value of [6684.2626745, 0, NaN, undefined, '1000000000']) {
      expect(() => wallet.coinselect([{ txid: 'a', vout: 0, value }], [{ address: to, value: 1000000000 }], 3, change)).toThrow(
        'Refresh the wallet before sending.',
      );
    }
    const planned = wallet.coinselect([{ txid: 'a', vout: 0, value: 668426267450 }], [{ address: to, value: 1000000000 }], 3, change);
    expect(planned.inputs).toHaveLength(1);
    expect(planned.fee).toBeGreaterThan(0);
  });
});
