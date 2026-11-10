import * as Keychain from 'react-native-keychain';

const options = address => ({
  service: `org.martianrepublic.citizenship-draft.${address}`,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
let writes = Promise.resolve();
export async function readCitizenshipDraft(address) {
  if (!address) return {};
  await writes;
  const saved = await Keychain.getGenericPassword(options(address));
  if (!saved || saved.username !== address) return {};
  try {
    return JSON.parse(saved.password);
  } catch {
    return {};
  }
}
export function saveCitizenshipDraft(address, changes) {
  if (!address) return Promise.reject(new Error('Restore your civic wallet before starting an application.'));
  const write = writes.then(async () => {
    const saved = await Keychain.getGenericPassword(options(address));
    let previous = {};
    if (saved && saved.username === address) {
      try {
        previous = JSON.parse(saved.password);
      } catch {
        /* Replace an unreadable draft. */
      }
    }
    const result = await Keychain.setGenericPassword(address, JSON.stringify({ ...previous, ...changes }), options(address));
    if (!result) throw new Error('Your application progress could not be saved. Please try again.');
  });
  writes = write.catch(() => {});
  return write;
}

export function ipfsURL(reference) {
  if (typeof reference !== 'string') throw new Error('The upload did not return a valid file reference.');
  const cid = reference
    .trim()
    .replace(/^https:\/\/[^/]+\/ipfs\//, '')
    .replace(/^ipfs:\/\//, '');
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid)) throw new Error('The upload did not return a valid IPFS reference.');
  return `https://ipfs.marscoin.org/ipfs/${cid}`;
}
