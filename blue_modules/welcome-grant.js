// The welcome grant: a small one-time amount the Republic sends to a
// newcomer's civic address so the first publication fee is covered. The server
// asks the newcomer to prove ownership of the civic key by signing a short
// message. Everything the module talks to is passed in, so it can be tested
// without a network or a device.
import { signCivicMessage } from './civic-auth';

export const GRANT_API = 'https://martianrepublic.org/api';

const REQUEST_TIMEOUT = 15000;
const REASONS = {
  unavailable: 'The welcome gift is not available right now.',
  not_eligible: 'This civic address cannot receive a welcome gift.',
  already: 'A welcome gift was already sent to this civic address.',
  failed: 'The welcome gift could not be requested. Check your connection and try again.',
  mismatch: 'The server asked for an unexpected signature, so nothing was signed.',
  invalid_signature: 'The server did not accept the proof of your civic key.',
  expired: 'The request took too long and expired. Try again.',
};

// The only text the civic key will ever sign for a grant.
export const grantMessage = (address, nonce) => `Martian Republic welcome grant\naddress: ${address}\nnonce: ${nonce}`;

const result = (outcome, { txid, amount, reason } = {}) => ({
  outcome,
  txid: typeof txid === 'string' && /^[0-9a-f]{64}$/i.test(txid) ? txid.toLowerCase() : null,
  amountZubrins: Number.isSafeInteger(amount) && amount > 0 ? amount : null,
  reason: reason || REASONS[outcome] || null,
});

// The server's own explanation is shown only when it is short, plain text.
const said = (text, fallback) => (typeof text === 'string' && text.trim() && text.length <= 200 ? text.trim() : fallback);

function within(promise, ms) {
  let timer;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('The request timed out.')), ms);
  });
  return Promise.race([Promise.resolve(promise), limit]).finally(() => clearTimeout(timer));
}

// A missing route (an older server) is the same to the newcomer as the
// feature being switched off. Anything else is a failure worth retrying.
const fromError = error => (error?.response?.status === 404 ? result('unavailable') : result('failed'));

// Never sign text merely because the server supplied it. The address must be
// this wallet's civic address and the message exactly the expected one.
const asExpected = (challenge, address) =>
  !!challenge &&
  challenge.address === address &&
  typeof challenge.nonce === 'string' &&
  /^[\x21-\x7e]{1,256}$/.test(challenge.nonce) &&
  challenge.message === grantMessage(address, challenge.nonce);

const session = async (getToken, timeout) => {
  const token = await within(getToken(), timeout);
  return typeof token === 'string' && token ? { headers: { Authorization: `Bearer ${token}` }, timeout } : null;
};

// Step one: ask whether a grant is on offer. This only asks. Nothing is signed
// and no coins move until the offer is claimed, so it is safe to call before
// the newcomer has agreed to anything.
//
// Outcomes: 'available' (with the `challenge` to claim it), 'already',
// 'unavailable', 'not_eligible', 'failed'.
export async function fetchGrantOffer({ wallet, http, getToken, baseURL = GRANT_API, timeout = REQUEST_TIMEOUT } = {}) {
  let address;
  try {
    if (!wallet?.civic) return result('failed', { reason: 'Restore your civic wallet first.' });
    address = wallet._getExternalAddressByIndex(0);
  } catch {
    return result('failed');
  }

  let challenge;
  try {
    const config = await session(getToken, timeout);
    if (!config) return result('failed');
    challenge = (await within(http.post(`${baseURL}/grant/challenge`, {}, config), timeout + 1000))?.data;
  } catch (error) {
    return fromError(error);
  }
  if (!challenge || typeof challenge !== 'object') return result('failed');

  const offered = { txid: challenge.txid, amount: challenge.amount_zubrins };
  if (challenge.status === 'already_granted') return result('already', offered);
  if (challenge.status === 'unavailable') return result('unavailable');
  if (challenge.status === 'not_eligible') return result('not_eligible', { reason: said(challenge.reason, REASONS.not_eligible) });
  if (challenge.status !== 'available' || challenge.eligible !== true) return result('failed');
  // An offer that could not be claimed safely is not shown as one.
  if (!asExpected(challenge, address)) return result('failed', { reason: REASONS.mismatch });
  return {
    ...result('available', { amount: challenge.amount_zubrins }),
    challenge: { address, nonce: challenge.nonce, message: challenge.message },
  };
}

