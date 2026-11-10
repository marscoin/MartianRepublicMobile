// When to ask for an App Store review: only right after something went well,
// only once the app has been in use for a while, and rarely. Apple and Google
// also apply their own limits to how often the system dialog really appears.
const DAY = 24 * 3600 * 1000;
export const MIN_DAYS_INSTALLED = 3;
export const MIN_OPENS = 5;
export const MIN_DAYS_BETWEEN_ASKS = 120;
export const MAX_ASKS = 3;

export const initialReviewState = now => ({ firstOpenAt: now, opens: 0, asks: 0, lastAskedAt: 0 });

export function noteOpen(state, now) {
  const current = state && Number.isFinite(state.firstOpenAt) ? state : initialReviewState(now);
  return { ...current, opens: (current.opens || 0) + 1 };
}

// `state` as stored; `now` in milliseconds. Call only at a good moment, such
// as a completed swap, a vote cast or a payment sent.
export function shouldAskForReview(state, now) {
  if (!state || !Number.isFinite(state.firstOpenAt)) return false;
  if (now - state.firstOpenAt < MIN_DAYS_INSTALLED * DAY) return false;
  if ((state.opens || 0) < MIN_OPENS) return false;
  if ((state.asks || 0) >= MAX_ASKS) return false;
  if (state.lastAskedAt && now - state.lastAskedAt < MIN_DAYS_BETWEEN_ASKS * DAY) return false;
  return true;
}

export const noteAsked = (state, now) => ({ ...state, asks: (state.asks || 0) + 1, lastAskedAt: now });
