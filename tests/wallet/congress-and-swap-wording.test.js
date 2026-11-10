import { ballotStatus } from '../../blue_modules/voting/ballot-transactions';
import { ballotWindow, isVotingOpen, parseServerTime, tally, timeLeft } from '../../blue_modules/voting/congress';
import { SwapState } from '../../blue_modules/swap/engine';
import { describeSwap, formatBtc, formatCoins, formatMars, formatSats, satsPerMars, timeUntil } from '../../blue_modules/swap/present';

jest.mock('axios', () => ({ get: jest.fn() }));

describe('Congress results and timing', () => {
  it('computes percentages from counts, ignoring the server percentage fields', () => {
    // Live proposal 14 reported yay_percent "0.0000" with two yes votes and no no votes.
    expect(tally({ yays: 2, nays: 0, yay_percent: '0.0000', nay_percent: '0.0000' })).toEqual({
      yes: 2,
      no: 0,
      total: 2,
      yesPercent: 100,
      noPercent: 0,
    });
    expect(tally({ yays: 1, nays: 2 })).toMatchObject({ yesPercent: 33, noPercent: 67, total: 3 });
    expect(tally({})).toEqual({ yes: 0, no: 0, total: 0, yesPercent: 0, noPercent: 0 });
    expect(tally(undefined).total).toBe(0);
  });

  it('opens voting only for a proposal in its voting phase with an on-chain record', () => {
    const proposal = { phase: 'voting', txid: 'ab', ipfs_hash: 'https://ipfs.marscoin.org/ipfs/Qm' };
    expect(isVotingOpen(proposal)).toBe(true);
    expect(isVotingOpen({ ...proposal, phase: 'voting_extended' })).toBe(true);
    expect(isVotingOpen({ ...proposal, phase: 'screening' })).toBe(false);
    expect(isVotingOpen({ ...proposal, phase: 'expired' })).toBe(false);
    expect(isVotingOpen({ ...proposal, txid: null })).toBe(false);
    expect(isVotingOpen(null)).toBe(false);
  });

  it('reads server times as UTC and describes the time remaining', () => {
    expect(parseServerTime('2026-03-29 03:25:40').toISOString()).toBe('2026-03-29T03:25:40.000Z');
    expect(parseServerTime('2026-03-29T03:25:40Z').toISOString()).toBe('2026-03-29T03:25:40.000Z');
    expect(parseServerTime('')).toBeNull();
    expect(parseServerTime('not a date')).toBeNull();
    const now = Date.parse('2026-03-29T03:00:00Z');
    expect(timeLeft('2026-03-29 03:25:40', now)).toBe('25 min left');
    expect(timeLeft('2026-03-29 09:00:00', now)).toBe('6 h left');
    expect(timeLeft('2026-04-05 03:00:00', now)).toBe('7 sols left');
    expect(timeLeft('2026-03-29 02:00:00', now)).toBe('closed');
    expect(timeLeft(null, now)).toBeNull();
  });

  it('follows the hourly gathering convention', () => {
    expect(ballotWindow(new Date(2026, 10, 9, 14, 0))).toEqual({ open: true, minutesLeft: 15 });
    expect(ballotWindow(new Date(2026, 10, 9, 14, 14))).toEqual({ open: true, minutesLeft: 1 });
    expect(ballotWindow(new Date(2026, 10, 9, 14, 15))).toEqual({ open: false, minutesUntil: 45 });
    expect(ballotWindow(new Date(2026, 10, 9, 14, 59))).toEqual({ open: false, minutesUntil: 1 });
  });

  it('derives the state of a ballot from the chain alone', () => {
    expect(ballotStatus({ history: [], utxos: [], votes: [] })).toEqual({ status: 'none' });
    expect(ballotStatus({ history: [{}], utxos: [{ height: 0 }], votes: [] })).toEqual({ status: 'confirming' });
    expect(ballotStatus({ history: [{}], utxos: [{ height: 3598000 }], votes: [] })).toEqual({ status: 'ready' });
    const vote = { choice: 'yes', txid: 'ab', confirmed: false };
    expect(ballotStatus({ history: [{}, {}], utxos: [], votes: [vote] })).toEqual({ status: 'cast', choice: 'yes', txid: 'ab' });
    expect(ballotStatus({ history: [{}, {}], utxos: [], votes: [{ ...vote, confirmed: true }] })).toEqual({
      status: 'counted',
      choice: 'yes',
      txid: 'ab',
    });
    // Spent some other way: no vote to show.
    expect(ballotStatus({ history: [{}, {}], utxos: [], votes: [] })).toEqual({ status: 'none' });
  });
});

describe('Swap wording', () => {
  it('formats amounts exactly', () => {
    expect(formatCoins(7050000000)).toBe('70.5');
    expect(formatCoins(100000000000)).toBe('1,000');
    expect(formatCoins(1)).toBe('0.00000001');
    expect(formatCoins(0)).toBe('0');
    expect(formatMars(21150000000)).toBe('211.5 MARS');
    expect(formatSats(1234567)).toBe('1,234,567 sats');
    expect(formatBtc(6244)).toBe('0.00006244 BTC');
    expect(satsPerMars({ btcAmount: 6244, marsAmount: 7050000000 })).toBe('88.6');
  });

  it('describes time locks in plain terms', () => {
    expect(timeUntil(0, 600)).toBe('now');
    expect(timeUntil(-3, 600)).toBe('now');
    expect(timeUntil(3, 600)).toBe('about 30 min');
    expect(timeUntil(22, 600)).toBe('about 3 h 40 min');
    expect(timeUntil(12, 600)).toBe('about 2 h');
  });

  const swap = { btcAmount: 6244, marsAmount: 7050000000, error: null, btcPayment: null };

  it('never invites payment before the Marscoin lock is verified', () => {
    for (const state of [SwapState.ACCEPTING, SwapState.WAITING_MARS]) {
      const view = describeSwap({ ...swap, state });
      expect(view.canPay).toBe(false);
      expect(view.canCancel).toBe(true);
    }
    expect(describeSwap({ ...swap, state: SwapState.WAITING_MARS }).body).toMatch(/Do not send Bitcoin yet/);
  });

  it('offers payment exactly once and no cancellation after paying', () => {
    expect(describeSwap({ ...swap, state: SwapState.READY_TO_PAY })).toMatchObject({ canPay: true, canCancel: true, step: 2 });
    expect(describeSwap({ ...swap, state: SwapState.READY_TO_PAY, btcPayment: { txid: 'ab' } })).toMatchObject({
      canPay: false,
      canCancel: false,
    });
    for (const state of [SwapState.BTC_SENT, SwapState.CLAIMING, SwapState.REFUNDING, SwapState.COMPLETED, SwapState.REFUNDED]) {
      expect(describeSwap({ ...swap, state })).toMatchObject({ canPay: false, canCancel: false });
    }
  });

  it('reports the amount received after the claim fee, and each ending honestly', () => {
    expect(describeSwap({ ...swap, state: SwapState.COMPLETED }).body).toBe('70.499 MARS arrived in your wallet.');
    expect(describeSwap({ ...swap, state: SwapState.REFUNDED }).body).toMatch(/returned to your wallet, less network fees/);
    expect(describeSwap({ ...swap, state: SwapState.FAILED, error: 'Offer already taken. No Bitcoin was sent.' }).body).toBe(
      'Offer already taken. No Bitcoin was sent.',
    );
    expect(describeSwap({ ...swap, state: SwapState.UNCLAIMED, error: 'deadline' }).tone).toBe('error');
  });
});
