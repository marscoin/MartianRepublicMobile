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

// The parts of the current step, in order: [label, done]. The first part not
// yet done is the one in progress.
function parts(swap) {
  const lock = swap.lockProgress || { seen: false, confirmations: 0 };
  switch (swap.state) {
    case SwapState.ACCEPTING:
      return [['Reserving the offer with the swap relay', false]];
    case SwapState.WAITING_MARS:
      return [
        ['Seller locks the Marscoin for you', lock.seen],
        ['First confirmation on the Marscoin chain', lock.confirmations >= 1],
        ['Second confirmation', lock.confirmations >= 2],
        ['Checked against a second, independent node', false],
      ];
    case SwapState.READY_TO_PAY:
      return [
        ['Marscoin lock verified', true],
        [swap.btcPayment ? 'Sending your Bitcoin' : 'Your turn: pay the Bitcoin', false],
      ];
    case SwapState.BTC_SENT:
      return [
        ['Your Bitcoin is locked for the seller', true],
        ['Seller collects it, once it has confirmed', false],
      ];
    case SwapState.CLAIMING:
      return [
        ['Secret read from the Bitcoin chain', true],
        ['Marscoin claim sent to the network', !!swap.marsClaim],
        ['Claim confirmed', false],
      ];
    case SwapState.REFUNDING:
      return [
        ['Refund sent to the Bitcoin network', swap.btcRefunds?.length > 0],
        ['Refund confirmed', false],
      ];
    default:
      return [];
  }
}

// [{ label, state }] with state 'done', 'active' or 'todo'.
export function swapSubsteps(swap) {
  let active = false;
  return parts(swap).map(([label, done]) => {
    if (done) return { label, state: 'done' };
    if (active) return { label, state: 'todo' };
    active = true;
    return { label, state: 'active' };
  });
}

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
        // While this step is the current one it is not yet done: say so.
        steps: ['Reserve offer', 'Confirming the Marscoin lock', 'Pay Bitcoin', 'Receive Marscoin'],
        payNext: true,
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

// ---- Offering Marscoin (maker side) ------------------------------------------

const MAKER_STEPS = ['Buyer accepted', 'Marscoin locked', 'Bitcoin received', 'Bitcoin collected'];

// What to show for one of our own offers or sales.
export function describeMakerSwap(record) {
  const base = { steps: MAKER_STEPS, tone: 'active' };
  const pair = `${formatMars(record.marsAmount)} for ${formatSats(record.btcAmount)}`;
  switch (record.state) {
    case 'offered':
      return { ...base, step: 0, tone: 'idle', title: 'On offer', body: pair };
    case 'accepted':
    case 'locking':
      return { ...base, step: 1, title: 'Locking Marscoin for a buyer', body: record.error || pair };
    case 'mars_locked':
      return { ...base, step: 2, title: 'Waiting for the buyer’s Bitcoin', body: record.error || record.note || pair };
    case 'claiming':
      return {
        ...base,
        step: 3,
        title: 'Collecting the Bitcoin',
        body: record.error || 'Your claim is on the Bitcoin network, awaiting confirmation.',
      };
    case 'completed':
      return {
        ...base,
        step: 4,
        tone: 'done',
        title: 'Sold',
        body: `${formatSats(record.btcAmount)} received for ${formatMars(record.marsAmount)}.`,
      };
    case 'refunding':
      return {
        ...base,
        step: 2,
        title: 'Taking the Marscoin back',
        body: 'The buyer did not pay in time. Your Marscoin is returning to your wallet.',
      };
    case 'refunded':
      return {
        ...base,
        step: 2,
        tone: 'ended',
        title: 'Marscoin returned',
        body: 'The buyer did not pay. Your Marscoin is back in your wallet, less the network fee.',
      };
    case 'lost':
      return {
        ...base,
        step: 3,
        tone: 'error',
        title: 'Sale lost',
        body: 'The buyer recovered the Bitcoin before your claim confirmed, and collected the Marscoin. Contact the Republic with this record.',
      };
    default:
      return { ...base, step: 0, tone: 'ended', title: 'Acceptance declined', body: record.error || 'Nothing was locked.' };
  }
}

// "12.5" -> 1250000000, or null when it is not an amount.
export function parseCoins(text) {
  const match = /^\s*(\d{1,9})(?:[.,](\d{1,8}))?\s*$/.exec(String(text));
  if (!match) return null;
  return Number(match[1]) * 100000000 + Number((match[2] || '').padEnd(8, '0'));
}
