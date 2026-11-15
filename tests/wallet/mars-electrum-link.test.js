import { EventEmitter } from 'events';
import {
  MarsNetworkError,
  NETWORK_RETRYING,
  NETWORK_UNREACHABLE,
  SEND_INTERRUPTED,
  createElectrumLink,
  describeConnectionFailure,
  guarded,
  isConnectionFailure,
  userMessage,
} from '../../blue_modules/mars-electrum-link';
import { MARS_MAINNET_GENESIS, assertMarsMainnet, marsElectrumPeers, selectMarsElectrumPeer } from '../../blue_modules/mars-electrum-peer';

// The real electrum-client, on sockets that never leave this process.
const ElectrumClient = jest.requireActual('electrum-client');

const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async (turns = 8) => {
  for (let i = 0; i < turns; i++) await tick();
};

function fakeNetwork() {
  const network = {
    sockets: [],
    requests: [],
    down: new Set(), // hosts that refuse connections
    silent: false, // accept requests but never answer
    answers: {
      'server.version': () => ['ElectrumX 1.16.0', '1.4'],
      'server.features': () => ({ genesis_hash: MARS_MAINNET_GENESIS }),
      'blockchain.headers.subscribe': () => ({ height: 3599779 }),
      'server.ping': () => null,
    },
    live: () => network.sockets.filter(socket => socket.open),
  };
  class Socket extends EventEmitter {
    constructor() {
      super();
      network.sockets.push(this);
    }

    setTimeout() {}
    setEncoding() {}
    setKeepAlive() {}
    setNoDelay() {}

    connect({ host }, connected) {
      this.host = host;
      setImmediate(() => {
        if (network.down.has(host)) {
          this.emit('error', new Error('connect ECONNREFUSED'));
          this.emit('close');
          return;
        }
        this.open = true;
        connected();
        this.emit('connect');
      });
    }

    write(text) {
      const message = JSON.parse(text);
      const reply = one => {
        network.requests.push({ host: this.host, method: one.method, params: one.params });
        const answer = network.answers[one.method];
        try {
          return { jsonrpc: '2.0', id: one.id, result: answer ? answer(one.params, this) : null };
        } catch (error) {
          return { jsonrpc: '2.0', id: one.id, error: { code: 1, message: error.message } };
        }
      };
      const response = Array.isArray(message) ? message.map(reply) : reply(message);
      if (network.silent || this.mute) return;
      setImmediate(() => this.open && this.emit('data', JSON.stringify(response) + '\n'));
    }

    end() {}

    destroy() {
      if (!this.open) return;
      this.open = false;
      setImmediate(() => this.emit('close'));
    }

    // The far end, or the phone's operating system, closes the socket.
    drop() {
      this.open = false;
      this.emit('close');
    }
  }
  network.net = { Socket };
  return network;
}

function makeLink(network, overrides = {}) {
  const events = [];
  const link = createElectrumLink({
    pickPeer: async failures => selectMarsElectrumPeer(null, failures),
    openClient: peer => new ElectrumClient(network.net, null, peer.ssl, peer.host, 'tcp'),
    handshake: async client => {
      const version = await client.initElectrum({ client: 'test', version: '1.4' }, { maxRetry: 0, callback: null });
      assertMarsMainnet(await client.server_features());
      await client.blockchainHeaders_subscribe();
      return { version };
    },
    onUp: (client, details, peer) => events.push(['up', peer.host]),
    onDown: () => events.push(['down']),
    onGiveUp: (peer, error, { background }) => events.push(['gave up', background]),
    attemptDelay: 1,
    firstRetryDelay: 40,
    maxRetryDelay: 160,
    requestTimeout: 60,
    pingTimeout: 60,
    connectTimeout: () => 200,
    ...overrides,
  });
  return { link, events };
}

const [first, second] = marsElectrumPeers.map(peer => peer.host);
const connections = network => network.sockets.map(socket => socket.host);
const balance = client => client.blockchainScripthash_getBalance('00');
// Send a request and have the socket close before any answer: electrum-client
// rejects it with "close connect".
const dieInFlight = (network, send) => {
  network.silent = true;
  const pending = send();
  network.silent = false;
  network.live().forEach(socket => socket.drop());
  return pending;
};

