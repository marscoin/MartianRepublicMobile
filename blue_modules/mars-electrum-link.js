// Keeps one Electrum connection usable: notices when it is lost, replaces it
// on demand (trying the bundled servers in turn), and repeats a read that died
// with the connection. Shared by the two wallet connections so they recover
// the same way. Has no dependency on React Native, so it runs under test.

export const NETWORK_UNREACHABLE = 'Could not reach the Marscoin network. Check your connection and try again.';
export const NETWORK_RETRYING = 'Could not reach the Marscoin network. Retrying…';
export const SEND_INTERRUPTED =
  'The connection dropped while sending. Check your transaction history before sending again, so the payment is not made twice.';

export class MarsNetworkError extends Error {
  constructor(message = NETWORK_UNREACHABLE, cause) {
    super(message);
    this.name = 'MarsNetworkError';
    this.code = 'MARS_NETWORK';
    this.cause = cause;
  }
}

// Texts the Electrum client, the socket layer and this app's older guards use
// for a failed connection. `close connect` is what electrum-client rejects
// every request in flight with when its socket closes.
const CONNECTION_TEXT =
  /close connect|connection to server lost|client is not connected|not connected|timed? ?out|ECONN|EPIPE|ENOTCONN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|socket|network request failed|unable to reach|could not reach|aborted/i;

// The Electrum client rejects with the server's plain reply object when the
// server refuses a request, and with an Error when the connection failed. Only
// the second kind is worth a reconnection.
export function isConnectionFailure(error) {
  if (!error) return false;
  if (error.code === 'MARS_NETWORK') return true;
  if (!(error instanceof Error)) return false;
  return CONNECTION_TEXT.test(String(error.message));
}

// Plain words for a failed connection, or null when the error is something
// else and its own message should be shown.
export function describeConnectionFailure(error, { retrying = false } = {}) {
  if (!isConnectionFailure(error)) return null;
  if (error.message === SEND_INTERRUPTED) return SEND_INTERRUPTED;
  return retrying ? NETWORK_RETRYING : NETWORK_UNREACHABLE;
}

// The message to show a person: never the library's own wording.
export function userMessage(error, fallback = 'Something went wrong. Please try again.', options) {
  return describeConnectionFailure(error, options) || (typeof error?.message === 'string' && error.message ? error.message : fallback);
}

const TIMED_OUT = 'The Marscoin network did not answer in time (timeout).';

