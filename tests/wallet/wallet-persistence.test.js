import { createRealmKeyLoader, persistWalletData } from '../../blue_modules/wallet-persistence';

describe('wallet persistence', () => {
  const setup = () => ({
    setItem: jest.fn().mockResolvedValue(),
    data: 'wallet-data',
    flagKey: 'data_encrypted',
    encrypted: '',
    openBackup: jest.fn().mockResolvedValue({ close: jest.fn() }),
    writeBackup: jest.fn(),
    onBackupError: jest.fn(),
  });
  it.each(['open', 'write', 'close'])('keeps a successful secure save when the secondary backup cannot %s', async stage => {
    const io = setup();
    if (stage === 'open') io.openBackup.mockRejectedValue(new Error('Realm file decryption failed'));
    if (stage === 'write')
      io.writeBackup.mockImplementation(() => {
        throw new Error('Backup unavailable');
      });
    if (stage === 'close')
      io.openBackup.mockResolvedValue({
        close: () => {
          throw new Error('Close failed');
        },
      });
    await expect(persistWalletData(io)).resolves.toBeUndefined();
    expect(io.setItem).toHaveBeenNthCalledWith(1, 'data', 'wallet-data');
    expect(io.setItem).toHaveBeenNthCalledWith(2, 'data_encrypted', '');
    expect(io.onBackupError).toHaveBeenCalled();
  });
  it.each([1, 2])('reports primary storage failure at write %i without touching the backup', async write => {
    const io = setup();
    if (write === 2) io.setItem.mockResolvedValueOnce();
    io.setItem.mockRejectedValueOnce(new Error('Keychain unavailable'));
    await expect(persistWalletData(io)).rejects.toThrow('Keychain unavailable');
    expect(io.openBackup).not.toHaveBeenCalled();
  });
  it('closes the backup after a failed write', async () => {
    const io = setup();
    const backup = { close: jest.fn() };
    io.openBackup.mockResolvedValue(backup);
    io.writeBackup.mockImplementation(() => {
      throw new Error('Write failed');
    });
    await persistWalletData(io);
    expect(backup.close).toHaveBeenCalledTimes(1);
  });
});

describe('first-launch backup encryption', () => {
  it('shares initialization across concurrent readers, preventing two different keys', async () => {
    let finish;
    const keychain = {
      getGenericPassword: jest.fn().mockResolvedValue(false),
      setGenericPassword: jest.fn(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      ),
    };
    const random = jest.fn().mockResolvedValue(Buffer.alloc(64, 3));
    const load = createRealmKeyLoader(keychain, random);
    const first = load();
    const second = load();
    await Promise.resolve();
    await Promise.resolve();
    finish(true);
    expect(await first).toBe(await second);
    expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledTimes(1);
  });
  it('preserves an existing key without generating or writing another', async () => {
    const keychain = {
      getGenericPassword: jest.fn().mockResolvedValue({ password: 'existing-key' }),
      setGenericPassword: jest.fn(),
    };
    const random = jest.fn();
    expect(await createRealmKeyLoader(keychain, random)()).toBe('existing-key');
    expect(random).not.toHaveBeenCalled();
    expect(keychain.setGenericPassword).not.toHaveBeenCalled();
  });
  it('allows retry after Keychain rejects initialization', async () => {
    const keychain = {
      getGenericPassword: jest.fn().mockResolvedValue(false),
      setGenericPassword: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };
    const load = createRealmKeyLoader(keychain, async () => Buffer.alloc(64, 3));
    await expect(load()).rejects.toThrow('initialize');
    await expect(load()).resolves.toHaveLength(128);
  });
});
