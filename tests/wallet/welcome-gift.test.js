// The welcome gift at the moment of publishing, walked through with stand-ins
// for the server, the wallet and the chain. Nothing here reaches a network.
import { INSUFFICIENT_FUNDS } from '../../blue_modules/citizenship-publication';
import { GIFT_NOTES, GIFT_PROGRESS, acceptGift, giftAmountText, startPublishing } from '../../blue_modules/welcome-gift';

const txid = 'ab'.repeat(32);
const grantTxid = 'cd'.repeat(32);
const GIFT = 1000000; // 0.01 MARS
const tooFew = () => Object.assign(new Error('Your civic wallet does not hold enough Marscoin.'), { code: INSUFFICIENT_FUNDS });
const prepared = (extra = {}) => ({ txid, txHex: '00', fee: 2260, status: 'prepared', ...extra });
const available = { outcome: 'available', txid: null, amountZubrins: GIFT, reason: null, challenge: { nonce: 'n1' } };

// A newcomer's phone: an empty civic wallet until a gift arrives.
const granted = { outcome: 'sent', txid: grantTxid, amountZubrins: GIFT };
function phone({ funded = false, offer = available, claim = granted, arrives = true } = {}) {
  const state = { funded, events: [] };
  const note = event => state.events.push(event);
  return {
    state,
    events: state.events,
    prepare: jest.fn(async () => {
      note('prepare');
      if (!state.funded) throw tooFew();
      return prepared();
    }),
    fetchOffer: jest.fn(async () => {
      note('offer');
      return offer;
    }),
    claim: jest.fn(async () => {
      note('claim');
      return claim;
    }),
    waitForGrant: jest.fn(async () => {
      note('wait');
      if (arrives) state.funded = true;
      return arrives;
    }),
    publish: jest.fn(async publication => {
      note('publish');
      return { ...publication, status: 'submitted' };
    }),
    onProgress: jest.fn(step => note(`progress:${step}`)),
  };
}

describe('Tapping the publish button', () => {
  it('does nothing at all until the verification box is ticked', async () => {
    for (const verified of [false, undefined, null, 'yes', 1]) {
      const p = phone({ funded: true });
      expect(await startPublishing({ ...p, verified })).toEqual({ next: 'blocked' });
      expect(p.events).toEqual([]);
    }
  });

  it('skips the gift entirely when the wallet can pay, and goes to the fee confirmation', async () => {
    const p = phone({ funded: true });
    expect(await startPublishing({ ...p, verified: true })).toEqual({ next: 'confirm', publication: prepared() });
    expect(p.fetchOffer).not.toHaveBeenCalled();
    expect(p.claim).not.toHaveBeenCalled();
    expect(p.events).toEqual(['prepare']);
  });

  it('shows the gift when the wallet cannot pay and one is on offer, without claiming it', async () => {
    const p = phone();
    expect(await startPublishing({ ...p, verified: true })).toEqual({ next: 'gift', offer: available });
    expect(p.events).toEqual(['prepare', 'progress:asking', 'offer']);
    expect(p.claim).not.toHaveBeenCalled();
    expect(p.waitForGrant).not.toHaveBeenCalled();
    expect(p.publish).not.toHaveBeenCalled();
  });

  it('falls back to the ways to get Marscoin, with the reason, when no gift is coming', async () => {
    const reasons = {
      unavailable: 'The welcome gift is not available right now.',
      not_eligible: 'This address has received Marscoin before.',
      failed: 'The welcome gift could not be requested. Check your connection and try again.',
    };
    for (const [outcome, reason] of Object.entries(reasons)) {
      const p = phone({ offer: { outcome, txid: null, amountZubrins: null, reason } });
      expect(await startPublishing({ ...p, verified: true })).toEqual({ next: 'fund', reason });
      expect(p.claim).not.toHaveBeenCalled();
      expect(p.waitForGrant).not.toHaveBeenCalled();
    }
  });

  it('with a gift already granted and the coins there, goes on to the fee confirmation as before', async () => {
    const p = phone({ offer: { outcome: 'already', txid: grantTxid, amountZubrins: GIFT, reason: 'Already sent.' } });
    expect(await startPublishing({ ...p, verified: true })).toEqual({ next: 'confirm', publication: prepared() });
    expect(p.waitForGrant).toHaveBeenCalledWith({ txid: grantTxid, timeout: 30000 });
    expect(p.events).toEqual(['prepare', 'progress:asking', 'offer', 'progress:waiting', 'wait', 'progress:preparing', 'prepare']);
    expect(p.claim).not.toHaveBeenCalled();
    expect(p.publish).not.toHaveBeenCalled();
  });

  it('with a gift already granted but the coins gone, says so and offers the ways to get Marscoin', async () => {
    const p = phone({ offer: { outcome: 'already', txid: grantTxid, amountZubrins: GIFT, reason: 'Already sent.' }, arrives: false });
    expect(await startPublishing({ ...p, verified: true })).toEqual({ next: 'fund', reason: GIFT_NOTES.gone });
  });

  it('reports an introduction that was already sent, and passes other trouble on', async () => {
    const sent = phone({ funded: true });
    sent.prepare.mockResolvedValue(prepared({ status: 'submitted' }));
    expect(await startPublishing({ ...sent, verified: true })).toEqual({ next: 'published', txid });

    const broken = phone();
    broken.prepare.mockRejectedValue(new Error('Complete every application field before publishing.'));
    await expect(startPublishing({ ...broken, verified: true })).rejects.toThrow('Complete every application field');
    expect(broken.fetchOffer).not.toHaveBeenCalled();
  });

  it('stops quietly when the screen was left meanwhile', async () => {
    const p = phone();
    expect(await startPublishing({ ...p, verified: true, shouldStop: () => true })).toEqual({ next: 'stopped' });
  });
});

