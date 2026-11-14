// Words and numbers for the send flow, kept apart from the screens so they
// can be checked on their own. Amounts are in zubrins (1 MARS = 100,000,000).
import BigNumber from 'bignumber.js';

export const ZUBRINS_PER_MARS = 100000000;
export const EXPLORER_TX = 'https://explore.marscoin.org/tx/';

const group = digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// A dollar value with two decimals, or "under $0.01" for anything smaller
// that is not nothing. Null when there is no number to show.
export function fiatText(usd) {
  const value = Number(usd);
  if (usd === null || usd === undefined || usd === '' || !Number.isFinite(value) || value < 0) return null;
  if (value === 0) return '$0.00';
  if (value < 0.01) return 'under $0.01';
  const [whole, cents] = value.toFixed(2).split('.');
  return `$${group(whole)}.${cents}`;
}

// The dollar value of an amount in zubrins, or null without a usable rate.
export function fiatOfZubrins(zubrins, usdRate) {
  const rate = Number(usdRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (zubrins === null || zubrins === undefined || !Number.isFinite(Number(zubrins)) || Number(zubrins) < 0) return null;
  return fiatText(new BigNumber(zubrins).times(rate).dividedBy(ZUBRINS_PER_MARS).toNumber());
}

// Zubrins as MARS for reading: grouped thousands, no trailing zeros
// ("6,684.2626745"). `fixed` keeps all eight decimals, for columns of figures.
export function marsText(zubrins, { fixed = false } = {}) {
  if (!Number.isSafeInteger(zubrins) || zubrins < 0) return '';
  const mars = new BigNumber(zubrins).dividedBy(ZUBRINS_PER_MARS);
  const [whole, decimals] = (fixed ? mars.toFixed(8) : mars.toFixed()).split('.');
  return decimals ? `${group(whole)}.${decimals}` : group(whole);
}

// An address cut into the part people check first, the middle, and the part
// they check last.
export function addressParts(address, lead = 6, tail = 6) {
  const text = String(address || '');
  if (text.length <= lead + tail) return { head: text, middle: '', tail: '' };
  return { head: text.slice(0, lead), middle: text.slice(lead, text.length - tail), tail: text.slice(text.length - tail) };
}

// "MHBba2…TtjCU1": enough of an address, or a transaction ID, to recognise it.
export function shortAddress(address, lead = 6, tail = 6) {
  const { head, middle, tail: end } = addressParts(address, lead, tail);
  return middle ? `${head}…${end}` : head;
}

// The text an amount field shows gets smaller as it gets longer, so that a
// long amount still fits a narrow phone.
export function amountFontSize(text, width = 375) {
  const length = String(text || '').length;
  const base = width < 360 ? 46 : 56;
  if (length <= 6) return base;
  if (length <= 9) return Math.round(base * 0.78);
  if (length <= 12) return Math.round(base * 0.6);
  return Math.round(base * 0.48);
}

// A custom fee rate as typed, in zubrins per byte: whole numbers only, never
// below the network minimum of 1.
export function customFeeRate(text) {
  const typed = String(text ?? '').trim();
  const rate = Number(typed);
  if (!/^\d+$/.test(typed) || !Number.isSafeInteger(rate)) return { error: 'Enter a whole number of zubrins per byte.' };
  return { rate: String(Math.max(1, rate)) };
}

// Which of the user's own wallets an address belongs to, from what the phone
// already holds; nothing is looked up. Null when it is not one of theirs.
export function ownWalletLabel(address, wallets) {
  if (!address || !Array.isArray(wallets)) return null;
  for (const wallet of wallets) {
    try {
      if (wallet?.weOwnAddress?.(address)) return wallet.getLabel?.() || 'your wallet';
    } catch (_) {}
  }
  return null;
}

export const explorerTxUrl = txid => EXPLORER_TX + encodeURIComponent(String(txid || ''));

const MAX = 'MAX';

// Why the payment cannot be reviewed yet, in a few plain words, or null when
// it can. `recipients` are the screen's { address, amount, amountSats };
// `fee` is the network fee in zubrins once it is known.
export function sendBlocker({ recipients, balance, isAddressValid, fee }) {
  const list = Array.isArray(recipients) ? recipients : [];
  if (!list.length) return { reason: 'Add a recipient', field: 'address', index: 0 };
  const many = list.length > 1;
  const at = (reason, field, index) => ({ reason: many ? `${reason} (recipient ${index + 1})` : reason, field, index });
  const known = Number.isSafeInteger(balance);
  const usesMax = list.some(item => item?.amount === MAX);
  let total = 0;
  for (const [index, recipient] of list.entries()) {
    const amount = recipient?.amount;
    if (amount === MAX) {
      if (known && balance <= 0) return at('This wallet is empty', 'amount', index);
      continue;
    }
    if (amount === undefined || amount === null || String(amount).trim() === '') return at('Enter an amount', 'amount', index);
    const value = Number(recipient.amountSats);
    if (!Number.isSafeInteger(value) || value <= 0) return at('Enter a valid amount', 'amount', index);
    if (value <= 500) return at('Amount is too small', 'amount', index);
    if (known && value > balance) return at('More than your balance', 'amount', index);
    total += value;
  }
  for (const [index, recipient] of list.entries()) {
    const address = String(recipient?.address || '').trim();
    if (!address) return at('Add a recipient', 'address', index);
    if (isAddressValid && !isAddressValid(address)) return at('Check the address', 'address', index);
  }
  if (known && total > balance) return { reason: 'More than your balance', field: 'amount', index: 0 };
  if (known && !usesMax && Number.isSafeInteger(fee) && fee > 0 && total + fee > balance) {
    return { reason: 'Leave room for the network fee', field: 'amount', index: 0 };
  }
  return null;
}
