import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import { Marscoin } from '../../blue_modules/constants';
import {
  GRANT_API,
  claimGrantOffer,
  fetchGrantOffer,
  grantMessage,
  requestWelcomeGrant,
  waitForGrant,
} from '../../blue_modules/welcome-grant';

// A throwaway key made for this run. Nothing here belongs to a real wallet.
const key = bitcoin.ECPair.makeRandom({ network: Marscoin.mainnet });
const address = bitcoin.payments.p2pkh({ pubkey: key.publicKey, network: Marscoin.mainnet }).address;
const other = bitcoin.payments.p2pkh({ pubkey: bitcoin.ECPair.makeRandom().publicKey, network: Marscoin.mainnet }).address;
const txid = 'ab'.repeat(32);
const nonce = 'f3a9c1d27b6e4805';

const notFound = () => Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });

function setup({ challenge = {}, claim = {} } = {}) {
  const wallet = {
    civic: true,
    _getExternalAddressByIndex: () => address,
    _getExternalWIFByIndex: () => key.toWIF(),
  };
  const replies = {
    [`${GRANT_API}/grant/challenge`]: {
      eligible: true,
      reason: null,
      status: 'available',
      address,
      amount_zubrins: 5000000,
      nonce,
      message: grantMessage(address, nonce),
      expires_at: '2026-11-11T12:00:00Z',
      txid: null,
      ...challenge,
    },
    [`${GRANT_API}/grant/claim`]: { status: 'sent', txid, amount_zubrins: 5000000, reason: null, ...claim },
  };
  const http = {
    post: jest.fn(async url => {
      if (replies[url] instanceof Error) throw replies[url];
      return { data: replies[url] };
    }),
  };
  const getToken = jest.fn(async () => 'session-token');
  const posted = url => http.post.mock.calls.filter(call => call[0] === url);
  return { wallet, http, getToken, replies, posted, claims: () => posted(`${GRANT_API}/grant/claim`) };
}

