// The welcome grant: a small one-time amount the Republic sends to a
// newcomer's civic address so the first publication fee is covered. The server
// asks the newcomer to prove ownership of the civic key by signing a short
// message. Everything the module talks to is passed in, so it can be tested
// without a network or a device.
import { signCivicMessage } from './civic-auth';

export const GRANT_API = 'https://martianrepublic.org/api';

const REQUEST_TIMEOUT = 15000;
const REASONS = {
  unavailable: 'The welcome grant is not available right now.',
  not_eligible: 'This civic address cannot receive a welcome grant.',
  already: 'A welcome grant was already sent to this civic address.',
  failed: 'The welcome grant could not be requested. Check your connection and try again.',
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

export async function requestWelcomeGrant({
  wallet,
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

  let config;
  let challenge;
  try {
    const token = await within(getToken(), timeout);
    if (typeof token !== 'string' || !token) return result('failed');
    config = { headers: { Authorization: `Bearer ${token}` }, timeout };
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

  // Never sign text merely because the server supplied it. The address must be
  // this wallet's civic address and the message exactly the expected one.
  const { nonce } = challenge;
  if (
    challenge.address !== address ||
    typeof nonce !== 'string' ||
    !/^[\x21-\x7e]{1,256}$/.test(nonce) ||
    challenge.message !== grantMessage(address, nonce)
  ) {
    return result('failed', { reason: REASONS.mismatch });
  }

  let claim;
  try {
    const signature = await sign(wallet, challenge.message);
    if (typeof signature !== 'string' || !signature) return result('failed');
    claim = (await within(http.post(`${baseURL}/grant/claim`, { address, nonce, signature }, config), timeout + 1000))?.data;
  } catch (error) {
    return fromError(error);
  }
  if (!claim || typeof claim !== 'object') return result('failed');

  const sent = { txid: claim.txid, amount: Number.isSafeInteger(claim.amount_zubrins) ? claim.amount_zubrins : challenge.amount_zubrins };
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
      return result('failed', { reason: REASONS.expired });
    default:
      return result('failed');
  }
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
