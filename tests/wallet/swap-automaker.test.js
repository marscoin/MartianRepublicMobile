import {
  DEFAULT_MAKER_CONFIG,
  competitiveRate,
  marketRate,
  normalizeMakerConfig,
  offerable,
  offerSizes,
  planOffers,
  tierRate,
} from '../../blue_modules/swap/automaker';

const COIN = 100000000;
const config = normalizeMakerConfig({ ...DEFAULT_MAKER_CONFIG, enabled: true });

describe('automatic maker rules', () => {
  it('repairs a stored configuration', () => {
    expect(normalizeMakerConfig(null)).toEqual(DEFAULT_MAKER_CONFIG);
    const odd = normalizeMakerConfig({ enabled: 'yes', feePercent: 900, reservePercent: -5, offers: 40, minSwap: 3, maxSwap: 1, dailyLimit: 1.5 });
    expect(odd.enabled).toBe(false);
    expect(odd.feePercent).toBe(50);
    expect(odd.reservePercent).toBe(0);
    expect(odd.offers).toBe(5);
    expect(odd.minSwap).toBe(COIN);
    expect(odd.maxSwap).toBe(odd.minSwap);
    expect(odd.dailyLimit).toBe(DEFAULT_MAKER_CONFIG.dailyLimit);
  });

  it('derives the market price and refuses a missing one', () => {
    expect(marketRate({ marsUsd: 0.06, btcUsd: 75000 })).toBeCloseTo(8e-7, 12);
    expect(() => marketRate({ marsUsd: 0, btcUsd: 75000 })).toThrow('unavailable');
    expect(() => marketRate({ marsUsd: 0.06, btcUsd: NaN })).toThrow('unavailable');
  });

  it('keeps the reserve, the daily limit and existing commitments out of what is offered', () => {
    expect(offerable({ confirmed: 1000 * COIN, committed: 0, soldToday: 0, config })).toBe(800 * COIN);
    expect(offerable({ confirmed: 1000 * COIN, committed: 300 * COIN, soldToday: 0, config })).toBe(500 * COIN);
    expect(offerable({ confirmed: 5000 * COIN, committed: 0, soldToday: 900 * COIN, config })).toBe(100 * COIN);
    expect(offerable({ confirmed: 5000 * COIN, committed: 200 * COIN, soldToday: 900 * COIN, config })).toBe(0);
  });

  it('splits into ascending whole-coin tiers that never exceed the total', () => {
    const sizes = offerSizes(600 * COIN, config);
    expect(sizes).toEqual([100 * COIN, 200 * COIN, 300 * COIN]);
    expect(offerSizes(6000 * COIN, config)).toEqual([500 * COIN, 500 * COIN, 500 * COIN]);
    expect(offerSizes(25 * COIN, config)).toEqual([12 * COIN]);
    expect(offerSizes(9 * COIN, config)).toEqual([]);
    for (const total of [10, 33, 157, 999, 12345]) {
      const tiers = offerSizes(total * COIN, config);
      expect(tiers.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(total * COIN);
      tiers.forEach(size => expect(size).toBeGreaterThanOrEqual(config.minSwap));
    }
  });

  it('prices the smallest offer at the spread and larger ones above it', () => {
    expect(tierRate(1, 0, 3, 5)).toBeCloseTo(1.05, 10);
    expect(tierRate(1, 1, 3, 5)).toBeCloseTo(1.07, 10);
    expect(tierRate(1, 2, 3, 5)).toBeCloseTo(1.09, 10);
    expect(tierRate(1, 0, 1, 5)).toBeCloseTo(1.05, 10);
  });

  it('moves toward a cheaper competitor but never below the spread', () => {
    expect(competitiveRate(1.09, [], 1, 5)).toBe(1.09);
    expect(competitiveRate(1.09, [1.07], 1, 5)).toBeCloseTo(1.08, 10);
    expect(competitiveRate(1.09, [0.9], 1, 5)).toBeCloseTo(1.05, 10);
    expect(competitiveRate(1.05, [1.2], 1, 5)).toBe(1.05);
  });

  it('plans offers in whole satoshis, rounded in the seller’s favour', () => {
    const market = 8e-7;
    const plan = planOffers({ confirmed: 750 * COIN, committed: 0, soldToday: 0, market, config });
    expect(plan.map(offer => offer.marsAmount)).toEqual([100 * COIN, 200 * COIN, 300 * COIN]);
    plan.forEach((offer, index) => {
      expect(Number.isSafeInteger(offer.btcAmount)).toBe(true);
      expect(offer.btcAmount / offer.marsAmount).toBeGreaterThanOrEqual(market * 1.05 - 1e-15);
      if (index) expect(offer.btcAmount / offer.marsAmount).toBeGreaterThan(plan[index - 1].btcAmount / plan[index - 1].marsAmount);
    });
    expect(plan[0].btcAmount).toBe(Math.ceil(100 * COIN * market * 1.05));
  });

  it('honours a price floor and plans nothing without a price or funds', () => {
    const floored = planOffers({ confirmed: 750 * COIN, committed: 0, soldToday: 0, market: 8e-7, config: { ...config, floorSatsPerMars: 200 } });
    floored.forEach(offer => expect(offer.btcAmount / offer.marsAmount).toBeGreaterThanOrEqual(200 / COIN));
    expect(planOffers({ confirmed: 750 * COIN, committed: 0, soldToday: 0, market: 0, config })).toEqual([]);
    expect(planOffers({ confirmed: 5 * COIN, committed: 0, soldToday: 0, market: 8e-7, config })).toEqual([]);
  });
});