describe('Marscoin Electrum connection', () => {
  let network;
  let link;
  let events;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    network = fakeNetwork();
    network.answers['blockchain.scripthash.get_balance'] = () => ({ confirmed: 7, unconfirmed: 0 });
    ({ link, events } = makeLink(network));
  });
  afterEach(() => {
    link.disconnect();
    jest.restoreAllMocks();
  });

  it('connects to the first bundled server and checks the chain', async () => {
    await link.ensureConnected();
    expect(connections(network)).toEqual([first]);
    expect(network.requests.map(request => request.method)).toEqual(['server.version', 'server.features', 'blockchain.headers.subscribe']);
    expect(link.isConnected()).toBe(true);
  });

  it('notices a closed socket and reconnects on the next request', async () => {
    await link.ensureConnected();
    network.sockets[0].drop();
    expect(link.isConnected()).toBe(false);
    expect(events).toContainEqual(['down']);

    await expect(link.run(balance)).resolves.toEqual({ confirmed: 7, unconfirmed: 0 });
    expect(connections(network)).toEqual([first, first]);
    expect(link.isConnected()).toBe(true);
  });

  it('reconnects by itself after a loss, without waiting for a request', async () => {
    ({ link } = makeLink(network, { timers: { setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout } }));
    await link.ensureConnected();
    network.sockets[0].drop();
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(link.isConnected()).toBe(true);
    expect(network.sockets).toHaveLength(2);
  });

  it('tries the other bundled server when the first cannot be reached', async () => {
    network.down.add(first);
    await link.ensureConnected();
    expect(connections(network)).toEqual([first, second]);
    expect(events).toContainEqual(['up', second]);
  });

  it('repeats a read once when the connection dies under it, and hides the library error', async () => {
    await link.ensureConnected();
    let calls = 0;
    const task = jest.fn(async client => (++calls === 1 ? dieInFlight(network, () => balance(client)) : balance(client)));
    await expect(link.run(task)).resolves.toEqual({ confirmed: 7, unconfirmed: 0 });
    expect(task).toHaveBeenCalledTimes(2);
    expect(network.sockets).toHaveLength(2);
  });

  it('gives up after one repeat, in plain words', async () => {
    await link.ensureConnected();
    const task = jest.fn(async client => dieInFlight(network, () => balance(client)));
    const failure = await link.run(task).catch(error => error);
    expect(task).toHaveBeenCalledTimes(2);
    expect(failure).toBeInstanceOf(MarsNetworkError);
    expect(failure.message).toBe(NETWORK_UNREACHABLE);
    expect(failure.message).not.toMatch(/close connect/);
    expect(failure.cause.message).toBe('close connect');
  });

  it('never repeats a broadcast', async () => {
    await link.ensureConnected();
    network.answers['blockchain.transaction.broadcast'] = () => 'txid';
    const task = jest.fn(async client => dieInFlight(network, () => client.blockchainTransaction_broadcast('00')));
    const failure = await link.run(task, { retry: false, interrupted: SEND_INTERRUPTED }).catch(error => error);
    expect(task).toHaveBeenCalledTimes(1);
    expect(failure.message).toBe(SEND_INTERRUPTED);
    expect(network.requests.filter(request => request.method === 'blockchain.transaction.broadcast')).toHaveLength(1);
  });

  it('passes a refusal by the server through untouched, without reconnecting', async () => {
    network.answers['blockchain.transaction.broadcast'] = () => {
      throw new Error('bad-txns-inputs-missingorspent');
    };
    const task = jest.fn(client => client.blockchainTransaction_broadcast('00'));
    await expect(link.run(task)).rejects.toEqual({ code: 1, message: 'bad-txns-inputs-missingorspent' });
    expect(task).toHaveBeenCalledTimes(1);
    expect(network.sockets).toHaveLength(1);
    expect(link.isConnected()).toBe(true);
  });

  it('opens one connection however many requests arrive while it is down', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => link.run(balance)));
    expect(results).toHaveLength(12);
    expect(network.sockets).toHaveLength(1);
  });

  it('answers requests in flight when it closes a dead connection, instead of leaving them waiting', async () => {
    const client = await link.ensureConnected();
    network.silent = true;
    const pending = balance(client).catch(error => error);
    // What electrum-client reports when its keep-alive ping goes unanswered.
    client.onError(new Error('keepalive ping timeout'));
    const failure = await pending;
    expect(failure).toBeInstanceOf(Error);
    expect(link.isConnected()).toBe(false);
  });

  it('abandons a request the server never answers and replaces the connection', async () => {
    await link.ensureConnected();
    network.silent = true;
    const task = jest.fn(async client => {
      const pending = balance(client);
      // The replacement connection reaches a server that answers.
      pending.catch(() => (network.silent = false));
      return pending;
    });
    await expect(link.run(task)).resolves.toEqual({ confirmed: 7, unconfirmed: 0 });
    expect(task).toHaveBeenCalledTimes(2);
    expect(network.sockets).toHaveLength(2);
  });

  it('does not hammer unreachable servers: one round, then a wait, then a quiet retry', async () => {
    network.down.add(first).add(second);
    const failure = await link.run(balance).catch(error => error);
    expect(failure.message).toBe(NETWORK_UNREACHABLE);
    // Both servers, twice each.
    expect(connections(network)).toEqual([first, second, first, second]);
    expect(events).toContainEqual(['gave up', false]);

    // Requests during the wait fail at once and open nothing.
    await expect(link.run(balance)).rejects.toThrow(NETWORK_UNREACHABLE);
    await expect(link.run(balance)).rejects.toThrow(NETWORK_UNREACHABLE);
    expect(network.sockets).toHaveLength(4);

    // The servers come back; the scheduled retry finds them unprompted.
    network.down.clear();
    await new Promise(resolve => setTimeout(resolve, 120));
    await settle();
    expect(link.isConnected()).toBe(true);
    await expect(link.run(balance)).resolves.toEqual({ confirmed: 7, unconfirmed: 0 });
  });

  it('on return to the foreground, replaces a connection that died silently', async () => {
    await link.ensureConnected();
    // The socket is dead but no close event ever arrived.
    network.sockets[0].mute = true;
    await expect(link.resume()).resolves.toBe(true);
    expect(network.sockets).toHaveLength(2);
    expect(link.isConnected()).toBe(true);
  });

  it('on return to the foreground, retries at once even while waiting', async () => {
    network.down.add(first).add(second);
    await link.ensureConnected().catch(() => {});
    network.down.clear();
    await expect(link.resume()).resolves.toBe(true);
    expect(link.isConnected()).toBe(true);
  });

  it('refuses a server on another chain', async () => {
    network.answers['server.features'] = () => ({ genesis_hash: 'another-chain' });
    await expect(link.ensureConnected()).rejects.toThrow(NETWORK_UNREACHABLE);
    expect(network.requests.some(request => request.method === 'blockchain.headers.subscribe')).toBe(false);
    expect(link.isConnected()).toBe(false);
  });

  it('stays closed after a deliberate disconnect until asked again', async () => {
    await link.ensureConnected();
    link.disconnect();
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(network.sockets).toHaveLength(1);
    expect(link.isConnected()).toBe(false);
    await link.ensureConnected({ force: true });
    expect(link.isConnected()).toBe(true);
  });

  it('wraps a module function so callers need not think about the connection', async () => {
    const api = { read: guarded(link, async () => balance(link.current())) };
    await expect(api.read()).resolves.toEqual({ confirmed: 7, unconfirmed: 0 });
    network.sockets[0].drop();
    await expect(api.read()).resolves.toEqual({ confirmed: 7, unconfirmed: 0 });
  });
});

