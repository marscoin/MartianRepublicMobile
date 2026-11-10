import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { randomBytes } from 'crypto';
import { getCivicSession, getCivicToken } from './civic-api';
import { createWorkspaceStorage } from './workspace-storage';
import { createWorkspaceStore } from './workspace-store';

export const WORKSPACE_ORIGIN = 'https://martianrepublic.org';
const keyOptions = address => ({
  service: `org.martianrepublic.workspace-key.${address}`,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});

export function workspaceID() {
  const bytes = randomBytes(16);
  // RFC 4122 version and variant bits.
  // eslint-disable-next-line no-bitwise
  bytes[6] = (bytes[6] & 15) | 64;
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertWorkspaceIdentity(address) {
  if (!address || getCivicSession().address !== address) {
    throw new Error('Your civic identity changed. Open this workspace again.');
  }
}

export async function workspaceRequest(address, { path, method = 'GET', data, multipart = false }) {
  assertWorkspaceIdentity(address);
  if (!/^\/(?:workspace|organizations)(?:[/?]|$)/.test(path) || path.includes('..') || /[%\\:#]/.test(path)) {
    throw new Error('Invalid workspace address.');
  }
  const token = await getCivicToken();
  assertWorkspaceIdentity(address);
  try {
    const response = await axios.request({
      url: `${WORKSPACE_ORIGIN}/api${path}`,
      method,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(multipart ? { 'Content-Type': 'multipart/form-data' } : {}),
      },
      timeout: multipart ? 90000 : 20000,
    });
    assertWorkspaceIdentity(address);
    if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data))
      throw new Error('The workspace returned an invalid response.');
    return response.data;
  } catch (cause) {
    // Axios errors contain the bearer token. Expose only a small, sanitized
    // application error to UI and durable request state.
    const status = cause.response?.status;
    const body = cause.response?.data;
    const message = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : null;
    const error = new Error(
      message?.slice(0, 400) ||
        (status === 401
          ? 'Reconnect your civic identity and retry this saved change.'
          : status === 403 || status === 404
            ? 'This workspace is not available to this civic identity.'
            : 'Could not reach the Republic. Your saved work is still on this phone.'),
    );
    error.status = status || 0;
    if (body?.code === 'version_conflict' && body.task?.id) {
      error.code = 'version_conflict';
      error.task = body.task;
    }
    const organization = path.match(/^\/organizations\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];
    if (organization && [403, 404].includes(status)) await workspaceStore.forgetOrganizationCache(address, organization).catch(() => {});
    throw error;
  }
}

const storage = createWorkspaceStorage({
  values: AsyncStorage,
  keys: {
    async read(address) {
      const result = await Keychain.getGenericPassword(keyOptions(address));
      if (result && result.username !== address) throw new Error('The saved workspace key belongs to another identity.');
      return result ? result.password : null;
    },
    async write(address, secret) {
      if (!(await Keychain.setGenericPassword(address, secret, keyOptions(address))))
        throw new Error('This phone could not protect your workspace drafts.');
    },
  },
  randomBytes,
});
export const workspaceStore = createWorkspaceStore({
  storage,
  request: workspaceRequest,
  randomID: workspaceID,
});
