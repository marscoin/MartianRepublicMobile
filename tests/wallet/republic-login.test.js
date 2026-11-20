import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import { Marscoin } from '../../blue_modules/constants';
import { MarsElectrumWallet } from '../../screen/wallets/mars-wallet';
import {
  LOGIN_MAX_AGE_S,
  parseRepublicLogin,
  republicLoginMessage,
  republicLoginUrl,
  secondsLeft,
  signRepublicLogin,
  submitRepublicLogin,
} from '../../blue_modules/republic-login';

// Isolate native storage and the network; keys, signatures and parsing are real.
jest.mock('../../class', () => ({ HDLegacyP2PKHWallet: class {} }));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({
  AbstractHDElectrumWallet: { defaultRBFSequence: 0xfffffffd },
}));
jest.mock('../../blue_modules/MARSConnection', () => ({ getTxHex: jest.fn(), getTransactionsByAddress: jest.fn() }));
jest.mock('../../class/rng', () => ({ randomBytes: async size => require('crypto').randomBytes(size) }));
jest.mock('../../loc', () => ({ wallets: { import_passphrase: 'Passphrase' } }));

// Public BIP39 test vector. Never use this mnemonic for funds.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const civicAddress = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';

// What the website's QR code holds (app/Livewire/QRLogin.php): sid = time_hex20, c = hex20_time, t = hex time.
const issued = 1795689600; // a time in November 2026
const sid = `${issued}_0123456789abcdef0123`;
const c = `fedcba9876543210fedc_${issued}`;
const code = `https://martianrepublic.org/api/marsauth?sid=${sid}&c=${c}&t=${issued.toString(16)}`;
const at = s => (issued + s) * 1000;

const civicWallet = () => {
  const wallet = new MarsElectrumWallet();
  wallet.setSecret(mnemonic);
  return wallet;
};

describe('Signing in on martianrepublic.org with the phone', () => {
  it('reads the website code and signs one fixed message naming the site, the session, the challenge and the time', () => {
    const login = parseRepublicLogin(code);
    expect(login).toEqual({ sid, challenge: c, t: issued.toString(16), issuedAt: issued });
    expect(republicLoginMessage(login)).toBe(
      `Martian Republic login\ndomain: martianrepublic.org\nsid: ${sid}\nchallenge: ${c}\nissued: ${issued.toString(16)}`,
    );
    const body = signRepublicLogin(civicWallet(), login);
    expect(Object.keys(body).sort()).toEqual(['addr', 'msg', 'pubk', 'sig']);
    expect(body.addr).toBe(civicAddress);
    expect(body.msg).toBe(republicLoginMessage(login));
    expect(bitcoinMessage.verify(body.msg, civicAddress, body.sig)).toBe(true);
    // the public key is the civic address's own, and nothing secret is in the request
    expect(bitcoin.payments.p2pkh({ pubkey: Buffer.from(body.pubk, 'hex'), network: Marscoin.mainnet }).address).toBe(civicAddress);
    expect(JSON.stringify(body)).not.toMatch(new RegExp(civicWallet()._getExternalWIFByIndex(0)));
  });

  it.each([
    ['plain http', code.replace('https:', 'http:')],
    ['a look-alike host', code.replace('martianrepublic.org', 'martianrepub1ic.org')],
    ['a subdomain of another site', code.replace('martianrepublic.org', 'martianrepublic.org.evil.example')],
    ['a user part', code.replace('https://', 'https://martianrepublic.org@')],
    ['a port', code.replace('.org/', '.org:8443/')],
    ['another path', code.replace('/api/marsauth', '/api/token')],
    ['a line break smuggled into the message', code.replace(`c=${c}`, `c=${c}%0Adomain%3A%20evil.example`)],
    ['a repeated parameter', `${code}&sid=1795689600_ffffffffffffffffffff`],
    ['a missing challenge', code.replace(`&c=${c}`, '')],
    ['a time that is not hex', code.replace(/t=[0-9a-f]+$/, 't=yesterday')],
    ['an address, not a code', civicAddress],
  ])('ignores %s', (_, text) => {
    expect(parseRepublicLogin(text)).toBeNull();
  });

  it('only signs while the code is fresh, as the website does (600 seconds)', () => {
    const login = parseRepublicLogin(code);
    expect(secondsLeft(login, at(0))).toBe(LOGIN_MAX_AGE_S);
    expect(secondsLeft(login, at(LOGIN_MAX_AGE_S - 1))).toBe(1);
    expect(secondsLeft(login, at(LOGIN_MAX_AGE_S))).toBe(0);
    expect(secondsLeft(login, at(-60))).toBeGreaterThan(0); // the phone's clock a minute behind
    expect(secondsLeft(login, at(-600))).toBe(0); // a code from the future is not trusted
  });

  it('sends the request to the rebuilt website address and reports what the website answered', async () => {
    const login = parseRepublicLogin(code);
    const post = jest.fn(async () => ({ status: 200 }));
    expect(await submitRepublicLogin({ wallet: civicWallet(), login, post, now: at(5) })).toEqual({ outcome: 'signed_in' });
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe(republicLoginUrl(login));
    expect(url).toBe(code);
    expect(body.msg).toBe(republicLoginMessage(login));
    expect(config.timeout).toBeGreaterThan(0);

    const answer = status => jest.fn(async () => Promise.reject(Object.assign(new Error('http'), { response: { status } })));
    expect(await submitRepublicLogin({ wallet: civicWallet(), login, post: answer(404), now: at(5) })).toEqual({ outcome: 'expired' });
    expect(await submitRepublicLogin({ wallet: civicWallet(), login, post: answer(406), now: at(5) })).toEqual({ outcome: 'refused' });
    expect(await submitRepublicLogin({ wallet: civicWallet(), login, post: answer(429), now: at(5) })).toEqual({ outcome: 'busy' });
    const offline = jest.fn(async () => Promise.reject(new Error('offline')));
    expect(await submitRepublicLogin({ wallet: civicWallet(), login, post: offline, now: at(5) })).toEqual({ outcome: 'failed' });
    // an old code is not signed or sent at all
    const late = jest.fn();
    expect(await submitRepublicLogin({ wallet: civicWallet(), login, post: late, now: at(700) })).toEqual({ outcome: 'expired' });
    expect(late).not.toHaveBeenCalled();
  });
});
