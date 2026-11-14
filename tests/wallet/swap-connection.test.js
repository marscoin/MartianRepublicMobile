import ElectrumClient from 'electrum-client';
import { MARS_MAINNET_GENESIS } from '../../blue_modules/mars-electrum-peer';
import { NETWORK_RETRYING, NETWORK_UNREACHABLE } from '../../blue_modules/mars-electrum-link';
import { marketPriceText } from '../../blue_modules/swap/present';

jest.mock('@react-native-async-storage/async-storage', () => {
  const stored = new Map();
  return {
    getItem: jest.fn(async key => (stored.has(key) ? stored.get(key) : null)),
    setItem: jest.fn(async (key, value) => {
      stored.set(key, value);
    }),
  };
});
jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('electrum-client', () => jest.fn());
jest.mock('../../class/rng', () => ({ randomBytes: jest.fn() }));
jest.mock('../../blue_modules/MARSConnection', () => ({
  multiGetUtxoByAddress: jest.fn(),
  getTxHex: jest.fn(),
  broadcastV2: jest.fn(),
}));

const MARSConnection = require('../../blue_modules/MARSConnection');
const swap = require('../../blue_modules/swap');

// Each relay connection the app opens, with the answers it will give.
let relays;
let answer;
beforeEach(() => {
  relays = [];
  answer = jest.fn(async () => []);
  ElectrumClient.mockImplementation(() => {
    const relay = {
      status: 1,
      initElectrum: jest.fn().mockResolvedValue(['ElectrumX 1.16.0', '1.4']),
      server_features: jest.fn().mockResolvedValue({ genesis_hash: MARS_MAINNET_GENESIS }),
      request: jest.fn((method, params) => answer(method, params, relays.indexOf(relay))),
      close: jest.fn(() => (relay.status = 0)),
    };
    relays.push(relay);
    return relay;
  });
});
afterEach(() => {
  // Leave no connection behind for the next test.
  relays.forEach(relay => (relay.status = 0));
});

describe('swap relay connection', () => {
  it('asks again on a new connection when a read dies with "close connect"', async () => {
    answer.mockImplementation(async (method, params, connection) => {
      if (connection === 0) throw new Error('close connect');
      return [{ offer_id: 'a' }];
    });
    await expect(swap.swapChain.rawOffers()).resolves.toEqual([{ offer_id: 'a' }]);
    expect(relays).toHaveLength(2);
    expect(relays[0].close).toHaveBeenCalled();
  });

  it('reports a relay that stays unreachable in plain words', async () => {
    answer.mockRejectedValue(new Error('close connect'));
    const failure = await swap.swapChain.rawOffers().catch(error => error);
    expect(failure.message).toBe(NETWORK_UNREACHABLE);
    expect(relays).toHaveLength(2); // once more, then no further
  });

  it('never repeats a request that changes something', async () => {
    answer.mockRejectedValue(new Error('close connect'));
    const failure = await swap.swapChain.postOffer({ offer_id: 'a' }).catch(error => error);
    expect(failure.message).toBe(NETWORK_UNREACHABLE);
    expect(relays).toHaveLength(1);
    expect(relays[0].request).toHaveBeenCalledTimes(1);
  });

  it('passes a refusal by the relay through without reconnecting', async () => {
    answer.mockRejectedValue({ code: 1, message: 'offer limit reached' });
    await expect(swap.swapChain.rawOffers()).rejects.toThrow('offer limit reached');
    expect(relays).toHaveLength(1);
    expect(relays[0].close).not.toHaveBeenCalled();
  });
});

describe('maker screen status', () => {
  const wallet = {
    getID: () => 'wallet-1',
    _getSeed: () => Buffer.alloc(64, 7),
    _getExternalAddressByIndex: () => 'MLKapgvhusgGSAhTpedoVkMbnBgZssngTL',
    _getWifForAddress: () => {
      throw new Error('not needed');
    },
  };
  const feeds = ok => {
    global.fetch = jest.fn(async url => {
      if (!ok) throw new TypeError('Network request failed');
      if (String(url).includes('price.marscoin.org'))
        return { ok: true, json: async () => ({ data: { 1: { quote: { USD: { price: 0.061 } } } } }) };
      if (String(url).includes('/v1/prices')) return { ok: true, json: async () => ({ USD: 100000 }) };
      throw new TypeError('Network request failed'); // the Bitcoin wallet's servers
    });
  };
  afterEach(() => {
    delete global.fetch;
  });

  it('never shows the connection library error, and shows the price although the wallet could not be read', async () => {
    feeds(true);
    // The wallet connection lost its socket with the coin request in flight.
    MARSConnection.multiGetUtxoByAddress.mockRejectedValue(new Error('close connect'));
    await swap.saveMakerConfig(wallet, { enabled: true, floorSatsPerMars: 10 });

    const status = swap.getMakerStatus();
    expect(status.message).toBe(NETWORK_RETRYING);
    expect(status.message).not.toMatch(/close connect/);
    expect(status.market).toBeCloseTo(0.061 / 100000, 12);
    expect(marketPriceText(status)).toBe('61.0 sats per MARS');
  });

  it('retries at the next pass after a failure, rather than in five minutes', async () => {
    feeds(true);
    MARSConnection.multiGetUtxoByAddress.mockRejectedValue(new Error('close connect'));
    await swap.saveMakerConfig(wallet, { enabled: true, floorSatsPerMars: 10 });
    const calls = MARSConnection.multiGetUtxoByAddress.mock.calls.length;

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
    try {
      await swap.runMaker(wallet);
    } finally {
      Date.now.mockRestore();
    }
    expect(MARSConnection.multiGetUtxoByAddress.mock.calls.length).toBeGreaterThan(calls);
  });

  it('says the price is unavailable when the price feed cannot be reached', async () => {
    feeds(false);
    await swap.saveMakerConfig(wallet, { enabled: true, floorSatsPerMars: 10 });
    const status = swap.getMakerStatus();
    expect(status.marketUnavailable).toBe(true);
    expect(status.message).toBe('The market price is unavailable right now. Trying again shortly.');
  });

  it('words the market price row', () => {
    expect(marketPriceText({ market: 0 })).toBe('Checking…');
    expect(marketPriceText({ market: 0, marketUnavailable: true })).toBe('Unavailable. Retrying…');
    expect(marketPriceText({ market: 0.00000061, marketUnavailable: true })).toBe('61.0 sats per MARS');
    expect(swap.describeMakerFailure(new Error('close connect'))).toBe(NETWORK_RETRYING);
    expect(swap.describeMakerFailure(new Error('Not enough confirmed Marscoin to offer right now.'))).toBe(
      'Not enough confirmed Marscoin to offer right now.',
    );
    expect(swap.describeMakerFailure({})).toBe('Offers could not be refreshed. Trying again shortly.');
  });
});
