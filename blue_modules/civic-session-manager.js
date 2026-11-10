// Pure session lifecycle; native storage and HTTP are supplied by civic-api.
export function createCivicSessionManager({ storage, authenticate }) {
  let wallet;
  let generation = 0;
  let token;
  let pending;
  const rejected = new Set();
  let snapshot = { address: null, status: 'signed-out' };
  const listeners = new Set();
  const publish = status => {
    snapshot = {
      address: wallet?._getExternalAddressByIndex(0) || null,
      status,
    };
    listeners.forEach(listener => listener());
  };
  const getToken = async () => {
    if (!wallet) throw new Error('Restore your civic wallet to sign in.');
    if (token) return token;
    if (pending) return pending;
    const current = generation;
    const identity = wallet;
    const address = identity._getExternalAddressByIndex(0);
    const expired = snapshot.status === 'expired';
    publish('connecting');
    const checkIdentity = () => {
      if (current !== generation) throw new Error('The civic wallet changed. Please try again.');
    };
    pending = (async () => {
      try {
        let nextToken = expired ? null : await storage.read(address);
        if (rejected.has(nextToken)) nextToken = null;
        checkIdentity();
        if (!nextToken) {
          const data = await authenticate(identity);
          checkIdentity();
          if (data?.token === 'inactive') {
            await storage.remove(address);
            checkIdentity();
            publish('inactive');
            throw new Error('Your Republic account is inactive. Your wallets remain available.');
          }
          if (typeof data?.token !== 'string' || !data.token.trim()) throw new Error('The Republic did not return a valid session.');
          nextToken = data.token;
          await storage.write(address, nextToken);
          checkIdentity();
        }
        token = nextToken;
        publish('active');
        return token;
      } catch (error) {
        if (current === generation && snapshot.status !== 'inactive') publish('unavailable');
        // HTTP errors can contain signed requests and bearer tokens.
        throw new Error(
          current !== generation
            ? 'The civic wallet changed. Please try again.'
            : snapshot.status === 'inactive'
              ? 'Your Republic account is inactive. Your wallets remain available.'
              : 'Citizen services are unavailable. Check your connection and try again.',
        );
      } finally {
        if (current === generation) pending = undefined;
      }
    })();
    return pending;
  };
  return {
    configure(nextWallet) {
      if (wallet?.getID() === nextWallet?.getID()) return;
      wallet = nextWallet;
      generation++;
      token = undefined;
      pending = undefined;
      publish(wallet ? 'connecting' : 'signed-out');
    },
    getToken,
    async invalidate(rejectedToken) {
      if (!token || token !== rejectedToken) return;
      const address = snapshot.address;
      const current = generation;
      rejected.add(rejectedToken);
      token = undefined;
      // Clear before publishing so a UI retry cannot reload the rejected token.
      try {
        await storage.remove(address);
      } finally {
        if (current === generation) publish('expired');
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}
