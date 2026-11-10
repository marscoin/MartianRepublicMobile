import * as bitcoin from 'bitcoinjs-lib';
import BigNumber from 'bignumber.js';
import { Marscoin } from './constants';

export function marsToZubrins(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) throw new Error('Enter a Marscoin amount with no more than eight decimal places.');
  const amount = new BigNumber(text).times(100000000);
  if (!amount.isInteger() || !amount.gt(0) || amount.gt(Number.MAX_SAFE_INTEGER))
    throw new Error('Enter a valid positive Marscoin amount.');
  return amount.toNumber();
}

export function parseMarsPaymentURI(value) {
  if (typeof value !== 'string') throw new Error('Enter a Marscoin address or payment link.');
  const text = value.trim();
  const parts = text.replace(/^marscoin:(?:\/\/)?/i, '').split('?');
  if (parts.length > 2 || /[:/#]/.test(parts[0])) throw new Error('This is not a Marscoin payment link.');
  const address = parts[0];
  try {
    bitcoin.address.toOutputScript(address, Marscoin.mainnet);
  } catch {
    throw new Error('The Marscoin address is invalid.');
  }
  const options = {};
  for (const field of (parts[1] || '').split('&').filter(Boolean)) {
    const [rawKey, ...rest] = field.split('=');
    const key = decodeURIComponent(rawKey);
    if (key.startsWith('req-')) throw new Error('This payment link requires an unsupported option.');
    if (!['amount', 'label', 'message'].includes(key)) continue;
    if (Object.prototype.hasOwnProperty.call(options, key)) throw new Error('This payment link contains duplicate fields.');
    options[key] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
  }
  const amountSats = options.amount === undefined ? undefined : marsToZubrins(options.amount);
  return {
    address,
    amount: options.amount,
    amountSats,
    memo: options.label || options.message || '',
  };
}

export function encodeMarsPaymentURI(address, options = {}) {
  if (parseMarsPaymentURI(address).address !== address) throw new Error('Enter a Marscoin address without a payment link.');
  const params = [];
  if (options.amount !== undefined && options.amount !== '') {
    marsToZubrins(options.amount);
    params.push('amount=' + encodeURIComponent(String(options.amount)));
  }
  if (options.label) params.push('label=' + encodeURIComponent(options.label));
  return 'marscoin:' + address + (params.length ? '?' + params.join('&') : '');
}
