const BlueElectrum = require('../blue_modules/MARSConnection');

export const NetworkTransactionFeeType = Object.freeze({
  FAST: 'Fast',
  MEDIUM: 'MEDIUM',
  SLOW: 'SLOW',
  CUSTOM: 'CUSTOM',
});

export class NetworkTransactionFee {
  static StorageKey = 'NetworkTransactionFee';

  private fastestFee: number;
  private mediumFee: number;
  private slowFee: number;

  constructor(fastestFee = 2, mediumFee = 1, slowFee = 1) {
    this.fastestFee = fastestFee;
    this.mediumFee = mediumFee;
    this.slowFee = slowFee;
  }
}

export const EXPLORER_FEES_URL = 'https://explore.marscoin.org/health/fees.json';
const EXPLORER_TIMEOUT_MS = 4000;
const MAX_EXPLORER_RATE = 1000; // zubrins per byte; anything above this is treated as a broken answer

/**
 * The explorer watches what the chain actually mines and publishes a recommended rate.
 * Returns that rate in zubrins per byte, or null when the answer is missing, late or implausible.
 */
export async function explorerRecommendedRate(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), EXPLORER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(EXPLORER_FEES_URL, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) return null;
    const body = await response.json();
    const recommended = Number(body?.recommendedZubrinsPerByte);
    const minimum = Number(body?.minimumZubrinsPerByte);
    if (!Number.isFinite(recommended) || recommended < 1 || recommended > MAX_EXPLORER_RATE) return null;
    const floor = Number.isFinite(minimum) && minimum >= 1 && minimum <= MAX_EXPLORER_RATE ? minimum : 1;
    return Math.ceil(Math.max(recommended, floor));
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default class NetworkTransactionFees {
  static async recommendedFees(): Promise<NetworkTransactionFee> {
    const rate = await explorerRecommendedRate();
    if (rate !== null) return new NetworkTransactionFee(rate, rate, 1);
    try {
      if (BlueElectrum.isDisabled) {
        const isDisabled = await BlueElectrum.isDisabled();

        if (isDisabled) {
          throw new Error('Electrum is disabled. Dont attempt to fetch fees');
        }
      }
      const response = await BlueElectrum.estimateFees();

      const result = new NetworkTransactionFee(response.fast + 5, response.medium + 2, response.slow);

      return result;
    } catch (err) {

      return new NetworkTransactionFee(2, 1, 1);
    }
  }
}
