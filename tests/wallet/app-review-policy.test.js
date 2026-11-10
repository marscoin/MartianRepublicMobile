import { initialReviewState, noteAsked, noteOpen, shouldAskForReview } from '../../blue_modules/app-review-policy';

const DAY = 24 * 3600 * 1000;
const start = Date.UTC(2026, 10, 10);
const used = (days, opens, extra = {}) => ({ firstOpenAt: start, opens, asks: 0, lastAskedAt: 0, ...extra });

describe('When to ask for a review', () => {
  it('waits until the app has been installed a few days and opened several times', () => {
    expect(shouldAskForReview(used(0, 1), start + 1000)).toBe(false);
    expect(shouldAskForReview(used(0, 20), start + 2 * DAY)).toBe(false);
    expect(shouldAskForReview(used(0, 4), start + 10 * DAY)).toBe(false);
    expect(shouldAskForReview(used(0, 5), start + 3 * DAY)).toBe(true);
  });

  it('asks rarely: months apart, and no more than three times', () => {
    const asked = noteAsked(used(0, 9), start + 4 * DAY);
    expect(asked).toMatchObject({ asks: 1, lastAskedAt: start + 4 * DAY });
    expect(shouldAskForReview(asked, start + 5 * DAY)).toBe(false);
    expect(shouldAskForReview(asked, start + 100 * DAY)).toBe(false);
    expect(shouldAskForReview(asked, start + 125 * DAY)).toBe(true);
    expect(shouldAskForReview(used(0, 50, { asks: 3, lastAskedAt: start }), start + 900 * DAY)).toBe(false);
  });

  it('counts opens from the first one and survives missing or damaged state', () => {
    expect(noteOpen(null, start)).toEqual({ firstOpenAt: start, opens: 1, asks: 0, lastAskedAt: 0 });
    expect(noteOpen({ junk: true }, start).opens).toBe(1);
    expect(noteOpen(noteOpen(null, start), start + DAY)).toMatchObject({ firstOpenAt: start, opens: 2 });
    expect(shouldAskForReview(null, start)).toBe(false);
    expect(shouldAskForReview({}, start)).toBe(false);
    expect(initialReviewState(start).opens).toBe(0);
  });
});
