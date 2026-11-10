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
import { DEFAULT_MAKER_CONFIG, OFFER_SECONDS, REFRESH_SECONDS, marketRate, normalizeMakerConfig, planOffers } from './automaker';
import { MARS_NETWORK } from './htlc';
import { MakerState, createMakerEngine, isMakerFinished } from './maker';
import { randomBytes } from '../../class/rng';

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

// ============================================================================
// Offering Marscoin for Bitcoin (maker side)
// ============================================================================
// Offers are live only while the app is open: answering an acceptance means
// signing a Marscoin transaction, which only this phone can do. When the app
// leaves the foreground the open offers are withdrawn; swaps already under way
// are picked up again when it returns, and unwind safely if it does not.

const MAKER_STORAGE_KEY = 'org.martianrepublic.maker.v1';
const MAKER_CONFIG_KEY = 'org.martianrepublic.maker.config.v1';
const MAKER_KEY_PATH = "m/1017'/1'";
const PRICE_FEED = 'https://price.marscoin.org/json/';
const BTC_PRICE_FEED = 'https://mempool.space/api/v1/prices';

let makerRecords = null;
let makerLoading = null;
let makerSnapshot = [];
let makerConfig = null;
let makerStatus = { market: 0, marsUsd: 0, position: null, message: null, checkedAt: 0 };
const makerListeners = new Set();
const publishMaker = () => {
  makerSnapshot = makerRecords ? [...makerRecords.values()].sort((a, b) => b.createdAt - a.createdAt).map(record => ({ ...record })) : [];
  makerListeners.forEach(listener => listener());
};

function loadMaker() {
  makerLoading =
    makerLoading ||
    Promise.all([AsyncStorage.getItem(MAKER_STORAGE_KEY), AsyncStorage.getItem(MAKER_CONFIG_KEY)]).then(([raw, rawConfig]) => {
      makerRecords = new Map((raw ? JSON.parse(raw) : []).map(record => [record.id, record]));
      let stored = null;
      try {
        stored = rawConfig ? JSON.parse(rawConfig) : null;
      } catch {
        /* An unreadable configuration falls back to the defaults, switched off. */
      }
      makerConfig = normalizeMakerConfig(stored);
      publishMaker();
      return makerRecords;
    });
  makerLoading.catch(() => (makerLoading = null));
  return makerLoading;
}

const persistMaker = map => AsyncStorage.setItem(MAKER_STORAGE_KEY, JSON.stringify([...map.values()]));
const makerStore = {
  async all() {
    return [...(await loadMaker()).values()];
  },
  async save(record) {
    const map = await loadMaker();
    map.set(record.id, record);
    await persistMaker(map);
    publishMaker();
  },
  async remove(id) {
    const map = await loadMaker();
    if (!map.delete(id)) return;
    await persistMaker(map);
    publishMaker();
  },
};

const makerServices = new Map();

// The maker engine for one Marscoin wallet. Marscoin is locked from, and
// returned to, the wallet's main address; Bitcoin is collected into the
// built-in Bitcoin wallet of the same recovery phrase.
export function getMakerServices(wallet) {
  const id = wallet.getID();
  if (makerServices.has(id)) return makerServices.get(id);
  const root = bitcoin.bip32.fromSeed(wallet._getSeed()).derivePath(MAKER_KEY_PATH);
  const address = wallet._getExternalAddressByIndex(0);
  const engine = createMakerEngine({
    chain: swapChain,
    btc: esplora,
    store: {
      all: async () => (await makerStore.all()).filter(record => record.walletId === id),
      save: record => makerStore.save(Object.assign(record, { walletId: id })),
      remove: key => makerStore.remove(key),
    },
    keyFor: ([a, b]) => root.deriveHardened(a).deriveHardened(b).privateKey,
    funds: {
      address,
      privateKey: () => bitcoin.ECPair.fromWIF(wallet._getWifForAddress(address), MARS_NETWORK).privateKey,
      async coins() {
        const found = await MARSConnection.multiGetUtxoByAddress([address]);
        return (found[address] || []).map(utxo => ({
          txid: utxo.txId,
          vout: utxo.vout,
          value: utxo.value,
          height: utxo.height > 0 ? utxo.height : 0,
        }));
      },
      // The bytes must hash to the requested ID: the amount we sign for comes from them.
      async rawTx(txid) {
        const hex = await MARSConnection.getTxHex(txid);
        if (typeof hex !== 'string' || bitcoin.Transaction.fromHex(hex).getId() !== txid)
          throw new Error('A wallet coin could not be verified.');
        return hex;
      },
    },
    now: Date.now,
    random: randomBytes,
  });
  const created = { id, engine, btcWallet: getSwapServices(wallet).btcWallet };
  makerServices.set(id, created);
  return created;
}

