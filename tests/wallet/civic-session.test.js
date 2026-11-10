import { createCivicSessionManager } from '../../blue_modules/civic-session-manager';
function setup() {
  const data = new Map();
  const storage = {
    read: jest.fn(async address => data.get(address)),
    write: jest.fn(async (address, token) => data.set(address, token)),
    remove: jest.fn(async address => data.delete(address)),
  };
  const authenticate = jest.fn(async () => ({ token: 'session-a' }));
  const session = createCivicSessionManager({ storage, authenticate });
  const wallet = address => ({
    getID: () => address,
    _getExternalAddressByIndex: () => address,
  });
  return { session, storage, authenticate, data, wallet };
}
describe('Civic session lifecycle', () => {
  it('deduplicates concurrent logins and reuses a securely saved session', async () => {
    const { session, authenticate, storage, wallet } = setup();
    session.configure(wallet('a'));
    expect(await Promise.all([session.getToken(), session.getToken()])).toEqual(['session-a', 'session-a']);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(storage.write).toHaveBeenCalledWith('a', 'session-a');
    session.configure(wallet('a'));
    await session.getToken();
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  it('does not assign a previous identity’s delayed login to the new wallet', async () => {
    const { session, authenticate, storage, wallet } = setup();
    let finish;
    authenticate.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    session.configure(wallet('a'));
    const old = session.getToken();
    await Promise.resolve();
    session.configure(wallet('b'));
    authenticate.mockResolvedValue({ token: 'session-b' });
    finish({ token: 'stale-a' });
    await expect(old).rejects.toThrow('wallet changed');
    expect(await session.getToken()).toBe('session-b');
    expect(storage.write).not.toHaveBeenCalledWith('b', 'stale-a');
  });
  it('invalidates expired tokens and signs in again on retry', async () => {
    const { session, wallet, authenticate } = setup();
    session.configure(wallet('a'));
    await session.getToken();
    await session.invalidate('session-a');
    expect(session.getSnapshot().status).toBe('expired');
    authenticate.mockResolvedValue({ token: 'replacement' });
    expect(await session.getToken()).toBe('replacement');
  });
  it('ignores a 401 from a different or old token', async () => {
    const { session, wallet, storage } = setup();
    session.configure(wallet('a'));
    await session.getToken();
    await session.invalidate('old-token');
    expect(session.getSnapshot().status).toBe('active');
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('keeps wallet ownership separate from an inactive Republic account', async () => {
    const { session, wallet, authenticate, storage } = setup();
    const identity = wallet('a');
    session.configure(identity);
    authenticate.mockResolvedValue({ token: 'inactive' });
    await expect(session.getToken()).rejects.toThrow('inactive');
    expect(session.getSnapshot()).toEqual({ address: 'a', status: 'inactive' });
    expect(storage.remove).toHaveBeenCalledWith('a');
    expect(identity.getID()).toBe('a');
  });
  it('sanitizes HTTP errors and permits an offline retry', async () => {
    const { session, wallet, authenticate } = setup();
    session.configure(wallet('a'));
    authenticate.mockRejectedValueOnce(new Error('sensitive authorization request'));
    await expect(session.getToken()).rejects.toThrow('Check your connection');
    expect(session.getSnapshot().status).toBe('unavailable');
    expect(await session.getToken()).toBe('session-a');
  });
  it('does not report a session as active when secure storage fails', async () => {
    const { session, wallet, storage } = setup();
    session.configure(wallet('a'));
    storage.write.mockRejectedValue(new Error('storage unavailable'));
    await expect(session.getToken()).rejects.toThrow('unavailable');
    expect(session.getSnapshot().status).toBe('unavailable');
  });
  it('stops access when the civic wallet is removed', async () => {
    const { session, wallet } = setup();
    session.configure(wallet('a'));
    await session.getToken();
    session.configure(undefined);
    await expect(session.getToken()).rejects.toThrow('Restore');
    expect(session.getSnapshot().status).toBe('signed-out');
  });
});
