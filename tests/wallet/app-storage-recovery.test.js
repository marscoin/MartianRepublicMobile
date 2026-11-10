jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
}));
jest.mock('react-native-secure-key-store', () => ({ ACCESSIBLE: {} }));
jest.mock('react-native-keychain', () => ({}));
jest.mock('react-native-default-preference', () => ({}));
jest.mock('realm', () => ({}));
jest.mock('../../class', () => ({}));
jest.mock('../../class/biometrics', () => ({}));
jest.mock('../../class/rng', () => ({ randomBytes: jest.fn() }));
jest.mock('../../loc', () => ({}));
jest.mock('../../components/Alert', () => jest.fn());
jest.mock('../../helpers/prompt', () => jest.fn());
jest.mock('../../blue_modules/currency', () => ({
  initCurrencyDaemon: jest.fn(),
}));
jest.mock('../../blue_modules/BlueElectrum', () => ({
  connectMain: jest.fn(),
}));
jest.mock('../../blue_modules/MARSConnection', () => ({}));
jest.mock('../../screen/wallets/mars-wallet', () => ({
  MarsElectrumWallet: class {},
}));

const { AppStorage } = require('../../BlueApp');

const setup = () => {
  const app = new AppStorage();
  app.wallets = [
    {
      type: 'test',
      secret: 'test-only',
      _txs_by_external_index: { 0: [{ txid: 'public-tx' }] },
      prepareForSerialization() {},
    },
  ];
  app.setItem = jest.fn().mockResolvedValue();
  app.getRealm = jest.fn().mockRejectedValue(new Error('Cache unavailable'));
  app.openRealmKeyValue = jest.fn().mockRejectedValue(new Error('Backup unavailable'));
  return app;
};

describe('AppStorage recovery saves', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());
  it('preserves the wallet and transactions when both Realm stores are unavailable', async () => {
    const app = setup();
    await expect(app.saveToDisk(true)).resolves.toBeUndefined();
    const data = JSON.parse(app.setItem.mock.calls.find(([key]) => key === 'data')[1]);
    expect(JSON.parse(data.wallets[0])).toMatchObject({
      secret: 'test-only',
      _txs_by_external_index: { 0: [{ txid: 'public-tx' }] },
    });
  });
  it('retains transactions after an offload failure and releases the cache', async () => {
    const app = setup();
    const cache = { close: jest.fn() };
    app.getRealm.mockResolvedValue(cache);
    app.offloadWalletToRealm = () => {
      throw new Error('Cache write failed');
    };
    await app.saveToDisk(true);
    expect(cache.close).toHaveBeenCalledTimes(1);
    const data = JSON.parse(app.setItem.mock.calls.find(([key]) => key === 'data')[1]);
    expect(JSON.parse(data.wallets[0])._txs_by_external_index[0]).toHaveLength(1);
  });
  it('reports an actual secure storage failure', async () => {
    const app = setup();
    app.setItem.mockRejectedValue(new Error('Device locked'));
    await expect(app.saveToDisk(true)).rejects.toThrow('could not be saved securely');
    expect(app.openRealmKeyValue).not.toHaveBeenCalled();
  });
  it('serializes overlapping saves and continues after a failed save', async () => {
    const app = setup();
    let finish;
    app._saveToDisk = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = reject;
          }),
      )
      .mockResolvedValueOnce();
    const first = app.saveToDisk(true);
    const second = app.saveToDisk(true);
    const checkFirst = expect(first).rejects.toThrow('could not be saved securely');
    await Promise.resolve();
    await Promise.resolve();
    expect(app._saveToDisk).toHaveBeenCalledTimes(1);
    finish(new Error('First save failed'));
    await checkFirst;
    await expect(second).resolves.toBeUndefined();
    expect(app._saveToDisk).toHaveBeenCalledTimes(2);
  });
});
