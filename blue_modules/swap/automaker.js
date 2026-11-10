// Pricing and sizing rules for offering Marscoin for Bitcoin automatically.
// Ported from electrum_mars/plugins/atomic_swap/automaker.py so the phone and
// the desktop wallet quote alike. Everything here is a pure function.
import { DUST, MARS_SPEND_FEE } from './safety';

const COIN = 100000000;

export const DEFAULT_MAKER_CONFIG = {
  enabled: false,
  feePercent: 5, // spread over the market price on the smallest offer
  dailyLimit: 1000 * COIN, // most Marscoin to commit in any 24 hours
  maxSwap: 500 * COIN,
  minSwap: 10 * COIN,
  reservePercent: 20, // share of the balance never offered
  offers: 3,
  floorSatsPerMars: 0, // never sell below this price; 0 means no floor
};

export const OFFER_SECONDS = 15 * 60; // an offer's life; fresh ones replace it
export const REFRESH_SECONDS = 5 * 60;
// Larger offers carry a premium of up to this much above the base spread.
const MAX_TIER_PREMIUM = 0.04;
const LIMITS = {
  feePercent: [0, 50],
  reservePercent: [0, 95],
  offers: [1, 5],
};

const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));
const wholeAmount = (value, fallback) => (Number.isSafeInteger(value) && value >= 0 ? value : fallback);

// A stored or edited configuration, made safe to use.
export function normalizeMakerConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const base = DEFAULT_MAKER_CONFIG;
  const number = (key, fallback) => (Number.isFinite(input[key]) ? input[key] : fallback);
  const config = {
    enabled: input.enabled === true,
    feePercent: clamp(number('feePercent', base.feePercent), LIMITS.feePercent),
    dailyLimit: wholeAmount(input.dailyLimit, base.dailyLimit),
    maxSwap: wholeAmount(input.maxSwap, base.maxSwap),
    minSwap: Math.max(wholeAmount(input.minSwap, base.minSwap), COIN),
    reservePercent: clamp(number('reservePercent', base.reservePercent), LIMITS.reservePercent),
    offers: Math.round(clamp(number('offers', base.offers), LIMITS.offers)),
    floorSatsPerMars: Math.max(0, number('floorSatsPerMars', base.floorSatsPerMars)),
  };
  if (config.maxSwap < config.minSwap) config.maxSwap = config.minSwap;
  return config;
}

// Market price in bitcoin per Marscoin from the two public price feeds.
export function marketRate({ marsUsd, btcUsd }) {
  if (!Number.isFinite(marsUsd) || !Number.isFinite(btcUsd) || marsUsd <= 0 || btcUsd <= 0) {
    throw new Error('The market price is unavailable.');
  }
  return marsUsd / btcUsd;
}

// Marscoin that may be put on offer now.
export function offerable({ confirmed, committed, soldToday, config }) {
  const reserve = Math.floor((confirmed * config.reservePercent) / 100);
  const free = confirmed - reserve - committed;
  const daily = config.dailyLimit - soldToday - committed;
  return Math.max(0, Math.min(free, daily));
}

// Ascending tiers in the ratio 1 : 2 : 3 ..., each capped at the largest
// single swap. Small offers suit a first-time buyer.
export function offerSizes(total, config) {
  if (total < config.minSwap) return [];
  const weights = Array.from({ length: config.offers }, (_, index) => index + 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const tiers = weights
    .map(weight => Math.min(Math.floor((total * weight) / sum), config.maxSwap))
    // Whole Marscoin read better and reveal less about the balance.
    .map(size => Math.floor(size / COIN) * COIN)
    .filter(size => size >= config.minSwap);
  if (tiers.length) return tiers;
  const single = Math.floor(Math.min(total, config.maxSwap) / COIN) * COIN;
  return single >= config.minSwap ? [single] : [];
}

// The spread is a floor: the smallest offer carries exactly it, larger ones more.
export function tierRate(market, index, count, feePercent) {
  const premium = count <= 1 ? 0 : MAX_TIER_PREMIUM * (index / (count - 1));
  return market * (1 + feePercent / 100 + premium);
}

// Move halfway toward the best competing price, never below the user's own floor.
export function competitiveRate(rate, competingRates, market, feePercent) {
  if (!competingRates.length) return rate;
  const best = Math.min(...competingRates);
  if (rate <= best) return rate;
  return Math.max(rate - (rate - best) / 2, market * (1 + feePercent / 100));
}

// The offers to post: [{ marsAmount, btcAmount }].
export function planOffers({ confirmed, committed, soldToday, market, competingRates = [], config }) {
  if (!Number.isFinite(market) || market <= 0) return [];
  const sizes = offerSizes(offerable({ confirmed, committed, soldToday, config }), config);
  const floor = config.floorSatsPerMars / COIN;
  return sizes
    .map((marsAmount, index) => {
      const rate = Math.max(
        competitiveRate(tierRate(market, index, sizes.length, config.feePercent), competingRates, market, config.feePercent),
        floor,
      );
      return { marsAmount, btcAmount: Math.ceil(marsAmount * rate) };
    })
    .filter(offer => offer.marsAmount > MARS_SPEND_FEE + DUST && offer.btcAmount > DUST * 4);
}
