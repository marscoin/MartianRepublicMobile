import BigNumber from 'bignumber.js';
import { marsToZubrins } from './mars-payment-uri';
import { BitcoinUnit } from '../models/bitcoinUnits';

export function parseMarsAmount(value, unit, usdRate) {
  if (unit === BitcoinUnit.MARS || unit === BitcoinUnit.BTC) return marsToZubrins(value);
  const text = String(value).trim();
  let atomic;
  if (unit === BitcoinUnit.ZUBRINS || unit === BitcoinUnit.SATS) {
    if (!/^\d+$/.test(text)) throw new Error('Enter a whole number of zubrins.');
    atomic = new BigNumber(text);
  } else if (unit === BitcoinUnit.LOCAL_CURRENCY) {
    if (!Number.isFinite(Number(usdRate)) || Number(usdRate) <= 0)
      throw new Error('The exchange rate is unavailable. Enter the amount in MARS.');
    if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Enter a valid amount.');
    atomic = new BigNumber(text).dividedBy(usdRate).times(100000000).integerValue(BigNumber.ROUND_DOWN);
  } else {
    throw new Error('Choose MARS or zubrins.');
  }
  if (!atomic.gt(0) || !atomic.isInteger() || atomic.gt(Number.MAX_SAFE_INTEGER)) throw new Error('Enter a valid positive amount.');
  return atomic.toNumber();
}

export function formatMarsAmount(atomic, unit, usdRate) {
  if (!Number.isSafeInteger(atomic) || atomic < 0) throw new Error('Invalid Marscoin amount.');
  if (unit === BitcoinUnit.ZUBRINS || unit === BitcoinUnit.SATS) return String(atomic);
  const mars = new BigNumber(atomic).dividedBy(100000000);
  if (unit === BitcoinUnit.LOCAL_CURRENCY) {
    if (!Number.isFinite(Number(usdRate)) || Number(usdRate) <= 0)
      throw new Error('The exchange rate is unavailable. Enter the amount in MARS.');
    return mars.times(usdRate).toFixed(8);
  }
  return mars.toFixed();
}