describe('Accepting the gift', () => {
  it('claims, waits for the coins, then publishes without a second confirmation', async () => {
    const p = phone();
    const shown = await startPublishing({ ...p, verified: true });
    p.events.length = 0;
    expect(await acceptGift({ ...p, verified: true, offer: shown.offer })).toEqual({ next: 'published', txid });
    expect(p.events).toEqual([
      'progress:claiming',
      'claim',
      'progress:waiting',
      'wait',
      'progress:preparing',
      'prepare',
      'progress:publishing',
      'publish',
    ]);
    expect(p.claim).toHaveBeenCalledWith(available);
    expect(p.waitForGrant).toHaveBeenCalledWith({ txid: grantTxid, timeout: 180000 });
    expect(p.publish).toHaveBeenCalledWith(prepared());
    // Every step has words for the screen.
    for (const [step] of p.onProgress.mock.calls) expect(GIFT_PROGRESS[step]).toEqual(expect.any(String));
  });

  it('never claims or publishes without the verification box ticked', async () => {
    for (const verified of [false, undefined, null, 'yes']) {
      const p = phone();
      expect(await acceptGift({ ...p, verified, offer: available })).toEqual({ next: 'blocked' });
      expect(p.events).toEqual([]);
    }
  });

  it('claims nothing without an offer that is actually available', async () => {
    for (const offer of [null, undefined, { outcome: 'unavailable', reason: 'Off.' }, { outcome: 'already', txid: grantTxid }]) {
      const p = phone();
      expect((await acceptGift({ ...p, verified: true, offer })).next).toBe('fund');
      expect(p.events).toEqual([]);
    }
  });

  it('asks for the fee confirmation instead when the gift does not cover the fee', async () => {
    for (const fee of [GIFT + 1, 0, undefined, 1.5]) {
      const p = phone();
      p.prepare.mockImplementation(async () => prepared({ fee }));
      expect(await acceptGift({ ...p, verified: true, offer: available })).toEqual({ next: 'confirm', publication: prepared({ fee }) });
      expect(p.publish).not.toHaveBeenCalled();
    }
    // The same when nobody said how large the gift is.
    const unknown = phone({ claim: { outcome: 'sent', txid: grantTxid, amountZubrins: null } });
    expect((await acceptGift({ ...unknown, verified: true, offer: { ...available, amountZubrins: null } })).next).toBe('confirm');
    expect(unknown.publish).not.toHaveBeenCalled();
    // A fee exactly the size of the gift is still covered.
    const exact = phone();
    exact.prepare.mockImplementation(async () => prepared({ fee: GIFT }));
    expect((await acceptGift({ ...exact, verified: true, offer: available })).next).toBe('published');
  });

  it('publishes nothing when the gift was sent but has not arrived, and says it is on its way', async () => {
    const p = phone({ arrives: false });
    expect(await acceptGift({ ...p, verified: true, offer: available })).toEqual({ next: 'later' });
    expect(p.prepare).not.toHaveBeenCalled();
    expect(p.publish).not.toHaveBeenCalled();
  });

  it('falls back to the ways to get Marscoin when the claim is refused', async () => {
    for (const claim of [
      { outcome: 'unavailable', reason: 'The welcome gift is not available right now.' },
      { outcome: 'not_eligible', reason: 'This address has received Marscoin before.' },
      { outcome: 'failed', reason: 'The server did not accept the proof of your civic key.' },
    ]) {
      const p = phone({ claim });
      expect(await acceptGift({ ...p, verified: true, offer: available })).toEqual({ next: 'fund', reason: claim.reason });
      expect(p.waitForGrant).not.toHaveBeenCalled();
      expect(p.publish).not.toHaveBeenCalled();
    }
  });

  it('goes on when the claim finds the gift was granted a moment ago', async () => {
    const p = phone({ claim: { outcome: 'already', txid: grantTxid, amountZubrins: GIFT } });
    expect((await acceptGift({ ...p, verified: true, offer: available })).next).toBe('published');
    expect(p.waitForGrant).toHaveBeenCalledWith({ txid: grantTxid, timeout: 30000 });

    const gone = phone({ claim: { outcome: 'already', txid: grantTxid, amountZubrins: GIFT }, arrives: false });
    expect(await acceptGift({ ...gone, verified: true, offer: available })).toEqual({ next: 'fund', reason: GIFT_NOTES.gone });
  });

  it('fetches a fresh offer once when the first ran out while it was being read', async () => {
    const p = phone();
    const fresh = { ...available, challenge: { nonce: 'n2' } };
    p.fetchOffer.mockResolvedValue(fresh);
    p.claim
      .mockResolvedValueOnce({ outcome: 'failed', reason: 'The request took too long and expired. Try again.', expired: true })
      .mockResolvedValueOnce({ outcome: 'sent', txid: grantTxid, amountZubrins: GIFT });
    expect((await acceptGift({ ...p, verified: true, offer: available })).next).toBe('published');
    expect(p.claim.mock.calls.map(call => call[0])).toEqual([available, fresh]);

    // If the gift is no longer on offer by then, nothing more is claimed.
    const late = phone();
    late.fetchOffer.mockResolvedValue({ outcome: 'unavailable', reason: 'The welcome gift is not available right now.' });
    late.claim.mockResolvedValue({ outcome: 'failed', reason: 'Expired.', expired: true });
    expect(await acceptGift({ ...late, verified: true, offer: available })).toEqual({
      next: 'fund',
      reason: 'The welcome gift is not available right now.',
    });
    expect(late.claim).toHaveBeenCalledTimes(1);
  });

  it('says the fee is still short if the gift arrived and was not enough', async () => {
    const p = phone();
    p.prepare.mockRejectedValue(tooFew());
    expect(await acceptGift({ ...p, verified: true, offer: available })).toEqual({ next: 'fund', reason: GIFT_NOTES.short });
    expect(p.publish).not.toHaveBeenCalled();
  });

  it('keeps the signed transaction when the network does not take it', async () => {
    const p = phone();
    p.publish.mockRejectedValue(new Error('Submission is not confirmed yet. Your signed transaction is saved.'));
    expect(await acceptGift({ ...p, verified: true, offer: available })).toEqual({
      next: 'pending',
      message: 'Submission is not confirmed yet. Your signed transaction is saved.',
    });
  });

  it('does not publish after the screen was left', async () => {
    const p = phone();
    let left = false;
    p.waitForGrant.mockImplementation(async () => {
      left = true;
      return true;
    });
    expect(await acceptGift({ ...p, verified: true, offer: available, shouldStop: () => left })).toEqual({ next: 'stopped' });
    expect(p.prepare).not.toHaveBeenCalled();
    expect(p.publish).not.toHaveBeenCalled();
  });
});

describe('Declining the gift', () => {
  it('needs nothing from the server: an offer that is never accepted is never claimed', async () => {
    const p = phone();
    const shown = await startPublishing({ ...p, verified: true });
    expect(shown.next).toBe('gift');
    // "Not now" simply never calls acceptGift. Asking again later offers it again.
    expect((await startPublishing({ ...p, verified: true })).next).toBe('gift');
    expect(p.claim).not.toHaveBeenCalled();
    expect(p.waitForGrant).not.toHaveBeenCalled();
    expect(p.publish).not.toHaveBeenCalled();
  });
});

describe('The amount in words', () => {
  it('shows the real amount from the offer', () => {
    expect(giftAmountText(1000000)).toBe('0.01 MARS');
    expect(giftAmountText(5000000)).toBe('0.05 MARS');
    expect(giftAmountText(100000000)).toBe('1 MARS');
    expect(giftAmountText(123)).toBe('0.00000123 MARS');
  });

  it('says nothing rather than something made up', () => {
    for (const amount of [null, undefined, 0, -5, 1.5, '1000000', NaN]) expect(giftAmountText(amount)).toBeNull();
  });
});
