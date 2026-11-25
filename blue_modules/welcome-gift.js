// The welcome gift at the moment of publishing an introduction: what to do
// when the newcomer asks to publish, and what follows when they accept the
// gift. The decisions live here, apart from the screen, and everything they
// touch is passed in, so the whole path can be tested without a network.
//
// The rules:
//  - Nothing is published unless the newcomer has ticked the verification box.
//  - A wallet that can pay the fee never sees the gift.
//  - The gift is only ever claimed after the newcomer accepts it. Asking
//    whether one is on offer sends no coins and signs nothing.
//  - After "Accept and publish" the introduction is published without a second
//    confirmation only while the gift covers the whole fee. If the fee is
//    larger, or the gift's size is unknown, the usual fee confirmation is shown.
import { isInsufficientFunds } from './citizenship-publication';

const SENT_WAIT = 180000;
// A gift sent earlier is either already visible or long spent: look briefly.
const EARLIER_WAIT = 30000;

export const GIFT_NOTES = {
  short: 'Your welcome gift arrived, but your civic wallet still does not hold enough for the fee.',
  gone: 'A welcome gift was already sent to this civic address, and it is not in your civic wallet now.',
};

// "0.01 MARS", or null when the amount is not known.
export function giftAmountText(zubrins) {
  if (!Number.isSafeInteger(zubrins) || zubrins <= 0) return null;
  return `${(zubrins / 100000000).toFixed(8).replace(/\.?0+$/, '')} MARS`;
}

const fund = reason => ({ next: 'fund', reason: reason || null });
const ready = publication =>
  publication.status === 'submitted' ? { next: 'published', txid: publication.txid } : { next: 'confirm', publication };

// The newcomer tapped the publish button. Resolves to what the screen does next:
//   blocked    the verification box is not ticked; nothing was done
//   published  this introduction was already sent ({ txid })
//   confirm    show the usual fee confirmation ({ publication })
//   gift       show the welcome gift ({ offer })
//   fund       no gift is coming; offer the ways to get Marscoin ({ reason })
export async function startPublishing({
  verified,
  prepare,
  fetchOffer,
  waitForGrant,
  onProgress = () => {},
  shouldStop = () => false,
  insufficient = isInsufficientFunds,
} = {}) {
  if (verified !== true) return { next: 'blocked' };
  try {
    return ready(await prepare());
  } catch (error) {
    if (!insufficient(error)) throw error;
  }
  // The civic wallet cannot pay. See whether the Republic offers a gift.
  onProgress('asking');
  const offer = await fetchOffer();
  if (shouldStop()) return { next: 'stopped' };
  if (offer.outcome === 'available') return { next: 'gift', offer };
  if (offer.outcome !== 'already') return fund(offer.reason);
  onProgress('waiting');
  const arrived = await waitForGrant({ txid: offer.txid, timeout: EARLIER_WAIT });
  if (shouldStop()) return { next: 'stopped' };
  if (!arrived) return fund(GIFT_NOTES.gone);
  onProgress('preparing');
  try {
    return ready(await prepare());
  } catch (error) {
    if (!insufficient(error)) throw error;
    return fund(GIFT_NOTES.short);
  }
}

// The newcomer tapped "Accept and publish". Claims the gift, waits for it,
// then publishes. Resolves to:
//   blocked    the verification box is not ticked; nothing was done
//   published  the introduction was sent ({ txid })
//   confirm    the fee is not covered by the gift; show the fee confirmation
//   later      the gift was sent but has not arrived yet; nothing was published
//   pending    the transaction is saved but the network has not taken it ({ message })
//   fund       the gift could not be had; offer the ways to get Marscoin ({ reason })
export async function acceptGift({
  verified,
  offer,
  claim,
  fetchOffer,
  waitForGrant,
  prepare,
  publish,
  onProgress = () => {},
  shouldStop = () => false,
  insufficient = isInsufficientFunds,
} = {}) {
  if (verified !== true) return { next: 'blocked' };
  if (offer?.outcome !== 'available') return fund(offer?.reason);

  onProgress('claiming');
  let grant = await claim(offer);
  if (grant.expired) {
    // The offer ran out while it was being read. Ask once more and claim that.
    const fresh = await fetchOffer();
    grant = fresh.outcome === 'available' ? await claim(fresh) : fresh;
  }
  if (shouldStop()) return { next: 'stopped' };
  const sent = grant.outcome === 'sent';
  if (!sent && grant.outcome !== 'already') return fund(grant.reason);

  onProgress('waiting');
  const arrived = await waitForGrant({ txid: grant.txid, timeout: sent ? SENT_WAIT : EARLIER_WAIT });
  if (shouldStop()) return { next: 'stopped' };
  if (!arrived) return sent ? { next: 'later' } : fund(GIFT_NOTES.gone);

  onProgress('preparing');
  let publication;
  try {
    publication = await prepare();
  } catch (error) {
    if (!insufficient(error)) throw error;
    return fund(GIFT_NOTES.short);
  }
  if (shouldStop()) return { next: 'stopped' };
  if (publication.status === 'submitted') return { next: 'published', txid: publication.txid };
  const gift = grant.amountZubrins || offer.amountZubrins;
  const covered = Number.isSafeInteger(publication.fee) && publication.fee > 0 && Number.isSafeInteger(gift) && publication.fee <= gift;
  if (!covered) return { next: 'confirm', publication };

  onProgress('publishing');
  try {
    const submitted = await publish(publication);
    return { next: 'published', txid: submitted.txid };
  } catch (error) {
    return { next: 'pending', message: error?.message || 'Your signed transaction is saved. Try again in a little while.' };
  }
}

// What the screen says while each part is under way.
export const GIFT_PROGRESS = {
  asking: 'Checking for a welcome gift…',
  claiming: 'Requesting your welcome gift…',
  waiting: 'Waiting for it to arrive…',
  preparing: 'Your welcome gift arrived. Preparing your introduction…',
  publishing: 'Publishing your introduction…',
};
