import { parseMarsAmount, formatMarsAmount } from '../../blue_modules/mars-amount';
import { BitcoinUnit } from '../../models/bitcoinUnits';
it('preserves all eight decimal places when cycling MARS and zubrins', () => {
  const atomic = parseMarsAmount('1.00000001', BitcoinUnit.MARS);
  expect(formatMarsAmount(atomic, BitcoinUnit.ZUBRINS)).toBe('100000001');
  expect(formatMarsAmount(parseMarsAmount('100000001', BitcoinUnit.ZUBRINS), BitcoinUnit.MARS)).toBe('1.00000001');
});
it('does not silently round a ninth decimal place or fractional zubrin', () => {
  expect(() => parseMarsAmount('1.000000001', BitcoinUnit.MARS)).toThrow();
  expect(() => parseMarsAmount('500.9', BitcoinUnit.ZUBRINS)).toThrow();
});
it('converts a dollar request using the Marscoin rate', () => {
  expect(parseMarsAmount('1.50', BitcoinUnit.LOCAL_CURRENCY, 0.075)).toBe(2000000000);
  expect(formatMarsAmount(2000000000, BitcoinUnit.LOCAL_CURRENCY, 0.075)).toBe('1.50000000');
});
it('requires a usable rate for a dollar amount', () => {
  expect(() => parseMarsAmount('1', BitcoinUnit.LOCAL_CURRENCY, null)).toThrow('exchange rate');
  expect(() => formatMarsAmount(1000, BitcoinUnit.LOCAL_CURRENCY, 0)).toThrow('exchange rate');
});