describe('connection errors in plain words', () => {
  it.each([
    'close connect',
    'Connection to server lost, please retry',
    'Electrum client is not connected',
    'Waiting for Electrum connection timeout',
    'connect ECONNREFUSED 10.0.0.1:50002',
    'Network request failed',
    'keepalive ping timeout',
  ])('recognises "%s" as a lost connection', message => {
    const error = new Error(message);
    expect(isConnectionFailure(error)).toBe(true);
    expect(describeConnectionFailure(error)).toBe(NETWORK_UNREACHABLE);
    expect(describeConnectionFailure(error, { retrying: true })).toBe(NETWORK_RETRYING);
    expect(userMessage(error)).toBe(NETWORK_UNREACHABLE);
  });

  it('keeps messages that are not about the connection', () => {
    const error = new Error('Not enough confirmed Marscoin to offer right now.');
    expect(isConnectionFailure(error)).toBe(false);
    expect(describeConnectionFailure(error)).toBeNull();
    expect(userMessage(error)).toBe(error.message);
  });

  it('does not mistake a reply from the server for a lost connection', () => {
    expect(isConnectionFailure({ code: 1, message: 'the transaction was rejected: timeout' })).toBe(false);
    expect(isConnectionFailure(null)).toBe(false);
  });

  it('keeps the warning about an interrupted send', () => {
    expect(userMessage(new MarsNetworkError(SEND_INTERRUPTED))).toBe(SEND_INTERRUPTED);
    expect(userMessage({}, 'fallback')).toBe('fallback');
  });
});
