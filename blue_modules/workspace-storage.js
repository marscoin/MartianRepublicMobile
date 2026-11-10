import CryptoJS from 'crypto-js';

const PREFIX = 'org.martianrepublic.workspace.';
const failure = () =>
  new Error('Saved workspace data could not be read. Keep this app installed and try again when the phone is unlocked.');

function equalMAC(first, second) {
  if (typeof first !== 'string' || first.length !== second.length) return false;
  let difference = 0;
  // Compare every MAC byte without an early mismatch return.
  // eslint-disable-next-line no-bitwise
  for (let i = 0; i < second.length; i++) difference |= first.charCodeAt(i) ^ second.charCodeAt(i);
  return difference === 0;
}

// Encrypt-then-MAC. The random encryption and authentication keys live only in
// Keychain/Keystore; AsyncStorage contains authenticated ciphertext, including
// drafts, request IDs and the last downloaded workspace snapshot.
export function createWorkspaceStorage({ values, keys, randomBytes }) {
  async function key(address, existing) {
    let secret = await keys.read(address);
    if (!secret) {
      if (existing) throw failure();
      secret = randomBytes(64).toString('hex');
      await keys.write(address, secret);
    }
    if (!/^[a-f0-9]{128}$/.test(secret)) throw failure();
    return {
      encryption: CryptoJS.enc.Hex.parse(secret.slice(0, 64)),
      authentication: CryptoJS.enc.Hex.parse(secret.slice(64)),
    };
  }
  return {
    async read(address) {
      const raw = await values.getItem(PREFIX + address);
      if (!raw) return null;
      const secret = await key(address, true);
      try {
        const envelope = JSON.parse(raw);
        if (envelope.version !== 1 || !/^[a-f0-9]{32}$/.test(envelope.iv) || typeof envelope.ciphertext !== 'string') throw failure();
        const signed = `1|${address}|${envelope.iv}|${envelope.ciphertext}`;
        const mac = CryptoJS.HmacSHA256(signed, secret.authentication).toString();
        if (!equalMAC(envelope.mac, mac)) throw failure();
        const clear = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(envelope.ciphertext) }, secret.encryption, {
          iv: CryptoJS.enc.Hex.parse(envelope.iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }).toString(CryptoJS.enc.Utf8);
        const result = JSON.parse(clear);
        if (result.version !== 1 || !result.drafts || !result.pending || !result.cache) throw failure();
        return result;
      } catch {
        throw failure();
      }
    },
    async write(address, value) {
      const existing = await values.getItem(PREFIX + address);
      const secret = await key(address, !!existing);
      const iv = randomBytes(16).toString('hex');
      const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(value), secret.encryption, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }).ciphertext.toString(CryptoJS.enc.Base64);
      const mac = CryptoJS.HmacSHA256(`1|${address}|${iv}|${ciphertext}`, secret.authentication).toString();
      await values.setItem(PREFIX + address, JSON.stringify({ version: 1, iv, ciphertext, mac }));
    },
  };
}