describe('Requesting the welcome grant', () => {
  it('proves the civic key and reports the grant as sent', async () => {
    const f = setup();
    const result = await requestWelcomeGrant(f);
    expect(result).toEqual({ outcome: 'sent', txid, amountZubrins: 5000000, reason: null });

    expect(f.http.post).toHaveBeenCalledTimes(2);
    const [url, body, config] = f.claims()[0];
    expect(url).toBe('https://martianrepublic.org/api/grant/claim');
    expect(Object.keys(body).sort()).toEqual(['address', 'nonce', 'signature']);
    expect(body).toMatchObject({ address, nonce });
    // Signed the same way as sign-in: the exact three lines, by the civic key.
    const message = `Martian Republic welcome grant\naddress: ${address}\nnonce: ${nonce}`;
    expect(bitcoinMessage.verify(message, address, body.signature)).toBe(true);
    for (const call of f.http.post.mock.calls) {
      expect(call[2].headers.Authorization).toBe('Bearer session-token');
      expect(call[2].timeout).toBeGreaterThan(0);
    }
    expect(config.timeout).toBe(15000);
  });

  it('refuses to sign when the message is not exactly the expected text', async () => {
    const tampered = [
      `Martian Republic welcome grant\naddress: ${address}\nnonce: ${nonce}\nI also authorise a transfer`,
      `Martian Republic welcome grant\naddress: ${other}\nnonce: ${nonce}`,
      `Martian Republic welcome grant\naddress: ${address}\nnonce: another-nonce`,
      `https://martianrepublic.org/api/token?a=${address}&t=1700000000`,
      ` ${grantMessage(address, nonce)}`,
      null,
    ];
    for (const message of tampered) {
      const f = setup({ challenge: { message } });
      const sign = jest.fn();
      const result = await requestWelcomeGrant({ ...f, sign });
      expect(result.outcome).toBe('failed');
      expect(result.reason).toMatch(/nothing was signed/);
      expect(sign).not.toHaveBeenCalled();
      expect(f.claims()).toHaveLength(0);
    }
  });

  it('refuses to sign for an address that is not this wallet', async () => {
    // The message is self-consistent, but about somebody else's address.
    const f = setup({ challenge: { address: other, message: grantMessage(other, nonce) } });
    const sign = jest.fn();
    expect((await requestWelcomeGrant({ ...f, sign })).outcome).toBe('failed');
    expect(sign).not.toHaveBeenCalled();
    expect(f.claims()).toHaveLength(0);
  });

  it('refuses a nonce that could smuggle extra lines into the signed text', async () => {
    for (const bad of ['abc\nextra: line', '', 'has space', null, 42]) {
      const f = setup({ challenge: { nonce: bad, message: grantMessage(address, bad) } });
      const sign = jest.fn();
      expect((await requestWelcomeGrant({ ...f, sign })).outcome).toBe('failed');
      expect(sign).not.toHaveBeenCalled();
    }
  });

  it('treats a server without the routes as unavailable', async () => {
    const f = setup();
    f.replies[`${GRANT_API}/grant/challenge`] = notFound();
    expect(await requestWelcomeGrant(f)).toMatchObject({ outcome: 'unavailable', txid: null, amountZubrins: null });
    expect(f.http.post).toHaveBeenCalledTimes(1);

    const g = setup();
    g.replies[`${GRANT_API}/grant/claim`] = notFound();
    expect((await requestWelcomeGrant(g)).outcome).toBe('unavailable');
  });

  it('treats a switched-off grant as unavailable, at either step', async () => {
    const off = setup({ challenge: { status: 'unavailable', eligible: false, nonce: null, message: null } });
    const result = await requestWelcomeGrant(off);
    expect(result.outcome).toBe('unavailable');
    expect(result.reason).toBeTruthy();
    expect(off.claims()).toHaveLength(0);

    expect((await requestWelcomeGrant(setup({ claim: { status: 'unavailable', txid: null } }))).outcome).toBe('unavailable');
  });

  it('reports a grant that was already made, with its transaction', async () => {
    const before = setup({ challenge: { status: 'already_granted', eligible: false, nonce: null, message: null, txid } });
    expect(await requestWelcomeGrant(before)).toMatchObject({ outcome: 'already', txid, amountZubrins: 5000000 });
    expect(before.claims()).toHaveLength(0);

    const raced = setup({ claim: { status: 'already_granted', txid } });
    expect(await requestWelcomeGrant(raced)).toMatchObject({ outcome: 'already', txid });
  });

  it('passes on why an address is not eligible', async () => {
    const f = setup({ challenge: { status: 'not_eligible', eligible: false, reason: 'This address has received Marscoin before.' } });
    expect(await requestWelcomeGrant(f)).toMatchObject({ outcome: 'not_eligible', reason: 'This address has received Marscoin before.' });
    expect(f.claims()).toHaveLength(0);
    // An unusable explanation is replaced by a plain one.
    const odd = await requestWelcomeGrant(setup({ claim: { status: 'not_eligible', reason: { code: 7 } } }));
    expect(odd.outcome).toBe('not_eligible');
    expect(typeof odd.reason).toBe('string');
  });

  it('fails plainly when the server rejects the signature or the challenge expired', async () => {
    const rejected = await requestWelcomeGrant(setup({ claim: { status: 'invalid_signature', txid: null } }));
    expect(rejected).toMatchObject({ outcome: 'failed', txid: null });
    expect(rejected.reason).toMatch(/proof of your civic key/);
    const expired = await requestWelcomeGrant(setup({ claim: { status: 'expired', txid: null } }));
    expect(expired.outcome).toBe('failed');
    expect(expired.reason).toMatch(/expired/);
  });

  it('maps every other trouble to a failure with a reason, never an exception', async () => {
    const offline = setup();
    offline.http.post.mockRejectedValue(new Error('Network Error'));
    const serverError = setup();
    serverError.replies[`${GRANT_API}/grant/claim`] = Object.assign(new Error('500'), { response: { status: 500 } });
    const noSession = setup();
    noSession.getToken.mockRejectedValue(new Error('Unable to sign in.'));
    const cases = [
      offline,
      serverError,
      noSession,
      setup({ challenge: { status: 'something_new' } }),
      setup({ challenge: { eligible: false } }),
      setup({ claim: { status: 'something_new' } }),
      { ...setup(), wallet: null },
      { ...setup(), wallet: { civic: false } },
    ];
    for (const options of cases) {
      const result = await requestWelcomeGrant(options);
      expect(result.outcome).toBe('failed');
      expect(typeof result.reason).toBe('string');
      expect(result.txid).toBeNull();
    }
    // A malformed txid or amount is dropped rather than passed on.
    const sloppy = await requestWelcomeGrant(setup({ claim: { status: 'sent', txid: 'not-a-txid', amount_zubrins: -1 } }));
    expect(sloppy).toMatchObject({ outcome: 'sent', txid: null, amountZubrins: null });
  });

  it('gives up on a request that never answers', async () => {
    jest.useFakeTimers();
    try {
      const f = setup();
      f.http.post.mockImplementation(() => new Promise(() => {}));
      const pending = requestWelcomeGrant({ ...f, timeout: 5000 });
      await jest.advanceTimersByTimeAsync(7000);
      expect((await pending).outcome).toBe('failed');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Waiting for the grant to arrive', () => {
  // A clock that only moves when the code under test sleeps.
  function clock() {
    let time = 1000000;
    return {
      now: () => time,
      sleep: jest.fn(async ms => {
        time += ms;
      }),
    };
  }
  function walletSeeing(rounds) {
    let round = -1;
    return {
      civic: true,
      _getExternalAddressByIndex: () => address,
      fetchBalance: jest.fn(async () => {
        round++;
      }),
      fetchUtxo: jest.fn(async () => {}),
      getUtxo: () => rounds[Math.min(round, rounds.length - 1)],
    };
  }

  it('resolves true as soon as the granted coin shows up, confirmed or not', async () => {
    const wallet = walletSeeing([[], [], [{ address, value: 5000000, txid, confirmations: 0, height: 0 }]]);
    const time = clock();
    expect(await waitForGrant({ wallet, txid, interval: 5000, timeout: 180000, ...time })).toBe(true);
    expect(wallet.fetchBalance).toHaveBeenCalledTimes(3);
    expect(wallet.fetchUtxo).toHaveBeenCalledTimes(3);
    expect(time.sleep).toHaveBeenCalledTimes(2);
  });

  it('ignores coins elsewhere in the wallet and, given a txid, other coins', async () => {
    const wallet = walletSeeing([
      [
        { address: other, value: 9000000, txid },
        { address, value: 300, txid: 'cd'.repeat(32) },
      ],
    ]);
    expect(await waitForGrant({ wallet, txid, interval: 5000, timeout: 20000, ...clock() })).toBe(false);
    // Without a txid to look for, any coin at the civic address will do.
    expect(await waitForGrant({ wallet, interval: 5000, timeout: 20000, ...clock() })).toBe(true);
  });

  it('resolves false when the wait runs out', async () => {
    const wallet = walletSeeing([[]]);
    const time = clock();
    expect(await waitForGrant({ wallet, txid, interval: 6000, timeout: 180000, ...time })).toBe(false);
    expect(wallet.fetchUtxo).toHaveBeenCalledTimes(31);
    expect(time.sleep).toHaveBeenCalledTimes(30);
    expect(time.sleep).toHaveBeenLastCalledWith(6000);
  });

  it('keeps looking through connection errors', async () => {
    const wallet = walletSeeing([[], [{ address, value: 5000000, txid }]]);
    wallet.fetchUtxo.mockRejectedValueOnce(new Error('Electrum client is not connected'));
    expect(await waitForGrant({ wallet, txid, interval: 1000, timeout: 10000, ...clock() })).toBe(true);
  });

  it('stops when asked, and does nothing without a civic wallet', async () => {
    const wallet = walletSeeing([[]]);
    let asked = 0;
    expect(await waitForGrant({ wallet, txid, interval: 1000, timeout: 60000, ...clock(), shouldStop: () => ++asked > 3 })).toBe(false);
    expect(wallet.fetchUtxo).toHaveBeenCalledTimes(2);
    expect(await waitForGrant({ wallet: null })).toBe(false);
  });
});

// The offer and the claim are separate steps so that nothing is requested
// until the newcomer accepts the gift.
describe('Asking about the gift, then claiming it', () => {
  it('asking only asks: one request, nothing signed, nothing claimed', async () => {
    const f = setup({ challenge: { amount_zubrins: 1000000 } });
    const sign = jest.fn();
    const offer = await fetchGrantOffer({ ...f, sign });
    expect(offer).toEqual({
      outcome: 'available',
      txid: null,
      amountZubrins: 1000000,
      reason: null,
      challenge: { address, nonce, message: grantMessage(address, nonce) },
    });
    expect(f.http.post).toHaveBeenCalledTimes(1);
    expect(f.http.post.mock.calls[0][0]).toBe('https://martianrepublic.org/api/grant/challenge');
    expect(f.http.post.mock.calls[0][1]).toEqual({});
    expect(sign).not.toHaveBeenCalled();
    expect(f.claims()).toHaveLength(0);
  });

  it('claims an accepted offer with a signature over exactly the expected message', async () => {
    const f = setup();
    const offer = await fetchGrantOffer(f);
    const result = await claimGrantOffer({ ...f, offer });
    expect(result).toEqual({ outcome: 'sent', txid, amountZubrins: 5000000, reason: null });
    expect(f.posted(GRANT_API + '/grant/challenge')).toHaveLength(1);
    const [, body] = f.claims()[0];
    expect(Object.keys(body).sort()).toEqual(['address', 'nonce', 'signature']);
    expect(bitcoinMessage.verify(grantMessage(address, nonce), address, body.signature)).toBe(true);
  });

  it('does not present an offer it could not safely claim', async () => {
    for (const challenge of [
      { message: grantMessage(address, nonce) + '\nI also authorise a transfer' },
      { address: other, message: grantMessage(other, nonce) },
      { nonce: 'abc\nextra: line', message: grantMessage(address, 'abc\nextra: line') },
    ]) {
      const offer = await fetchGrantOffer(setup({ challenge }));
      expect(offer.outcome).toBe('failed');
      expect(offer.reason).toMatch(/nothing was signed/);
      expect(offer.challenge).toBeUndefined();
    }
  });

  it('checks the offer again at the claim and signs nothing for a tampered one', async () => {
    const good = await fetchGrantOffer(setup());
    const tampered = [
      { ...good, challenge: { ...good.challenge, message: good.challenge.message + '\nextra' } },
      { ...good, challenge: { address: other, nonce, message: grantMessage(other, nonce) } },
      { ...good, challenge: { ...good.challenge, nonce: 'another-nonce' } },
      { ...good, challenge: null },
      { ...good, outcome: 'already' },
      null,
    ];
    for (const offer of tampered) {
      const f = setup();
      const sign = jest.fn();
      const result = await claimGrantOffer({ ...f, offer, sign });
      expect(result.outcome).toBe('failed');
      expect(result.reason).toMatch(/nothing was signed/);
      expect(sign).not.toHaveBeenCalled();
      expect(f.http.post).not.toHaveBeenCalled();
    }
  });

  it('reports the outcomes that are not an offer without a challenge to claim', async () => {
    const before = await fetchGrantOffer(
      setup({ challenge: { status: 'already_granted', eligible: false, nonce: null, message: null, txid } }),
    );
    expect(before).toEqual({ outcome: 'already', txid, amountZubrins: 5000000, reason: expect.any(String) });
    const off = await fetchGrantOffer(setup({ challenge: { status: 'unavailable', eligible: false, nonce: null, message: null } }));
    expect(off).toMatchObject({ outcome: 'unavailable', reason: 'The welcome gift is not available right now.' });
    const no = await fetchGrantOffer(
      setup({ challenge: { status: 'not_eligible', eligible: false, reason: 'This address has received Marscoin before.' } }),
    );
    expect(no).toMatchObject({ outcome: 'not_eligible', reason: 'This address has received Marscoin before.' });
    const offline = setup();
    offline.http.post.mockRejectedValue(new Error('Network Error'));
    expect(await fetchGrantOffer(offline)).toMatchObject({ outcome: 'failed', reason: expect.stringMatching(/Check your connection/) });
    const old = setup();
    old.replies[GRANT_API + '/grant/challenge'] = notFound();
    expect((await fetchGrantOffer(old)).outcome).toBe('unavailable');
  });

  it('marks a claim whose challenge ran out, so a new offer can be fetched', async () => {
    const f = setup({ claim: { status: 'expired', txid: null } });
    const result = await claimGrantOffer({ ...f, offer: await fetchGrantOffer(f) });
    expect(result).toMatchObject({ outcome: 'failed', expired: true });
    expect(result.reason).toMatch(/expired/);
    const fine = setup();
    expect((await claimGrantOffer({ ...fine, offer: await fetchGrantOffer(fine) })).expired).toBeUndefined();
  });
});