// Step two, only after the newcomer accepts: prove ownership of the civic key
// and ask for the grant to be sent. The offer is checked again here, so this
// signs nothing but the exact expected message for this wallet's own address.
//
// Outcomes: 'sent', 'already', 'unavailable', 'not_eligible', 'failed'. A
// challenge that ran out while the offer was being read is 'failed' with
// `expired: true`; fetch a new offer and claim that.
export async function claimGrantOffer({
  wallet,
  offer,
  http,
  getToken,
  sign = signCivicMessage,
  baseURL = GRANT_API,
  timeout = REQUEST_TIMEOUT,
} = {}) {
  let address;
  try {
    if (!wallet?.civic) return result('failed', { reason: 'Restore your civic wallet first.' });
    address = wallet._getExternalAddressByIndex(0);
  } catch {
    return result('failed');
  }
  const challenge = offer?.challenge;
  if (offer?.outcome !== 'available' || !asExpected(challenge, address)) return result('failed', { reason: REASONS.mismatch });

  let claim;
  try {
    const config = await session(getToken, timeout);
    if (!config) return result('failed');
    const signature = await sign(wallet, challenge.message);
    if (typeof signature !== 'string' || !signature) return result('failed');
    claim = (await within(http.post(`${baseURL}/grant/claim`, { address, nonce: challenge.nonce, signature }, config), timeout + 1000))
      ?.data;
  } catch (error) {
    return fromError(error);
  }
  if (!claim || typeof claim !== 'object') return result('failed');

  const sent = { txid: claim.txid, amount: Number.isSafeInteger(claim.amount_zubrins) ? claim.amount_zubrins : offer.amountZubrins };
  switch (claim.status) {
    case 'sent':
      return result('sent', sent);
    case 'already_granted':
      return result('already', sent);
    case 'unavailable':
      return result('unavailable');
    case 'not_eligible':
      return result('not_eligible', { reason: said(claim.reason, REASONS.not_eligible) });
    case 'invalid_signature':
      return result('failed', { reason: REASONS.invalid_signature });
    case 'expired':
      return { ...result('failed', { reason: REASONS.expired }), expired: true };
    default:
      return result('failed');
  }
}

// Both steps at once, for a caller that already has the newcomer's consent.
export async function requestWelcomeGrant(options = {}) {
  const offer = await fetchGrantOffer(options);
  return offer.outcome === 'available' ? claimGrantOffer({ ...options, offer }) : offer;
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Watches the civic address until the grant can be spent. With a txid, only
// that coin counts; without one, any coin at the civic address does. A coin
// still waiting for its first block counts: the wallet spends those too.
// Resolves true when it is there, false when the wait ran out or was stopped.
export async function waitForGrant({
  wallet,
  txid = null,
  interval = 6000,
  timeout = 180000,
  sleep = pause,
  now = Date.now,
  shouldStop = () => false,
} = {}) {
  if (!wallet?.civic) return false;
  const address = wallet._getExternalAddressByIndex(0);
  const wanted = typeof txid === 'string' && txid ? txid.toLowerCase() : null;
  const deadline = now() + timeout;
  for (;;) {
    if (shouldStop()) return false;
    try {
      await within(
        (async () => {
          await wallet.fetchBalance();
          await wallet.fetchUtxo();
        })(),
        Math.max(interval, 20000),
      );
      const coins = wallet.getUtxo().filter(coin => coin.address === address && coin.value > 0);
      if (coins.some(coin => !wanted || String(coin.txid || coin.txId || '').toLowerCase() === wanted)) return true;
    } catch {
      /* Offline or a slow server. Look again on the next round. */
    }
    if (shouldStop() || now() + interval > deadline) return false;
    await sleep(interval);
  }
}
