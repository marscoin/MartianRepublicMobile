// App wiring for atomic swaps: a dedicated connection to the swap relay, the
// two Bitcoin services, local swap records and a shared engine.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { assertMarsMainnet } from '../mars-electrum-peer';
import { createBtcWallet } from './btc-wallet';
import { createSwapEngine, isSwapFinished } from './engine';
import { createEsplora } from './esplora';
import { createMarsSwapChain, SWAP_RELAY } from './mars-chain';

const bitcoin = require('bitcoinjs-lib');
const ElectrumClient = require('electrum-client');
const net = require('net');
const tls = require('tls');

const STORAGE_KEY = 'org.martianrepublic.swaps.v1';
// Hardened branch reserved for swap contract keys, apart from any coin's
// addresses. Losing the phone still leaves the keys recoverable from the phrase.
const SWAP_KEY_PATH = "m/1017'/0'";
const TICK_SECONDS = 30;

// ---- Relay connection -------------------------------------------------------
// Acceptances are not shared between servers, and the market maker listens on
// this one, so swaps always use it regardless of the wallet's chosen server.

let client = null;
let connecting = null;

const CONNECT_TIMEOUT = 20000;
function withTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function connect() {
  const next = new ElectrumClient(net, tls, SWAP_RELAY.ssl, SWAP_RELAY.host, 'tls');
  next.onError = () => {
    if (client === next) client = null;
    next.close?.();
  };
  try {
    // No automatic reconnection: a dropped connection is replaced on demand.
    await withTimeout(
      (async () => {
        await next.initElectrum({ client: 'martianrepublic', version: '1.4' }, { maxRetry: 0, callback: null });
        assertMarsMainnet(await next.server_features());
      })(),
      CONNECT_TIMEOUT,
    );
  } catch {
    next.close?.();
    throw new Error('Unable to reach the Marscoin swap relay. Check your connection and try again.');
  }
  client = next;
  return next;
}

async function request(method, params) {
  if (client && client.status === 0) client = null;
  if (!client) {
    connecting = connecting || connect().finally(() => (connecting = null));
    await connecting;
  }
  const current = client;
  let timer;
  let response;
  try {
    response = await Promise.race([
      current.request(method, params),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('The Marscoin swap relay did not answer in time.')), 20000);
      }),
    ]);
  } catch (error) {
    // The client rejects with the server's plain error object when the relay
    // refuses a request, and with an Error when the connection itself failed.
    if (error instanceof Error) {
      if (client === current) client = null;
      current.close?.();
      throw error;
    }
    throw new Error(typeof error?.message === 'string' ? error.message : 'The swap relay refused the request.');
  } finally {
    clearTimeout(timer);
  }
  // For an empty result the client hands back the whole reply envelope.
  const envelope = response && typeof response === 'object' && !Array.isArray(response) && 'jsonrpc' in response && 'id' in response;
  return envelope ? response.result : response;
}

// ---- Local records ------------------------------------------------------------
// Records hold no private keys (those are derived from the recovery phrase),
// so they stay readable while the phone is locked and a refund is never blocked
// by an unavailable keystore.

let records = null;
let loading = null;
let snapshot = [];
const listeners = new Set();
const publish = () => {
  snapshot = [...records.values()].sort((a, b) => b.createdAt - a.createdAt).map(swap => ({ ...swap }));
  listeners.forEach(listener => listener());
};

// One load, shared by every caller, so there is only ever one live copy of
// each record.
function load() {
  loading =
    loading ||
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      records = new Map((raw ? JSON.parse(raw) : []).map(swap => [swap.id, swap]));
      publish();
      return records;
    });
  loading.catch(() => (loading = null));
  return loading;
}

const store = {
  async all() {
    return [...(await load()).values()];
  },
  async save(swap) {
    const map = await load();
    map.set(swap.id, swap);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...map.values()]));
    publish();
  },
};

// ---- Services -------------------------------------------------------------------

const MARSConnection = require('../MARSConnection');

export const esplora = createEsplora({ fetch: (...args) => fetch(...args) });
export const swapChain = createMarsSwapChain({
  request,
  fetch: (...args) => fetch(...args),
  // The wallet's own Marscoin connection, which may be a different server.
  broadcastElsewhere: hex => MARSConnection.broadcastV2(hex),
});

const services = new Map();

// Engine and Bitcoin wallet for the Marscoin wallet whose recovery phrase backs
// them. Records are bound to that wallet, so another wallet never signs for them.
export function getSwapServices(wallet) {
  const id = wallet.getID();
  if (services.has(id)) return services.get(id);
  const seed = wallet._getSeed();
  const root = bitcoin.bip32.fromSeed(seed).derivePath(SWAP_KEY_PATH);
  const btcWallet = createBtcWallet({ seed, esplora });
  const engine = createSwapEngine({
    wallet: btcWallet,
    chain: swapChain,
    btc: esplora,
    store: {
      all: async () => (await store.all()).filter(swap => swap.walletId === id),
      save: swap => store.save(Object.assign(swap, { walletId: id })),
    },
    swapKey: index => root.deriveHardened(index).privateKey,
    now: Date.now,
    randomId: () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
  });
  const created = { id, engine, btcWallet };
  services.set(id, created);
  return created;
}

// ---- Progress ---------------------------------------------------------------------

// Advance every swap of every wallet that has one. A pass that never returns
// (a stalled connection) is abandoned after a few minutes rather than
// blocking all later passes.
const STALE_PASS = 3 * 60 * 1000;
let runningSince = 0;
export async function advanceAllSwaps(wallets) {
  if (runningSince && Date.now() - runningSince < STALE_PASS) return;
  const started = Date.now();
  runningSince = started;
  try {
    const all = [...(await load()).values()];
    for (const wallet of wallets) {
      if (typeof wallet?._getSeed !== 'function' || !all.some(swap => swap.walletId === wallet.getID())) continue;
      await getSwapServices(wallet)
        .engine.tick()
        .catch(() => {});
    }
    publish();
  } catch {
    /* Offline; the next pass tries again. */
  } finally {
    if (runningSince === started) runningSince = 0;
  }
}

export const advanceSwaps = wallet => advanceAllSwaps([wallet]);

const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;

// Keeps swaps moving for as long as the app is open, whichever screen is
// showing: when the app starts, when it returns to the foreground, and every
// half minute. Claims and refunds depend on it. Mount once, near the root.
export function useSwapWatcher(wallets) {
  const current = useRef(wallets);
  current.current = wallets;
  useEffect(() => {
    const run = () => advanceAllSwaps(current.current);
    run();
    const timer = setInterval(run, TICK_SECONDS * 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}

// Live list of one wallet's swaps.
export function useSwaps(wallet) {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const id = wallet?.getID();
  useEffect(() => {
    load().catch(() => {});
  }, []);
  return all.filter(swap => swap.walletId === id);
}

// The wallet that owns a swap still in progress, if any. Screens keep showing
// that wallet's swaps even if another wallet is added meanwhile.
export function useSwapOwnerId() {
  const all = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return all.find(swap => !isSwapFinished(swap))?.walletId || all[0]?.walletId || null;
}

export async function hasUnfinishedSwaps(walletId) {
  return [...(await load()).values()].some(swap => !isSwapFinished(swap) && (!walletId || swap.walletId === walletId));
}
