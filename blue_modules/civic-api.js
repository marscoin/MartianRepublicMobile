import axios from 'axios';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { createCivicAuthRequest } from './civic-auth';
import { createCivicSessionManager } from './civic-session-manager';

const options = address => ({
  service: `org.martianrepublic.civic-session.${address}`,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
const sessions = createCivicSessionManager({
  storage: {
    async read(address) {
      const credentials = await Keychain.getGenericPassword(options(address));
      return credentials && credentials.username === address ? credentials.password : null;
    },
    async write(address, token) {
      const saved = await Keychain.setGenericPassword(address, token, options(address));
      if (!saved) throw new Error('Unable to save the civic session.');
    },
    async remove(address) {
      await Keychain.resetGenericPassword(options(address));
    },
  },
  async authenticate(wallet) {
    const response = await axios.post('https://martianrepublic.org/api/token', createCivicAuthRequest(wallet), { timeout: 15000 });
    return response.data;
  },
});

export const getCivicToken = sessions.getToken;
export const getCivicSession = sessions.getSnapshot;
export const useCivicSession = () => useSyncExternalStore(sessions.subscribe, sessions.getSnapshot, sessions.getSnapshot);

let configuration = 0;
export async function configureCivicWallet(wallet) {
  const current = ++configuration;
  sessions.configure(wallet);
  // Unbound tokens from older builds must not be assigned to another identity.
  await AsyncStorage.multiRemove(['@auth_token', 'civicMnemonic']);
  if (current !== configuration) return;
  if (!wallet) {
    await AsyncStorage.removeItem('civicAddress');
    return;
  }
  await AsyncStorage.setItem('civicAddress', wallet._getExternalAddressByIndex(0));
  return getCivicToken();
}

axios.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    if (error.response?.status === 401 && /^https:\/\/martianrepublic\.org\/api\//.test(config?.url || '')) {
      const authorization = config.headers?.Authorization || config.headers?.authorization;
      if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
        await sessions.invalidate(authorization.slice(7)).catch(() => {});
      }
    }
    return Promise.reject(error);
  },
);
