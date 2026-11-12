// After a wallet is restored from its recovery words, the check for older
// funds starts in the background. It must never hold up the restore.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { importText: 'the words', askPassphrase: false } }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-idle-timer', () => ({ setIdleTimerDisabled: jest.fn() }));
jest.mock('../../helpers/prompt', () => jest.fn());
jest.mock('../../hooks/usePrivacy', () => () => ({ enableBlur: jest.fn(), disableBlur: jest.fn() }));
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});
let mockImport;
jest.mock('../../class/mars-wallet-import', () => () => ({ promise: mockImport(), stop: jest.fn() }));
const mockOffer = jest.fn();
jest.mock('../../blue_modules/older-funds-flow', () => ({ offerOlderFundsAfterRestore: (...args) => mockOffer(...args) }));

const { BlueStorageContext } = require('../../blue_modules/storage-context');
const MarsWalletRecovery = require('../../components/MarsWalletRecovery').default;

const restored = { type: 'marscoin', getID: () => 'restored' };

async function restore({ civic = false, save }) {
  const context = { addAndSaveWallet: jest.fn(save), addAndSaveCivicWallet: jest.fn(save) };
  let tree;
  await act(async () => {
    tree = TestRenderer.create(
      <BlueStorageContext.Provider value={context}>
        <MarsWalletRecovery civic={civic} />
      </BlueStorageContext.Provider>,
    );
  });
  await act(async () => {});
  await act(async () => tree.unmount());
  return context;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockImport = async () => ({ cancelled: false, wallets: [restored] });
  // A check that never finishes: the restore must not be waiting for it.
  mockOffer.mockImplementation(() => new Promise(() => {}));
});

it.each([[false], [true]])('starts the check once the wallet is saved and the app has moved on (civic: %p)', async civic => {
  const context = await restore({ civic, save: async () => true });
  expect((civic ? context.addAndSaveCivicWallet : context.addAndSaveWallet).mock.calls).toEqual([[restored]]);
  expect(mockNavigation.navigate).toHaveBeenCalledWith('BottomTabs');
  expect(mockOffer).toHaveBeenCalledTimes(1);
  expect(mockOffer).toHaveBeenCalledWith(restored);
  expect(mockNavigation.navigate.mock.invocationCallOrder[0]).toBeLessThan(mockOffer.mock.invocationCallOrder[0]);
});

it('does not check a wallet that was not saved', async () => {
  await restore({ save: async () => false }); // already on this device
  expect(mockOffer).not.toHaveBeenCalled();
  await restore({
    save: async () => {
      throw new Error('disk full');
    },
  });
  expect(mockOffer).not.toHaveBeenCalled();
});

it('does not check when the restore itself failed', async () => {
  mockImport = async () => {
    throw new Error('Connection reset');
  };
  const context = await restore({ save: async () => true });
  expect(context.addAndSaveWallet).not.toHaveBeenCalled();
  expect(mockOffer).not.toHaveBeenCalled();
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
});
