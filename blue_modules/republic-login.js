import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from './constants';
import { signCivicMessage } from './civic-auth';

// Signing in on martianrepublic.org with the phone. The website shows a QR code
// with https://martianrepublic.org/api/marsauth?sid=…&c=…&t=…; the citizen scans
// it, confirms, and the civic key signs one fixed message that names the site,
// the browser session, its challenge and the time. A signature for anything else
// (a message signed elsewhere, another site's code) cannot open a session.

export const REPUBLIC_LOGIN_HOST = 'martianrepublic.org';
const LOGIN_PATH = '/api/marsauth';
// The website's session and challenge are letters, digits and underscores (time
// and random hex). Nothing else is accepted, so no value can add a line to the
// message that is signed.
const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;
const HEX_TIME = /^[0-9a-f]{1,12}$/i;
// The server accepts a code for 600 seconds; the app leaves time for the request.
export const LOGIN_MAX_AGE_S = 570;
const LOGIN_MAX_AHEAD_S = 120;

// Exactly https://martianrepublic.org/api/marsauth?… : no other scheme, host, port, user or path. Parsed by
// hand: React Native's URL and URLSearchParams do not implement hostname, pathname or get().
const LOGIN_URL = /^https:\/\/martianrepublic\.org\/api\/marsauth\?([^#\s]*)$/;

/** The login request in a scanned code, or null when it is not exactly the Martian Republic's. */
export function parseRepublicLogin(text) {
  if (typeof text !== 'string' || text.length > 512) return null;
  const m = LOGIN_URL.exec(text.trim());
  if (!m) return null;
  const params = {};
  for (const part of m[1].split('&')) {
    const at = part.indexOf('=');
    if (at <= 0) return null;
    let key, value;
    try {
      key = decodeURIComponent(part.slice(0, at));
      value = decodeURIComponent(part.slice(at + 1));
    } catch {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(params, key)) return null; // one value each, or none is trusted
    params[key] = value;
  }
  const { sid, c: challenge, t } = params;
  if (!TOKEN.test(sid || '') || !TOKEN.test(challenge || '') || !HEX_TIME.test(t || '')) return null;
  return { sid, challenge, t: t.toLowerCase(), issuedAt: parseInt(t, 16) };
}

/**
 * Where a scanned or pasted text should go when it is the website's sign-in code: the confirmation screen.
 * Null for anything else. Used by the Scan tab (the send screen's camera) and the home screen's scanner.
 */
export function republicLoginRoute(text) {
  if (!parseRepublicLogin(text)) return null;
  return ['RepublicLogin', { url: String(text).trim() }];
}

/** Seconds the code stays usable (0 when it has run out, or comes from the future). */
export function secondsLeft(login, now = Date.now()) {
  const nowS = Math.floor(now / 1000);
  if (!login || login.issuedAt - nowS > LOGIN_MAX_AHEAD_S) return 0;
  return Math.max(0, login.issuedAt + LOGIN_MAX_AGE_S - nowS);
}

/** The one message the civic key signs to log in. The website rebuilds it and compares. */
export function republicLoginMessage({ sid, challenge, t }) {
  return ['Martian Republic login', `domain: ${REPUBLIC_LOGIN_HOST}`, `sid: ${sid}`, `challenge: ${challenge}`, `issued: ${t}`].join('\n');
}

/** The address the URL is rebuilt to: never the scanned text itself. */
export function republicLoginUrl({ sid, challenge, t }) {
  const q = [
    ['sid', sid],
    ['c', challenge],
    ['t', t],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `https://${REPUBLIC_LOGIN_HOST}${LOGIN_PATH}?${q}`;
}

/** What is sent: the civic address, its public key, the message and its signature. Never a private key. */
export function signRepublicLogin(wallet, login) {
  const key = bitcoin.ECPair.fromWIF(wallet._getExternalWIFByIndex(0), Marscoin.mainnet);
  const addr = bitcoin.payments.p2pkh({ pubkey: key.publicKey, network: Marscoin.mainnet }).address;
  if (addr !== wallet._getExternalAddressByIndex(0)) throw new Error('The civic key does not match the civic address.');
  const msg = republicLoginMessage(login);
  return { addr, pubk: key.publicKey.toString('hex'), msg, sig: signCivicMessage(wallet, msg) };
}

const OUTCOMES = {
  200: 'signed_in',
  404: 'expired', // the challenge is gone: a newer code is on the screen, or it was used
  406: 'refused',
  408: 'expired',
  429: 'busy',
};

/**
 * Sign in: { outcome: 'signed_in' | 'expired' | 'refused' | 'busy' | 'failed' }.
 * `post(url, body, config)` is axios.post or a stand-in for tests.
 */
export async function submitRepublicLogin({ wallet, login, post, now = Date.now(), timeout = 15000 }) {
  if (secondsLeft(login, now) <= 0) return { outcome: 'expired' };
  const body = signRepublicLogin(wallet, login);
  try {
    const response = await post(republicLoginUrl(login), body, { timeout, headers: { 'Content-Type': 'application/json' } });
    return { outcome: OUTCOMES[response?.status] || 'failed' };
  } catch (error) {
    return { outcome: OUTCOMES[error?.response?.status] || 'failed' };
  }
}
