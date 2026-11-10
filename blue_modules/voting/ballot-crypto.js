// Layered ("onion") encryption for the ballot shuffle, wire-compatible with
// the Republic's web voting page: an RSA-1024 PKCS#1 v1.5 wrapped message key
// (always 172 base64 characters) followed by an OpenSSL-format AES-256-CBC
// passphrase ciphertext, as produced by JSEncrypt and CryptoJS there.
//
// All randomness comes from the supplied generator, never from Math.random or
// a library default, so key generation and padding are as strong as its seed.
import CryptoJS from 'crypto-js';
import forge from 'node-forge';
import * as bitcoin from 'bitcoinjs-lib';

const RSA_BITS = 1024;
const WRAPPED_KEY_LENGTH = 172;

// Deterministic generator expanded from a secret seed: SHA-256 in counter mode.
export function createGenerator(seed) {
  if (!Buffer.isBuffer(seed) || seed.length < 32) throw new Error('At least 32 bytes of entropy are required.');
  let counter = 0;
  let pool = Buffer.alloc(0);
  const bytes = length => {
    while (pool.length < length) {
      const index = Buffer.alloc(8);
      index.writeUInt32BE(counter++, 4);
      pool = Buffer.concat([pool, bitcoin.crypto.sha256(Buffer.concat([seed, index]))]);
    }
    const out = pool.slice(0, length);
    pool = pool.slice(length);
    return Buffer.from(out);
  };
  return {
    bytes,
    // Uniform integer in [0, limit) by rejection sampling.
    below(limit) {
      if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 0x100000000) throw new Error('Invalid range.');
      const ceiling = Math.floor(0x100000000 / limit) * limit;
      for (;;) {
        const value = bytes(4).readUInt32BE(0);
        if (value < ceiling) return value % limit;
      }
    },
  };
}

const binary = buffer => buffer.toString('binary');

// An ephemeral keypair for one shuffle round. `publicKey` is the base64 DER
// SubjectPublicKeyInfo string the ballot server relays to the other voters.
export function generateShuffleKeypair(generator) {
  const pair = forge.pki.rsa.generateKeyPair({
    bits: RSA_BITS,
    e: 0x10001,
    prng: { getBytesSync: length => binary(generator.bytes(length)) },
  });
  const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(pair.publicKey)).getBytes();
  return { publicKey: Buffer.from(der, 'binary').toString('base64'), privateKey: pair.privateKey };
}

function parsePublicKey(base64) {
  const der = Buffer.from(String(base64).replace(/\s/g, ''), 'base64');
  const key = forge.pki.publicKeyFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(binary(der))));
  // Small or malformed keys from a peer would expose what we encrypt to them.
  // The website's key generator yields a 1023-bit modulus about four times in
  // ten; any modulus that fills 128 bytes is a normal key for this protocol.
  if (key.n.bitLength() <= RSA_BITS - 8 || key.n.bitLength() > RSA_BITS || key.e.intValue() < 3) {
    throw new Error('A voter supplied an unusable encryption key.');
  }
  return key;
}

// PKCS#1 v1.5 type 2 padding with our own random bytes, then raw RSA.
function wrapKey(publicKey, message, generator) {
  const size = Math.ceil(publicKey.n.bitLength() / 8);
  const padding = Buffer.alloc(size - message.length - 3);
  for (let i = 0; i < padding.length; i++) {
    do {
      padding[i] = generator.bytes(1)[0];
    } while (padding[i] === 0);
  }
  const block = Buffer.concat([Buffer.from([0, 2]), padding, Buffer.from([0]), message]);
  return Buffer.from(publicKey.encrypt(binary(block), 'RAW'), 'binary').toString('base64');
}

export function encryptFor(publicKeyBase64, message, generator) {
  const publicKey = parsePublicKey(publicKeyBase64);
  // A fresh 256-bit passphrase per message, in the 44-character base64 form
  // the web client uses.
  const messageKey = generator.bytes(32).toString('base64');
  const wrapped = wrapKey(publicKey, Buffer.from(messageKey, 'utf8'), generator);
  if (wrapped.length !== WRAPPED_KEY_LENGTH) throw new Error('Unsupported voter key size.');
  const ciphertext = CryptoJS.AES.encrypt(message, messageKey, {
    salt: CryptoJS.enc.Hex.parse(generator.bytes(8).toString('hex')),
  }).toString();
  return wrapped + ciphertext;
}

export function decryptWith(privateKey, text) {
  if (typeof text !== 'string' || text.length <= WRAPPED_KEY_LENGTH) throw new Error('A shuffle message could not be decrypted.');
  try {
    const wrapped = Buffer.from(text.slice(0, WRAPPED_KEY_LENGTH), 'base64');
    const messageKey = privateKey.decrypt(binary(wrapped), 'RSAES-PKCS1-V1_5');
    const clear = CryptoJS.AES.decrypt(text.slice(WRAPPED_KEY_LENGTH), messageKey).toString(CryptoJS.enc.Utf8);
    if (!clear) throw new Error('empty');
    return clear;
  } catch {
    throw new Error('A shuffle message could not be decrypted.');
  }
}

// Wrap our destination once for every voter after us, innermost layer for the
// last voter, so each removes exactly one layer as the list passes along.
export function onionEncrypt(target, order, index, generator) {
  let text = target;
  for (let i = order.length - 1; i > index; i--) text = encryptFor(order[i], text, generator);
  return text;
}

// Fisher-Yates with unbiased draws.
export function shuffled(items, generator) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = generator.below(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
