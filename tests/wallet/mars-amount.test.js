import { parseMarsAmount, formatMarsAmount, normalizeAmountText } from '../../blue_modules/mars-amount';
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

describe('typing an amount', () => {
  // Each keystroke as the field reports it: the text so far plus the new key.
  const type = (keys, start = '') => [...keys].reduce((text, key) => normalizeAmountText(text + key) ?? text, start);

  it('drops the zero in front of the first digit: 1, 0, . gives "10." and never "010."', () => {
    expect(normalizeAmountText('01')).toBe('1');
    expect(normalizeAmountText('010')).toBe('10');
    expect(normalizeAmountText('010.')).toBe('10.');
    // A field that still shows the old literal "0".
    expect(type('10.', '0')).toBe('10.');
    expect(type('10')).toBe('10');
    expect(parseMarsAmount(type('10'), BitcoinUnit.MARS)).toBe(1000000000);
  });

  it('keeps decimals below one, and a lone zero', () => {
    expect(type('0.5')).toBe('0.5');
    expect(type('.5')).toBe('0.5');
    expect(type('0')).toBe('0');
    expect(type('00')).toBe('0');
    expect(type('0.05')).toBe('0.05');
    expect(type('10.00000001')).toBe('10.00000001');
    expect(type('100200')).toBe('100200');
    expect(parseMarsAmount(type('0.5'), BitcoinUnit.MARS)).toBe(50000000);
  });

  it('lets the amount be deleted back to empty', () => {
    expect(normalizeAmountText('1')).toBe('1');
    expect(normalizeAmountText('')).toBe('');
    expect(normalizeAmountText('0.')).toBe('0.');
    expect(normalizeAmountText(undefined)).toBe('');
  });

  it('takes a comma as the decimal point and refuses anything that is not an amount', () => {
    expect(normalizeAmountText('10,5')).toBe('10.5');
    expect(normalizeAmountText(' 7 ')).toBe('7');
    for (const text of ['1.2.3', '1..2', '10a', '-5', '1e5', '1 0']) expect(normalizeAmountText(text)).toBeNull();
    // A refused keystroke leaves the field as it was.
    expect(type('1.2.3')).toBe('1.23');
  });

  it('serves whole-number units the same way', () => {
    expect(parseMarsAmount(type('0500'), BitcoinUnit.ZUBRINS)).toBe(500);
  });
});
