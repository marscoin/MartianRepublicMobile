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

export default class NetworkTransactionFees {
  static async recommendedFees(): Promise<NetworkTransactionFee> {
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
