import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import ElectrumClient from 'electrum-client';
import { MARS_MAINNET_GENESIS, defaultMarsElectrumPeer } from '../../blue_modules/mars-electrum-peer';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }));
jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('react-native-default-preference', () => ({ setName: jest.fn(), set: jest.fn() }));
jest.mock('realm', () => ({}));
jest.mock('../../class', () => ({}));
jest.mock('../../blue_modules/WidgetCommunication', () => ({ reloadAllTimelines: jest.fn() }));
jest.mock('../../components/Alert', () => jest.fn());
jest.mock('../../loc', () => ({ errors: {}, settings: {}, wallets: {}, _: {}, formatString: jest.fn() }));
jest.mock('electrum-client', () => jest.fn());

const electrum = require('../../blue_modules/BlueElectrum');

describe('app startup Electrum client', () => {
  let client;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    client = {
      initElectrum: jest.fn().mockResolvedValue(['ElectrumMARS']),
      server_features: jest.fn().mockResolvedValue({ genesis_hash: MARS_MAINNET_GENESIS }),
      blockchainHeaders_subscribe: jest.fn().mockResolvedValue({ height: 1 }),
      close: jest.fn(),
    };
    ElectrumClient.mockImplementation(() => client);
  });
  afterEach(() => jest.restoreAllMocks());
  // Stop the quiet retries that follow a failed connection.
  afterAll(() => electrum.forceDisconnect());
  it.each([null, '161.35.136.251', '164.90.138.207'])(
    'uses the current Marscoin server for a fresh install or former default %s',
    async host => {
      AsyncStorage.getItem.mockImplementation(async key => ({ electrum_host: host, electrum_ssl_port: '50002' })[key] ?? null);
      await electrum.connectMain();
      expect(ElectrumClient).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        defaultMarsElectrumPeer.ssl,
        defaultMarsElectrumPeer.host,
        'tls',
      );
      expect(client.server_features).toHaveBeenCalled();
      expect(client.blockchainHeaders_subscribe).toHaveBeenCalled();
    },
  );
  it('rejects the wrong chain before accepting headers', async () => {
    AsyncStorage.getItem.mockResolvedValue(null);
    client.server_features.mockResolvedValue({ genesis_hash: 'wrong-chain' });
    await electrum.connectMain();
    expect(client.blockchainHeaders_subscribe).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });
});
