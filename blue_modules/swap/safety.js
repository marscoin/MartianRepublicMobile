// Timelock and offer checks for the taker side of an atomic swap. The numbers
// mirror electrum_mars/plugins/atomic_swap/safety.py so both clients agree on
// which offers are safe to take.
export const MARS_TIMELOCK_BLOCKS = 234;
export const BTC_TIMELOCK_BLOCKS = 24;
// What this app's own offers lock for: about sixteen hours. Marscoin blocks
// arrive in bursts (234 blocks have passed in under four hours), and a
// seller's refund must never open before the buyer's Bitcoin refund has.
// Longer is always safe for the buyer; other wallets accept it as is.
export const MAKER_MARS_TIMELOCK_BLOCKS = 480;
export const MARS_MIN_CONFIRMATIONS = 2;
export const MARS_BLOCK_SECONDS = 123;
export const BTC_BLOCK_SECONDS = 600;
// Pessimistic drift: Marscoin blocks arriving faster, Bitcoin blocks slower.
const MARS_FAST = 0.85;
const BTC_SLOW = 1.25;
export const MIN_REFUND_GAP_SECONDS = 3600;
export const MIN_BTC_WINDOW_SECONDS = 7200;
// Fixed by the protocol: both clients deduct it from the Marscoin contract.
export const MARS_SPEND_FEE = 100000;
// Virtual size of a one-input contract spend, rounded up.
export const BTC_SPEND_VBYTES = 150;
export const DUST = 546;
// A maker claims Bitcoin only when the claim can confirm before the taker's
// refund opens: the claim reveals the secret.
export const MAKER_CLAIM_MARGIN_BLOCKS = 3;
// Confirmations of the taker's Bitcoin before a maker reveals the secret.
export const MAKER_BTC_CONFIRMATIONS = 2;

const height = value => Number.isSafeInteger(value) && value > 0;

// Seconds between our Bitcoin refund becoming possible and the maker's
// Marscoin refund becoming possible, assuming the worst plausible block times.
// The Bitcoin side must unlock first, or the maker could take both coins.
export function refundGapSeconds({ marsHeight, marsLocktime, btcHeight, btcLocktime }) {
  return (marsLocktime - marsHeight) * MARS_BLOCK_SECONDS * MARS_FAST - (btcLocktime - btcHeight) * BTC_BLOCK_SECONDS * BTC_SLOW;
}

export function refundOrderProblem(heights) {
  if (![heights.marsHeight, heights.marsLocktime, heights.btcHeight, heights.btcLocktime].every(height)) {
    return 'Current block heights are unavailable.';
  }
  if (refundGapSeconds(heights) < MIN_REFUND_GAP_SECONDS) {
    return 'This offer is too close to its Marscoin deadline to complete safely.';
  }
  return null;
}

export function btcWindowProblem({ btcHeight, btcLocktime }) {
  if (!height(btcHeight) || !height(btcLocktime)) return 'The current Bitcoin block height is unavailable.';
  if ((btcLocktime - btcHeight) * BTC_BLOCK_SECONDS < MIN_BTC_WINDOW_SECONDS) {
    return 'Too little time is left to pay Bitcoin safely.';
  }
  return null;
}

export function makerClaimProblem({ btcHeight, btcLocktime }) {
  if (!height(btcHeight) || !height(btcLocktime)) return 'The current Bitcoin block height is unavailable.';
  if (btcLocktime - btcHeight < MAKER_CLAIM_MARGIN_BLOCKS) return 'Too close to the Bitcoin refund time to collect safely.';
  return null;
}

// The Bitcoin we lock must remain recoverable at the current fee rate.
export function btcFeeProblem({ btcAmount, feeRate }) {
  if (!Number.isFinite(feeRate) || feeRate <= 0) return 'The Bitcoin network fee is unavailable.';
  if (btcAmount - Math.ceil(feeRate * BTC_SPEND_VBYTES) < DUST) {
    return 'This offer is too small to refund at current Bitcoin fees.';
  }
  return null;
}

// Offers are unsigned and unauthenticated bulletin-board entries. Accept only
// well-formed values; never use the relay's address, script or rate fields.
export function normalizeOffer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { offer_id: id, mars_amount_sat: marsAmount, btc_amount_sat: btcAmount, maker_pubkey: makerPubkey } = raw;
  const { payment_hash160: paymentHash, mars_locktime: marsLocktime, expires_at: expiresAt } = raw;
  if (typeof id !== 'string' || !/^[0-9a-f]{8,64}$/.test(id)) return null;
  if (typeof makerPubkey !== 'string' || !/^0[23][0-9a-f]{64}$/.test(makerPubkey)) return null;
  if (typeof paymentHash !== 'string' || !/^[0-9a-f]{40}$/.test(paymentHash)) return null;
  if (!Number.isSafeInteger(marsAmount) || marsAmount <= MARS_SPEND_FEE + DUST) return null;
  if (!Number.isSafeInteger(btcAmount) || btcAmount <= DUST) return null;
  if (!height(marsLocktime) || marsLocktime >= 500000000) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  return { id, marsAmount, btcAmount, makerPubkey, paymentHash, marsLocktime, expiresAt };
}

// Zubrins of Marscoin received per satoshi paid; higher is better for the taker.
export const offerPrice = offer => offer.btcAmount / offer.marsAmount;

// Annotate and order offers: usable ones first, cheapest per Marscoin first.
export function rankOffers(offers, { marsHeight, btcHeight, feeRate, now }) {
  return offers
    .map(offer => {
      const heights = { marsHeight, marsLocktime: offer.marsLocktime, btcHeight, btcLocktime: btcHeight + BTC_TIMELOCK_BLOCKS };
      const problem =
        (offer.expiresAt <= now ? 'This offer has expired.' : null) ||
        refundOrderProblem(heights) ||
        btcWindowProblem(heights) ||
        btcFeeProblem({ btcAmount: offer.btcAmount, feeRate });
      return { ...offer, problem };
    })
    .sort((a, b) => !!a.problem - !!b.problem || offerPrice(a) - offerPrice(b));
}
