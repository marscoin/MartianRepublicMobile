import { encodeMarsPaymentURI, parseMarsPaymentURI, marsToZubrins } from '../../blue_modules/mars-payment-uri';
const address = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';

describe('Marscoin payment requests', () => {
  it('round trips an exact amount and an escaped memo', () => {
    const link = encodeMarsPaymentURI(address, {
      amount: '1.00000001',
      label: 'Olympus cafe & supplies',
    });
    expect(parseMarsPaymentURI(link)).toEqual({
      address,
      amount: '1.00000001',
      amountSats: 100000001,
      memo: 'Olympus cafe & supplies',
    });
  });
  it('keeps a bare address free of an invented amount', () => {
    expect(parseMarsPaymentURI(` ${address} `)).toEqual({
      address,
      amount: undefined,
      amountSats: undefined,
      memo: '',
    });
  });
  it('accepts the existing uppercase and double-slash Marscoin schemes', () => {
    expect(parseMarsPaymentURI(`MARSCOIN://${address}?amount=0.00000001`).amountSats).toBe(1);
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1e2', '1.000000001', '90071992.54740992', ''])(
    'rejects invalid amount %s instead of silently rounding it',
    amount => {
      expect(() => marsToZubrins(amount)).toThrow();
      expect(() => parseMarsPaymentURI(`marscoin:${address}?amount=${amount}`)).toThrow();
    },
  );
  it.each([
    `bitcoin:${address}`,
    'marscoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    `marscoin:${address}?amount=1&amount=2`,
    `marscoin:${address}?req-unknown=1`,
    `marscoin:${address}?label=%ZZ`,
    `marscoin:${address}?amount=1?amount=2`,
  ])('rejects malformed or incompatible requests: %s', link => {
    expect(() => parseMarsPaymentURI(link)).toThrow();
  });
  it('does not encode an already encoded link as an address', () => {
    expect(() => encodeMarsPaymentURI(`marscoin:${address}`)).toThrow();
  });
});
