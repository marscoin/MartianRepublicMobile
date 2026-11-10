// Wording for swap amounts and progress, kept apart from the screens so it can
// be checked without rendering anything.
import { SwapState } from './engine';

const group = digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 7050000000 -> "70.5"; trailing zeros dropped, at least no decimals for whole coins.
export function formatCoins(atomic) {
  const whole = Math.floor(atomic / 100000000);
  const fraction = String(atomic % 100000000)
    .padStart(8, '0')
    .replace(/0+$/, '');
  return fraction ? `${group(String(whole))}.${fraction}` : group(String(whole));
}

export const formatMars = atomic => `${formatCoins(atomic)} MARS`;
export const formatSats = sats => `${group(String(sats))} sats`;
export const formatBtc = sats => `${(sats / 100000000).toFixed(8)} BTC`;
// Price of one Marscoin in satoshis, to one decimal.
export const satsPerMars = offer => ((offer.btcAmount / offer.marsAmount) * 100000000).toFixed(1);

const STEPS = ['Reserve offer', 'Marscoin locked for you', 'Pay Bitcoin', 'Receive Marscoin'];

// What to show for a swap: a title, an explanation, which of the four steps is
// current, and which actions make sense.
export function describeSwap(swap) {
  const base = { steps: STEPS, canPay: false, canCancel: false, tone: 'active' };
  switch (swap.state) {
    case SwapState.ACCEPTING:
      return { ...base, step: 0, title: 'Reserving this offer', body: swap.error || 'Contacting the swap relay.', canCancel: true };
    case SwapState.WAITING_MARS:
      return {
        ...base,
        step: 1,
        title: 'Waiting for the Marscoin lock',
        body: `${swap.error || 'Waiting for the maker to lock Marscoin.'} Nothing has been paid. Do not send Bitcoin yet.`,
        canCancel: true,
      };
    case SwapState.READY_TO_PAY:
      return {
        ...base,
        step: 2,
        title: 'Marscoin is locked for you',
        body: swap.btcPayment
          ? swap.error || 'Sending your Bitcoin payment.'
          : `The lock has been verified on the Marscoin chain. Pay exactly ${formatSats(swap.btcAmount)} to continue.`,
        canPay: !swap.btcPayment,
        canCancel: !swap.btcPayment,
      };
    case SwapState.BTC_SENT:
      return {
        ...base,
        step: 2,
        title: 'Bitcoin sent',
        body:
          swap.error ||
          'Waiting for the maker to collect it, which releases your Marscoin. If that does not happen, your Bitcoin is returned automatically after the time lock.',
      };
    case SwapState.CLAIMING:
      return { ...base, step: 3, title: 'Claiming your Marscoin', body: swap.error || 'Your Marscoin is on its way to your wallet.' };
    case SwapState.COMPLETED:
      return {
        ...base,
        step: 4,
        tone: 'done',
        title: 'Swap complete',
        body: `${formatMars(swap.marsAmount - 100000)} arrived in your wallet.`,
      };
    case SwapState.REFUNDING:
      return {
        ...base,
        step: 2,
        title: 'Returning your Bitcoin',
        body: 'The maker did not complete the swap. Your Bitcoin refund has been sent and is awaiting confirmation.',
      };
    case SwapState.REFUNDED:
      return {
        ...base,
        step: 2,
        tone: 'ended',
        title: 'Bitcoin returned',
        body: 'The swap did not complete and your Bitcoin was returned to your wallet, less network fees.',
      };
    case SwapState.UNCLAIMED:
      return { ...base, step: 3, tone: 'error', title: 'Marscoin deadline missed', body: swap.error };
    default:
      return { ...base, step: 0, tone: 'ended', title: 'Swap ended', body: swap.error || 'This swap ended before any payment.' };
  }
}

// "about 3 h 40 min" until a block height, from an average block time.
export function timeUntil(blocks, secondsPerBlock) {
  if (blocks <= 0) return 'now';
  const minutes = Math.round((blocks * secondsPerBlock) / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes % 60) / 10) * 10;
  return rest ? `about ${hours} h ${rest} min` : `about ${hours} h`;
}
