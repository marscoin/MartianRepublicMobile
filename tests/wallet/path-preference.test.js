// The "just use the wallet" choice, kept in ordinary app storage per civic address.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PATH_PREFERENCE_KEY, readWalletOnly, saveWalletOnly } from '../../blue_modules/path-preference';

jest.mock('@react-native-async-storage/async-storage', () => {
  const data = {};
  return {
    __esModule: true,
    default: {
      data,
      getItem: jest.fn(async key => (key in data ? data[key] : null)),
      setItem: jest.fn(async (key, value) => {
        data[key] = value;
      }),
    },
  };
});

const first = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
const second = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR';

beforeEach(() => {
  for (const key of Object.keys(AsyncStorage.data)) delete AsyncStorage.data[key];
});

describe('Remembering the wallet-only choice', () => {
  it('starts with the path shown', async () => {
    expect(await readWalletOnly(first)).toBe(false);
    expect(await readWalletOnly(null)).toBe(false);
  });

  it('remembers the choice for that civic address only, and forgets it when the path is asked back', async () => {
    expect(await saveWalletOnly(first, true)).toBe(true);
    expect(await readWalletOnly(first)).toBe(true);
    expect(await readWalletOnly(second)).toBe(false);
    expect(JSON.parse(AsyncStorage.data[PATH_PREFERENCE_KEY])).toEqual({ walletOnly: { [first]: true } });

    await saveWalletOnly(second, true);
    await saveWalletOnly(first, false);
    expect(await readWalletOnly(first)).toBe(false);
    expect(await readWalletOnly(second)).toBe(true);
    expect(JSON.parse(AsyncStorage.data[PATH_PREFERENCE_KEY])).toEqual({ walletOnly: { [second]: true } });
  });

  it('shows the path rather than fail when storage is unreadable or broken', async () => {
    AsyncStorage.data[PATH_PREFERENCE_KEY] = 'not json';
    expect(await readWalletOnly(first)).toBe(false);
    AsyncStorage.data[PATH_PREFERENCE_KEY] = JSON.stringify({ walletOnly: 'yes' });
    expect(await readWalletOnly(first)).toBe(false);
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('storage offline'));
    expect(await readWalletOnly(first)).toBe(false);
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
    expect(await saveWalletOnly(first, true)).toBe(false);
    expect(await saveWalletOnly(null, true)).toBe(false);
  });
});
