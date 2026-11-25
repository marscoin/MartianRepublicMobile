// Remembers that someone chose to use the app as a wallet only, so the home
// screen puts the newcomer's path away until they ask for it back. Kept per
// civic address: a different wallet on the same phone starts with the path.
// A small preference, not a secret, so it lives in ordinary app storage.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PATH_PREFERENCE_KEY = 'org.martianrepublic.path.v1';

const read = async () => {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(PATH_PREFERENCE_KEY));
    return saved && typeof saved === 'object' && saved.walletOnly && typeof saved.walletOnly === 'object' ? saved.walletOnly : {};
  } catch {
    return {};
  }
};

// Never throws: without an answer the path is simply shown.
export async function readWalletOnly(address) {
  if (!address) return false;
  return (await read())[address] === true;
}

// Resolves true when the choice was saved.
export async function saveWalletOnly(address, walletOnly) {
  if (!address) return false;
  try {
    const all = await read();
    if (walletOnly) all[address] = true;
    else delete all[address];
    await AsyncStorage.setItem(PATH_PREFERENCE_KEY, JSON.stringify({ walletOnly: all }));
    return true;
  } catch {
    return false;
  }
}