async function fetchJson(url) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller && setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new Error('unavailable');
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchMarket() {
  const [mars, btcPrices] = await Promise.all([fetchJson(PRICE_FEED), fetchJson(BTC_PRICE_FEED)]);
  const marsUsd = Object.values(mars?.data || {})[0]?.quote?.USD?.price;
  return { marsUsd, market: marketRate({ marsUsd, btcUsd: btcPrices?.USD }) };
}

const setMakerStatus = patch => {
  makerStatus = { ...makerStatus, ...patch, checkedAt: Date.now() };
  makerListeners.forEach(listener => listener());
};

// Replace our untaken offers with fresh ones at the current price.
async function refreshOffers(wallet) {
  const { engine, btcWallet } = getMakerServices(wallet);
  await engine.withdraw();
  const [{ marsUsd, market }, position, book, { receiveAddress }] = await Promise.all([
    fetchMarket(),
    engine.position(),
    swapChain.rawOffers().catch(() => []),
    btcWallet.sync(),
  ]);
  const mine = new Set((await engine.all()).map(record => record.id));
  const competingRates = book
    .filter(offer => offer && !mine.has(offer.offer_id) && offer.mars_amount_sat > 0 && offer.btc_amount_sat > 0)
    .map(offer => offer.btc_amount_sat / offer.mars_amount_sat);
  const plan = planOffers({ ...position, market, competingRates, config: makerConfig });
  const posted = await engine.post(plan, { lifetime: OFFER_SECONDS, btcDestination: receiveAddress });
  setMakerStatus({
    market,
    marsUsd,
    position: await engine.position(),
    message: posted.length
      ? null
      : plan.length
        ? 'The swap relay did not take the offers. Trying again shortly.'
        : 'Not enough confirmed Marscoin to offer right now.',
  });
}

let makerRunningSince = 0;
let lastRefresh = 0;
// One pass: move every maker swap along, then renew the offers when due.
export async function runMaker(wallet, { force = false } = {}) {
  if (!wallet || typeof wallet._getSeed !== 'function') return;
  if (makerRunningSince && Date.now() - makerRunningSince < STALE_PASS) return;
  const started = Date.now();
  makerRunningSince = started;
  try {
    await loadMaker();
    const { engine } = getMakerServices(wallet);
    if ((await engine.all()).length) await engine.tick().catch(() => {});
    if (makerConfig.enabled && (force || Date.now() - lastRefresh >= REFRESH_SECONDS * 1000)) {
      lastRefresh = Date.now();
      await refreshOffers(wallet).catch(error =>
        setMakerStatus({ message: error?.message || 'Offers could not be refreshed. Trying again shortly.' }),
      );
    }
    publishMaker();
  } catch {
    /* Offline; the next pass tries again. */
  } finally {
    if (makerRunningSince === started) makerRunningSince = 0;
  }
}

// Take our untaken offers off the relay: when switched off, or when the app
// leaves the foreground and could no longer answer an acceptance.
export async function withdrawOffers(wallet) {
  if (!wallet || typeof wallet._getSeed !== 'function') return;
  await loadMaker();
  if (!(await makerStore.all()).some(record => record.walletId === wallet.getID())) return;
  await getMakerServices(wallet)
    .engine.withdraw()
    .catch(() => {});
  lastRefresh = 0;
  publishMaker();
}

export async function saveMakerConfig(wallet, next) {
  await loadMaker();
  makerConfig = normalizeMakerConfig(next);
  await AsyncStorage.setItem(MAKER_CONFIG_KEY, JSON.stringify(makerConfig));
  publishMaker();
  if (makerConfig.enabled) await runMaker(wallet, { force: true });
  else await withdrawOffers(wallet);
  return makerConfig;
}

// Keeps the maker going while the app is open. Mount once, near the root.
export function useMakerRunner(wallet) {
  const current = useRef(wallet);
  current.current = wallet;
  useEffect(() => {
    const run = () => runMaker(current.current);
    run();
    const timer = setInterval(run, TICK_SECONDS * 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') run();
      else if (state === 'background') withdrawOffers(current.current);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}

const subscribeMaker = listener => {
  makerListeners.add(listener);
  return () => makerListeners.delete(listener);
};

// Live view for the maker screen: configuration, records and market status.
export function useMaker(wallet) {
  const records = useSyncExternalStore(
    subscribeMaker,
    () => makerSnapshot,
    () => makerSnapshot,
  );
  const status = useSyncExternalStore(
    subscribeMaker,
    () => makerStatus,
    () => makerStatus,
  );
  const config = useSyncExternalStore(
    subscribeMaker,
    () => makerConfig,
    () => makerConfig,
  );
  useEffect(() => {
    loadMaker().catch(() => {});
  }, []);
  const id = wallet?.getID();
  return { config: config || DEFAULT_MAKER_CONFIG, status, records: records.filter(record => record.walletId === id) };
}

export async function hasUnfinishedMakerSwaps(walletId) {
  return [...(await loadMaker()).values()].some(
    record => !isMakerFinished(record) && record.state !== MakerState.OFFERED && (!walletId || record.walletId === walletId),
  );
}
