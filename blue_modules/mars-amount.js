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

// What an amount field holds after a keystroke, or null when the keystroke
// is refused. A zero in front of other digits is dropped, so typing 1, 0 into
// a field showing "0" gives "10", not "010"; "0.5" and a lone "0" stay.
export function normalizeAmountText(text) {
  let next = String(text ?? '')
    .trim()
    .replace(/,/g, '.');
  // Digits with at most one decimal point.
  if (!/^\d*\.?\d*$/.test(next)) return null;
  if (next.startsWith('.')) next = '0' + next;
  return next.replace(/^0+(?=\d)/, '');
}

// Why a recipient's amount cannot be sent, in words for the person, or
// undefined when it can. `amount` is the text typed; `amountSats` its value
// in zubrins when it could be read.
export function sendAmountProblem({ amount, amountSats, balance }) {
  if (amount === undefined || amount === null || String(amount).trim() === '') {
    return 'Enter the amount to send. Tap the large number at the top of the screen to type it.';
  }
  const value = Number(amountSats);
  if (!Number.isSafeInteger(value) || value <= 500) return 'Enter an amount greater than 500 zubrins, with no more than eight decimal places.';
  if (value > balance) return 'The sending amount exceeds the available balance.';
  return undefined;
}