export function createElectrumLink({
  // async failures => peer, or null when connections are switched off.
  pickPeer,
  // peer => a new, unconnected electrum-client instance.
  openClient,
  // async (client, peer) => details; must reject unless the server is usable.
  handshake,
  onUp = () => {},
  onDown = () => {},
  // (peer, error, { background }) after every server was tried without success.
  onGiveUp = () => {},
  log = () => {},
  timers = { setTimeout, clearTimeout },
  now = Date.now,
  connectTimeout = () => 12000,
  requestTimeout = 25000,
  pingTimeout = 8000,
  attemptsPerRound = 4,
  attemptDelay = 400,
  firstRetryDelay = 2000,
  maxRetryDelay = 60000,
}) {
  let client = null;
  let connecting = null;
  let failures = 0; // consecutive failed attempts; selects the server to try
  let failedRounds = 0;
  let holdUntil = 0;
  let retryTimer = null;
  let paused = false; // closed on purpose; nothing reconnects until asked

  const sleep = milliseconds => new Promise(resolve => timers.setTimeout(resolve, milliseconds));

  function withTimeout(promise, milliseconds, onTimeout) {
    let timer;
    return Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = timers.setTimeout(() => {
          const error = new Error(TIMED_OUT);
          onTimeout?.(error);
          reject(error);
        }, milliseconds);
      }),
    ]).finally(() => timers.clearTimeout(timer));
  }

  // Closing an electrum-client silences its own close handler, which is what
  // answers the requests still in flight. Answer them first, or their callers
  // wait for ever.
  function dispose(target) {
    if (!target || target.__marsDisposed) return;
    target.__marsDisposed = true;
    try {
      const pending = target.callback_message_queue;
      for (const key of Object.keys(pending || {})) {
        const answer = pending[key];
        delete pending[key];
        try {
          answer(new Error('close connect'));
        } catch {
          /* One caller's failure must not stop the others being answered. */
        }
      }
    } catch {
      /* Not an electrum-client; nothing in flight to answer. */
    }
    try {
      target.close?.();
    } catch {
      /* Already closed. */
    }
  }

  function scheduleRetry(delay) {
    if (retryTimer || paused) return;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      ensureConnected({ force: true, background: true }).catch(() => {});
    }, delay);
    // Under Node a waiting retry must not keep the process alive.
    retryTimer?.unref?.();
  }

  function lose(target, reason) {
    dispose(target);
    if (client !== target) return;
    client = null;
    log('connection lost:', reason?.message || 'closed');
    onDown(reason);
    scheduleRetry(1000);
  }

  // Wire a new client so that every way of losing it ends in `lose`.
  function arm(target) {
    target.onError = error => lose(target, error);
    const libraryClose = typeof target.onClose === 'function' ? target.onClose.bind(target) : null;
    target.onClose = error => {
      try {
        libraryClose?.(error); // rejects the requests in flight
      } finally {
        lose(target, error instanceof Error ? error : undefined);
      }
    };
    // electrum-client has no request timeout: on a socket that died silently
    // (usual after the phone suspended the app) a request never returns.
    for (const method of ['request', 'requestBatch']) {
      if (typeof target[method] !== 'function') continue;
      const send = target[method].bind(target);
      target[method] = (...args) => withTimeout(send(...args), requestTimeout, error => lose(target, error));
    }
  }

  async function round(background) {
    let lastError;
    let lastPeer;
    for (let attempt = 0; attempt < attemptsPerRound; attempt++) {
      if (attempt) await sleep(attemptDelay * 2 ** (attempt - 1));
      if (paused) throw new MarsNetworkError();
      const peer = await pickPeer(failures);
      if (!peer) return null;
      lastPeer = peer;
      let candidate;
      try {
        log('connecting to', peer.host);
        candidate = openClient(peer);
        arm(candidate);
        const details = await withTimeout(handshake(candidate, peer), connectTimeout(peer));
        if (candidate.__marsDisposed) throw new Error('close connect');
        client = candidate;
        failures = 0;
        failedRounds = 0;
        holdUntil = 0;
        onUp(candidate, details, peer);
        return candidate;
      } catch (error) {
        lastError = error;
        failures += 1;
        log('could not connect to', peer.host, error?.message);
        dispose(candidate);
      }
    }
    onGiveUp(lastPeer, lastError, { background });
    throw new MarsNetworkError(NETWORK_UNREACHABLE, lastError);
  }

  // One connection attempt at a time, whoever asks. While the servers cannot
  // be reached, callers are refused at once until the next scheduled attempt,
  // so a screenful of requests cannot hammer the servers.
  function ensureConnected({ force = false, background = false } = {}) {
    if (force) paused = false;
    if (client && client.status === 0) lose(client);
    if (client) return Promise.resolve(client);
    if (connecting) return connecting;
    if (!force && now() < holdUntil) return Promise.reject(new MarsNetworkError());
    paused = false;
    if (retryTimer) {
      timers.clearTimeout(retryTimer);
      retryTimer = null;
    }
    const started = round(background).then(
      connected => connected,
      error => {
        failedRounds += 1;
        const delay = Math.min(firstRetryDelay * 2 ** (failedRounds - 1), maxRetryDelay);
        holdUntil = now() + delay;
        scheduleRetry(delay);
        throw error;
      },
    );
    connecting = started;
    const clear = () => {
      if (connecting === started) connecting = null;
    };
    started.then(clear, clear);
    return started;
  }

  // Run `task(client)`. A read that fails because the connection died is run
  // once more on a fresh connection. Anything that must not be repeated
  // (a broadcast) passes `retry: false`.
  async function run(task, { retry = true, interrupted = NETWORK_UNREACHABLE } = {}) {
    let current = await ensureConnected();
    try {
      return await task(current);
    } catch (error) {
      if (!isConnectionFailure(error)) throw error;
      if (current) lose(current, error);
      if (!retry) throw new MarsNetworkError(interrupted, error);
      // Not forced: if every server was just tried, fail now rather than
      // start another round for each request that was in flight.
      current = await ensureConnected();
      try {
        return await task(current);
      } catch (again) {
        if (!isConnectionFailure(again)) throw again;
        if (current) lose(current, again);
        throw new MarsNetworkError(NETWORK_UNREACHABLE, again);
      }
    }
  }

  // True when the server answers now. A dead connection is replaced.
  async function ping() {
    let current;
    try {
      current = await ensureConnected({ force: true });
      if (!current) return false;
      await withTimeout(current.server_ping(), pingTimeout);
      return true;
    } catch (error) {
      if (current) lose(current, error);
      return false;
    }
  }

  // The app came back to the foreground, or the person asked to try again:
  // forget the waiting period and make sure the connection really works.
  async function resume() {
    holdUntil = 0;
    failedRounds = 0;
    if (await ping()) return true;
    try {
      return !!(await ensureConnected({ force: true }));
    } catch {
      return false;
    }
  }

  // Close on purpose (settings, offline mode). Nothing reconnects until the
  // next explicit request.
  function disconnect() {
    paused = true;
    if (retryTimer) {
      timers.clearTimeout(retryTimer);
      retryTimer = null;
    }
    const current = client;
    client = null;
    dispose(current);
    if (current) onDown();
  }

  return {
    ensureConnected,
    run,
    ping,
    resume,
    disconnect,
    isConnected: () => !!client && client.status !== 0,
    current: () => client,
  };
}

// Wrap a connection module's function so it connects first and, for reads,
// survives one lost connection.
export function guarded(link, fn, options) {
  return function (...args) {
    return link.run(() => fn.apply(this, args), options);
  };
}
