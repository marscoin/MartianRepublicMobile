// Renders the three screens of a payment (compose, review, sent) in their
// main states. The screens' own logic is real; the wallet, the network, the
// clipboard and navigation are stand-ins. Nothing here reaches a server and
// nothing is signed.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Linking } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../../blue_modules/constants';

const mockParent = { pop: jest.fn() };
const mockNav = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  pop: jest.fn(),
  popToTop: jest.fn(),
  addListener: jest.fn(() => () => {}),
  getParent: jest.fn(() => mockParent),
};
let mockRoute = { name: 'SendDetails', params: {} };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
  useIsFocused: () => true,
  useFocusEffect: callback => {
    const { useEffect } = require('react');
    useEffect(() => callback(), [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-linear-gradient', () => 'LinearGradient');
const mockStorage = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async key => (key in mockStorage ? mockStorage[key] : null)),
    setItem: jest.fn(async (key, value) => {
      mockStorage[key] = value;
    }),
  },
}));
jest.mock('../../blue_modules/currency', () => ({
  EXCHANGE_RATES_STORAGE_KEY: 'currency',
  btcToSatoshi: value => Math.round(Number(value) * 100000000),
}));
jest.mock('../../class', () => ({
  HDSegwitBech32Wallet: { type: 'HDsegwitBech32', defaultRBFSequence: 2147483648, finalRBFSequence: 4294967295 },
  MultisigHDWallet: { type: 'HDmultisig' },
  WatchOnlyWallet: { type: 'watchOnly' },
}));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({ AbstractHDElectrumWallet: class {} }));
jest.mock('../../class/deeplink-schema-match', () => ({ __esModule: true, default: {} }));
jest.mock('../../class/payjoin-transaction', () => ({ __esModule: true, default: class {} }));
jest.mock('payjoin-client', () => ({ PayjoinClient: class {} }));
const mockBiometric = { isBiometricUseCapableAndEnabled: jest.fn(async () => false), unlockWithBiometrics: jest.fn(async () => true) };
jest.mock('../../class/biometrics', () => ({ __esModule: true, default: mockBiometric }));
jest.mock('../../blue_modules/notifications', () => ({ majorTomToGroundControl: jest.fn() }));
jest.mock('../../blue_modules/MARSConnection', () => ({ ping: jest.fn(async () => true), waitTillConnected: jest.fn(async () => true) }));
jest.mock('../../blue_modules/app-review', () => ({ celebrate: jest.fn() }));
const mockRecommendedFees = jest.fn();
jest.mock('../../models/networkTransactionFees', () => {
  class NetworkTransactionFee {
    static StorageKey = 'NetworkTransactionFee';

    constructor(fastestFee = 2, mediumFee = 1, slowFee = 1) {
      this.fastestFee = fastestFee;
      this.mediumFee = mediumFee;
      this.slowFee = slowFee;
    }
  }
  return { __esModule: true, default: { recommendedFees: () => mockRecommendedFees() }, NetworkTransactionFee };
});
const mockLoadFreshCoins = jest.fn();
jest.mock('../../blue_modules/mars-coins', () => ({
  ...jest.requireActual('../../blue_modules/mars-coins'),
  loadFreshCoins: (...args) => mockLoadFreshCoins(...args),
}));
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});
jest.mock('../../components/TooltipMenu', () => () => null);
jest.mock(
  '../../components/BottomModal',
  () =>
    ({ isVisible, children }) =>
      isVisible ? children : null,
);
jest.mock('../../components/themes', () => ({ useTheme: () => ({ colors: {}, closeImage: 1 }) }));
const mockScan = jest.fn();
jest.mock('../../helpers/scan-qr', () => ({
  scanQrHelper: (...args) => mockScan(...args),
  requestCameraAuthorization: jest.fn(async () => true),
}));
const mockClipboardContent = jest.fn();
jest.mock('../../blue_modules/clipboard', () => () => ({ getClipboardContent: () => mockClipboardContent() }));
const mockHaptic = jest.fn();
jest.mock('../../blue_modules/hapticFeedback', () => ({
  __esModule: true,
  default: (...args) => mockHaptic(...args),
  HapticFeedbackTypes: {
    NotificationSuccess: 'notificationSuccess',
    NotificationWarning: 'notificationWarning',
    NotificationError: 'notificationError',
  },
}));
const mockAlert = jest.fn();
jest.mock('../../components/MarsDialog', () => ({ marsAlert: (...args) => mockAlert(...args) }));
const mockPresentAlert = jest.fn();
jest.mock('../../components/Alert', () => ({ __esModule: true, default: (...args) => mockPresentAlert(...args) }));
jest.mock('../../blue_modules/fs', () => ({ openSignedTransaction: jest.fn() }));
jest.mock('../../loc', () => ({
  __esModule: true,
  default: {
    _: { ok: 'OK', cancel: 'Cancel', close: 'Close', more: 'More', yes: 'Yes', no: 'No', of: '{number} of {total}' },
    errors: { error: 'Error', broadcast: 'Broadcast failed.' },
    wallets: { list_tryagain: 'Try again', select_wallet: 'Select Wallet' },
    cc: { header: 'Coin Control' },
    multisig: { co_sign_transaction: 'Sign a transaction', cosign_this_transaction: 'Co-sign this transaction?' },
    send: {
      header: 'Send',
      confirm_header: 'Confirm',
      create_details: 'Details',
      create_fee: 'Fee',
      success_done: 'Done',
      details_adv_full: 'Use Full Balance',
      details_adv_full_sure: 'Are you sure you want to use your wallet’s full balance for this transaction?',
      details_adv_full_sure_frozen: 'Frozen coins are excluded.',
      details_adv_fee_bump: 'Allow Fee Bump',
      details_adv_import: 'Import Transaction',
      details_adv_import_qr: 'Import Transaction (QR)',
      details_add_rec_add: 'Add Recipient',
      details_add_rec_rem: 'Remove Recipient',
      details_wallet_before_tx: 'Add a wallet first.',
      details_error_decode: 'Unable to decode the address.',
      psbt_sign: 'Sign a transaction',
    },
    formatString: (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]),
  },
  formatBalance: sats => `${sats / 100000000} MARS`,
  formatBalanceWithoutSuffix: sats => String(sats / 100000000),
}));

const { BlueStorageContext } = require('../../blue_modules/storage-context');
const { COINS_UNREACHABLE } = require('../../blue_modules/mars-coins');
const { NEXT_BLOCK_TEXT } = require('../../blue_modules/mars-fee-text');
const SendDetails = require('../../screen/send/details').default;
const QuickSendDetails = require('../../screen/send/detailsQuickSend').default;
const Confirm = require('../../screen/send/confirm').default;
const SuccessModule = require('../../screen/send/success');
const Success = SuccessModule.default;
const SuccessMark = require('../../components/send/SuccessMark').default;

const OWN = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
const OTHER = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR';
const BALANCE = 668426267450; // 6,684.2626745 MARS
const RATE = 0.060786211;
const TXID = 'ab'.repeat(32);

// A wallet that answers like a Marscoin wallet without holding any key. Its
// fee is 226 bytes at the asked rate, as for one coin in and two out.
function fakeWallet(overrides = {}) {
  const coins = [{ txid: 'cd'.repeat(32), vout: 0, value: BALANCE }];
  return {
    type: 'marscoin',
    chain: 'ONCHAIN',
    preferredBalanceUnit: 'MARS',
    getID: () => 'wallet-1',
    getLabel: () => 'CIVIC WALLET',
    getBalance: () => BALANCE,
    getPreferredBalanceUnit: () => 'MARS',
    getNetwork: () => 'MARS',
    allowSend: () => true,
    allowCosignPsbt: () => false,
    allowPayJoin: () => false,
    isHd: () => true,
    getAddress: () => OWN,
    getChangeAddressAsync: jest.fn(async () => OWN),
    getUtxo: () => coins,
    weOwnAddress: address => address === OWN,
    isAddressValid: address => {
      try {
        bitcoin.address.toOutputScript(address, Marscoin.mainnet);
        return true;
      } catch (_) {
        return false;
      }
    },
    coinselect: jest.fn((utxos, targets, feeRate) => {
      const fee = Math.round(feeRate * 226);
      const have = utxos.reduce((sum, coin) => sum + coin.value, 0);
      const want = targets.reduce((sum, target) => sum + (target.value || 0), 0);
      if (targets.every(target => target.value !== undefined) && want + fee > have) throw new Error('Not enough balance');
      return { fee };
    }),
    createTransaction: jest.fn(async (utxos, targets, feeRate) => ({
      tx: { getId: () => TXID, toHex: () => 'f00d' },
      outputs: targets.map(target => ({ address: target.address, value: target.value })),
      psbt: { fake: true },
      fee: Math.round(feeRate * 226),
    })),
    broadcastTx: jest.fn(async () => true),
    ...overrides,
  };
}

const trees = [];
async function render(element, context) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<BlueStorageContext.Provider value={context}>{element}</BlueStorageContext.Provider>, {
      createNodeMock: () => ({ measureInWindow: jest.fn() }),
    });
  });
  // Let the wallet, the fees, the exchange rate and the coins arrive.
  for (let i = 0; i < 4; i++) await act(async () => {});
  trees.push(tree);
  return tree;
}
function sendContext(wallet, extra = {}) {
  return {
    wallets: [wallet],
    setSelectedWalletID: jest.fn(),
    sleep: async () => {},
    txMetadata: {},
    saveToDisk: jest.fn(async () => {}),
    fetchAndSaveWalletTransactions: jest.fn(),
    isElectrumDisabled: false,
    ...extra,
  };
}
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
const byId = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type !== 'string');
const hostById = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type === 'string');
// The words inside one element, however deep, in reading order.
const wordsOf = node => (typeof node === 'string' ? node : node.children.map(wordsOf).join(''));
const words = (tree, testID) => wordsOf(hostById(tree, testID)[0]);
const tap = (tree, testID) =>
  act(async () => tree.root.findAll(node => node.props.testID === testID && node.props.onPress)[0].props.onPress());
const type = (tree, testID, value) =>
  act(async () => tree.root.findAll(node => node.props.testID === testID && node.props.onChangeText)[0].props.onChangeText(value));
const button = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && node.props.accessibilityState)[0];
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => {});
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  mockStorage.currency = JSON.stringify({ MARS_USD: RATE });
  mockRoute = { name: 'SendDetails', params: { isEditable: true } };
  mockRecommendedFees.mockResolvedValue({ fastestFee: 6, mediumFee: 3, slowFee: 1 });
  mockLoadFreshCoins.mockResolvedValue(undefined);
  mockClipboardContent.mockResolvedValue('');
  mockScan.mockReturnValue(new Promise(() => {}));
  mockNav.getParent.mockImplementation(() => mockParent);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

describe('Send', () => {
  const open = async (wallet = fakeWallet(), extra) => render(<SendDetails />, sendContext(wallet, extra));

  it('opens with the wallet and its balance, an empty amount, an invitation to paste or scan, and one honest fee', async () => {
    const tree = await open();
    const output = text(tree);
    expect(output).toContain('MCR / SEND');
    expect(output).toContain('Send Marscoin');
    expect(output).toContain('CIVIC WALLET');
    expect(words(tree, 'SendBalance')).toBe('6,684.2626745');
    expect(output).toContain('$406.31 available');
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('');
    expect(byId(tree, 'AddressInput')[0].props.value).toBe('');
    expect(output).toContain('Paste');
    expect(output).toContain('Scan');
    // One standard fee: the amount in MARS with its value, and what is true about timing.
    expect(words(tree, 'SendFeeValue')).toBe('0.00001356 MARS · under $0.01');
    expect(output).toContain(NEXT_BLOCK_TEXT);
    expect(output).toContain('Advanced');
    expect(output).not.toMatch(/Fast|Medium|Slow|~2m|~15m|~45m/);
    // The button says what is missing and cannot be pressed.
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Enter an amount');
    expect(button(tree, 'CreateTransactionButton').props.accessibilityState.disabled).toBe(true);
    expect(hostById(tree, 'RetryCoins')).toHaveLength(0);
    expect(hostById(tree, 'SendAddressInvalid')).toHaveLength(0);
  });

  it('uses the standard rate from the fee source by default', async () => {
    const wallet = fakeWallet();
    const tree = await open(wallet);
    await type(tree, 'MarsAmountInput', '10');
    await type(tree, 'AddressInput', OTHER);
    await settle();
    await tap(tree, 'CreateTransactionButton');
    await settle();
    expect(wallet.createTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.createTransaction.mock.calls[0][2]).toBe(6);
  });

  it('shows the amount in dollars with two decimals, the recipient as a card, and lets the payment be reviewed', async () => {
    const wallet = fakeWallet();
    const context = sendContext(wallet);
    const tree = await render(<SendDetails />, context);
    await type(tree, 'MarsAmountInput', '10');
    expect(words(tree, 'SendAmountNote')).toBe('≈ $0.61');
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Add a recipient');

    await type(tree, 'AddressInput', OTHER);
    await settle();
    expect(hostById(tree, 'SendRecipientCard')).toHaveLength(1);
    // The whole address is there, with its first and last characters set apart.
    const address = hostById(tree, 'SendRecipientAddress')[0];
    expect(wordsOf(address)).toBe(OTHER);
    expect(address.findAll(node => node.type === 'Text' && node.children.includes(OTHER.slice(0, 6)))).not.toHaveLength(0);
    expect(address.findAll(node => node.type === 'Text' && node.children.includes(OTHER.slice(-6)))).not.toHaveLength(0);
    expect(hostById(tree, 'SendRecipientOwn')).toHaveLength(0);
    expect(byId(tree, 'AddressInput')).toHaveLength(0);

    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Review payment');
    expect(button(tree, 'CreateTransactionButton').props.accessibilityState.disabled).toBe(false);
    await tap(tree, 'CreateTransactionButton');
    await settle();
    expect(mockLoadFreshCoins).toHaveBeenCalled();
    expect(mockNav.navigate).toHaveBeenCalledWith(
      'Confirm',
      expect.objectContaining({
        fee: 0.00001356,
        walletID: 'wallet-1',
        tx: 'f00d',
        satoshiPerByte: 6,
        recipients: [{ address: OTHER, value: 1000000000 }],
        marsRate: RATE,
        memo: '',
      }),
    );
    expect(context.txMetadata[TXID]).toEqual({ txhex: 'f00d', memo: '' });
  });

  it('removes the recipient again when asked', async () => {
    const tree = await open();
    await type(tree, 'AddressInput', OTHER);
    await tap(tree, 'SendRecipientClear');
    expect(hostById(tree, 'SendRecipientCard')).toHaveLength(0);
    expect(byId(tree, 'AddressInput')[0].props.value).toBe('');
  });

  it('says so when the address is one of the wallet’s own, from what the phone already knows', async () => {
    const tree = await open();
    await type(tree, 'AddressInput', OWN);
    expect(words(tree, 'SendRecipientOwn')).toBe('One of your own addresses · CIVIC WALLET');
  });

  it('explains an address that is not valid and keeps the button shut', async () => {
    const tree = await open();
    await type(tree, 'MarsAmountInput', '10');
    await type(tree, 'AddressInput', 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU2');
    expect(words(tree, 'SendAddressInvalid')).toBe('This is not a valid Marscoin address. Check it, or paste or scan it again.');
    expect(hostById(tree, 'SendRecipientCard')).toHaveLength(0);
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Check the address');
    expect(button(tree, 'CreateTransactionButton').props.accessibilityState.disabled).toBe(true);
  });

  it('does not complain while an address is still being typed', async () => {
    const tree = await open();
    const input = () => byId(tree, 'AddressInput')[0];
    await act(async () => input().props.onFocus());
    await type(tree, 'AddressInput', 'MHBba2');
    expect(hostById(tree, 'SendAddressInvalid')).toHaveLength(0);
    await act(async () => input().props.onBlur());
    expect(hostById(tree, 'SendAddressInvalid')).toHaveLength(1);
  });

  it('says when the amount is more than the balance', async () => {
    const tree = await open();
    await type(tree, 'AddressInput', OTHER);
    await type(tree, 'MarsAmountInput', '7000');
    await settle();
    expect(words(tree, 'SendAmountNote')).toBe('More than your balance');
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('More than your balance');
    expect(button(tree, 'CreateTransactionButton').props.accessibilityState.disabled).toBe(true);
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('refuses letters and a second decimal point in the amount, and drops a zero in front', async () => {
    const tree = await open();
    await type(tree, 'MarsAmountInput', '1x');
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('');
    await type(tree, 'MarsAmountInput', '010');
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('10');
    await type(tree, 'MarsAmountInput', '10.5.1');
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('10');
    await type(tree, 'MarsAmountInput', '0,5');
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('0.5');
  });

  it('says plainly when the coins could not be loaded, shows the rate instead of a made-up fee, and retries', async () => {
    mockLoadFreshCoins.mockRejectedValue(Object.assign(new Error(COINS_UNREACHABLE), { detail: 'The network took too long to answer.' }));
    const tree = await open();
    expect(hostById(tree, 'RetryCoins')).toHaveLength(1);
    const notice = words(tree, 'RetryCoins');
    expect(notice).toContain(COINS_UNREACHABLE);
    expect(notice).toContain('The network took too long to answer.');
    expect(notice).toContain('Try again');
    expect(words(tree, 'SendFeeValue')).toBe('6 zubrins/byte');

    mockLoadFreshCoins.mockResolvedValue(undefined);
    const before = mockLoadFreshCoins.mock.calls.length;
    await tap(tree, 'RetryCoins');
    await settle();
    expect(mockLoadFreshCoins.mock.calls.length).toBe(before + 1);
    expect(hostById(tree, 'RetryCoins')).toHaveLength(0);
    expect(words(tree, 'SendFeeValue')).toBe('0.00001356 MARS · under $0.01');
  });

  it('pastes an address from the clipboard and hands over to the amount', async () => {
    const tree = await open();
    await tap(tree, 'SendPasteAddress');
    expect(words(tree, 'SendPasteNotice')).toBe('Nothing to paste. Copy a Marscoin address first.');

    mockClipboardContent.mockResolvedValue(`  ${OTHER}\n`);
    await tap(tree, 'SendPasteAddress');
    await settle();
    expect(wordsOf(hostById(tree, 'SendRecipientAddress')[0])).toBe(OTHER);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 700));
    });
    // The cursor goes to the amount, not to the note.
    const amountInput = tree.root.findAll(node => node.props.testID === 'MarsAmountInput' && node.instance?.focus)[0];
    expect(amountInput.instance.focus).toHaveBeenCalledTimes(1);
  });

  it('takes the amount and the note from a pasted payment link', async () => {
    const tree = await open();
    mockClipboardContent.mockResolvedValue(`marscoin:${OTHER}?amount=2.5&label=Rent`);
    await tap(tree, 'SendPasteAddress');
    await settle();
    expect(wordsOf(hostById(tree, 'SendRecipientAddress')[0])).toBe(OTHER);
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('2.5');
    expect(byId(tree, 'SendNoteInput')[0].props.value).toBe('Rent');
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Review payment');
  });

  it('opens the scanner through the usual helper and uses what it reads', async () => {
    let scanned;
    mockScan.mockReturnValue(
      new Promise(resolve => {
        scanned = resolve;
      }),
    );
    const tree = await open();
    await tap(tree, 'BlueAddressInputScanQrButton');
    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockScan).toHaveBeenCalledWith(mockNav.navigate, 'SendDetails');
    await act(async () => scanned(OTHER));
    await settle();
    expect(wordsOf(hostById(tree, 'SendRecipientAddress')[0])).toBe(OTHER);
  });

  it('keeps the note small until it is used', async () => {
    const tree = await open();
    expect(byId(tree, 'SendNoteInput')).toHaveLength(0);
    expect(text(tree)).toContain('Add a note');
    await tap(tree, 'SendAddNote');
    await type(tree, 'SendNoteInput', 'Lunch');
    expect(byId(tree, 'SendNoteInput')[0].props.value).toBe('Lunch');
  });

  it('sends the full balance through the same confirmation as before', async () => {
    const tree = await open();
    await tap(tree, 'SendMaxChip');
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockAlert.mock.calls[0][0]).toBe('Use Full Balance');
    expect(hostById(tree, 'SendAmountMax')).toHaveLength(0);
    await act(async () => mockAlert.mock.calls[0][2][0].onPress());
    expect(hostById(tree, 'SendAmountMax')).toHaveLength(1);
    expect(words(tree, 'SendAmountNote')).toBe('Everything in this wallet, less the network fee.');
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Add a recipient');
    // Tapping the chip again goes back to a typed amount.
    await tap(tree, 'SendMaxChip');
    expect(hostById(tree, 'SendAmountMax')).toHaveLength(0);
    expect(byId(tree, 'MarsAmountInput')[0].props.value).toBe('');
  });

  it('offers one standard fee and, under Advanced, a custom rate in zubrins per byte', async () => {
    const wallet = fakeWallet();
    const tree = await open(wallet);
    expect(hostById(tree, 'FeeSheet')).toHaveLength(0);
    await tap(tree, 'chooseFee');
    const sheet = () => wordsOf(hostById(tree, 'FeeSheet')[0]);
    expect(sheet()).toContain('Network fee');
    expect(sheet()).toContain('Standard');
    expect(sheet()).toContain('6 zubrins/byte · 0.00001356 MARS · under $0.01');
    expect(sheet()).toContain('paying more does not make it faster');
    expect(sheet()).toContain(NEXT_BLOCK_TEXT);
    expect(sheet()).not.toMatch(/Fast|Medium|Slow|~\d+m/);
    expect(button(tree, 'feeStandard').props.accessibilityState.selected).toBe(true);

    // A custom rate must be a whole number.
    await tap(tree, 'feeCustom');
    await type(tree, 'feeCustomInput', '1.5');
    await tap(tree, 'feeCustomApply');
    expect(words(tree, 'feeCustomError')).toBe('Enter a whole number of zubrins per byte.');
    expect(hostById(tree, 'FeeSheet')).toHaveLength(1);

    await type(tree, 'feeCustomInput', '3');
    await tap(tree, 'feeCustomApply');
    await settle();
    expect(hostById(tree, 'FeeSheet')).toHaveLength(0);
    expect(words(tree, 'SendFeeCustom')).toBe('Custom rate · 3 zubrins/byte');
    expect(words(tree, 'SendFeeValue')).toBe('0.00000678 MARS · under $0.01');

    // Never below the minimum of 1.
    await tap(tree, 'chooseFee');
    expect(button(tree, 'feeStandard').props.accessibilityState.selected).toBe(false);
    await type(tree, 'feeCustomInput', '0');
    await tap(tree, 'feeCustomApply');
    await settle();
    expect(words(tree, 'SendFeeCustom')).toBe('Custom rate · 1 zubrin/byte');
    expect(words(tree, 'SendFeeValue')).toBe('0.00000226 MARS · under $0.01');

    // And the custom rate is the one the transaction is built with.
    await type(tree, 'MarsAmountInput', '10');
    await type(tree, 'AddressInput', OTHER);
    await settle();
    await tap(tree, 'CreateTransactionButton');
    await settle();
    expect(wallet.createTransaction.mock.calls[0][2]).toBe(1);

    // Back to standard.
    await tap(tree, 'chooseFee');
    await tap(tree, 'feeStandard');
    await settle();
    expect(hostById(tree, 'SendFeeCustom')).toHaveLength(0);
    expect(words(tree, 'SendFeeValue')).toBe('0.00001356 MARS · under $0.01');
  });

  it('keeps the further options within reach: full balance, recipients, coin control', async () => {
    const tree = await open();
    expect(hostById(tree, 'SendOptionsSheet')).toHaveLength(0);
    await tap(tree, 'advancedOptionsMenuButton');
    const sheet = wordsOf(hostById(tree, 'SendOptionsSheet')[0]);
    for (const title of ['Use Full Balance', 'Add Recipient', 'Remove Recipient', 'Coin Control']) expect(sheet).toContain(title);
    expect(button(tree, 'RemoveRecipient').props.accessibilityState.disabled).toBe(true);

    await tap(tree, 'CoinControl');
    expect(mockNav.navigate).toHaveBeenCalledWith('CoinControl', expect.objectContaining({ walletID: 'wallet-1' }));
    expect(hostById(tree, 'SendOptionsSheet')).toHaveLength(0);
    // Choosing coins limits what can be spent, and says so.
    await act(async () =>
      mockNav.navigate.mock.calls.find(call => call[0] === 'CoinControl')[1].onUTXOChoose([{ txid: 'ee', vout: 1, value: 500000000 }]),
    );
    await settle();
    expect(words(tree, 'SendChosenCoins')).toContain('Spending only 1 chosen coin');
    expect(words(tree, 'SendBalance')).toBe('5');
    await tap(tree, 'SendChosenCoinsClear');
    expect(hostById(tree, 'SendChosenCoins')).toHaveLength(0);
    expect(words(tree, 'SendBalance')).toBe('6,684.2626745');
  });

  it('pages between several recipients', async () => {
    const tree = await open();
    expect(hostById(tree, 'SendRecipientPager')).toHaveLength(0);
    await tap(tree, 'advancedOptionsMenuButton');
    await tap(tree, 'AddRecipient');
    await settle();
    expect(words(tree, 'SendRecipientPager')).toContain('Recipient 1 of 2');
    expect(hostById(tree, 'Transaction0')).toHaveLength(1);
    expect(hostById(tree, 'Transaction1')).toHaveLength(1);
  });

  it('changes wallet from the "From" strip and closes with the header button', async () => {
    const tree = await open();
    await tap(tree, 'SendFromWallet');
    expect(mockNav.navigate).toHaveBeenCalledWith('SelectWallet', expect.objectContaining({ chainType: 'ONCHAIN' }));
    await tap(tree, 'SendClose');
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('stays still under Reduce Motion', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
    const tree = await open();
    await type(tree, 'AddressInput', OTHER);
    expect(hostById(tree, 'SendRecipientCard')).toHaveLength(1);
    expect(words(tree, 'SendFeeValue')).toBe('0.00001356 MARS · under $0.01');
  });
});

describe('Send from the Scan tab', () => {
  it('is the same screen, without a close button, and opens the scanner once by itself', async () => {
    mockRoute = { name: 'QuickSendDetails', params: { isEditable: true, triggerScan: true } };
    let scanned;
    mockScan.mockReturnValue(
      new Promise(resolve => {
        scanned = resolve;
      }),
    );
    const tree = await render(<QuickSendDetails />, sendContext(fakeWallet()));
    const output = text(tree);
    expect(output).toContain('MCR / SEND');
    expect(output).toContain('Send Marscoin');
    expect(output).toContain('CIVIC WALLET');
    expect(words(tree, 'SendBalance')).toBe('6,684.2626745');
    expect(words(tree, 'SendFeeValue')).toBe('0.00001356 MARS · under $0.01');
    expect(output).toContain(NEXT_BLOCK_TEXT);
    expect(output).toContain('Add a note');
    expect(hostById(tree, 'SendClose')).toHaveLength(0);
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Enter an amount');

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockScan).toHaveBeenCalledWith(mockNav.navigate, 'QuickSendDetails');
    await act(async () => scanned(OTHER));
    await settle();
    expect(wordsOf(hostById(tree, 'SendRecipientAddress')[0])).toBe(OTHER);
    expect(mockScan).toHaveBeenCalledTimes(1);

    await type(tree, 'MarsAmountInput', '10');
    await settle();
    expect(wordsOf(button(tree, 'CreateTransactionButton'))).toBe('Review payment');
  });
});

describe('Review', () => {
  // A real, unsigned transaction, so that its ID can be read back.
  const transaction = new bitcoin.Transaction();
  transaction.addInput(Buffer.alloc(32, 1), 0);
  transaction.addOutput(bitcoin.address.toOutputScript(OTHER, Marscoin.mainnet), 1000000000);
  const txHex = transaction.toHex();
  const params = (extra = {}) => ({
    fee: 0.00001356,
    memo: 'Lunch',
    walletID: 'wallet-1',
    tx: txHex,
    recipients: [{ address: OTHER, value: 1000000000 }],
    satoshiPerByte: 6,
    payjoinUrl: null,
    psbt: {},
    marsRate: RATE,
    ...extra,
  });
  const open = async (extra, context) => {
    mockRoute = { name: 'Confirm', params: params(extra) };
    const wallet = fakeWallet();
    return { wallet, tree: await render(<Confirm />, sendContext(wallet, context)) };
  };

  it('shows the amount, who it goes to, where it comes from, and figures that add up', async () => {
    const { tree } = await open();
    const output = text(tree);
    expect(output).toContain('MCR / SEND');
    expect(output).toContain('Review payment');
    expect(words(tree, 'TransactionValue')).toBe('10');
    expect(words(tree, 'TransactionFiat')).toBe('≈ $0.61');
    expect(wordsOf(hostById(tree, 'TransactionAddress')[0])).toBe(OTHER);
    expect(words(tree, 'ConfirmMemo')).toBe('Lunch');
    expect(words(tree, 'ConfirmFromWallet')).toBe('CIVIC WALLET');
    expect(output).toContain('10.00000000 MARS');
    expect(words(tree, 'TransactionFee')).toBe('0.00001356 MARS');
    expect(words(tree, 'TransactionTotal')).toBe('10.00001356 MARS');
    expect(output).toContain('under $0.01');
    expect(output).toContain(NEXT_BLOCK_TEXT);
    // Dollars to the cent, never to eight places.
    expect(output).not.toMatch(/\$ ?\d+\.\d{3,}/);
    expect(output).not.toContain('0.60786211');
    expect(wordsOf(button(tree, 'ConfirmSendButton'))).toBe('Send 10 MARS');
    expect(hostById(tree, 'ConfirmOwnAddress')).toHaveLength(0);
    expect(byId(tree, 'PayjoinSwitch')).toHaveLength(0);
  });

  it('leaves dollar values out when there is no exchange rate', async () => {
    const { tree } = await open({ marsRate: null, memo: '' });
    expect(text(tree)).not.toContain('$');
    expect(hostById(tree, 'TransactionFiat')).toHaveLength(0);
    expect(hostById(tree, 'ConfirmMemo')).toHaveLength(0);
    expect(words(tree, 'TransactionTotal')).toBe('10.00001356 MARS');
  });

  it('says when the payment goes to one of the wallet’s own addresses, and lists several recipients', async () => {
    const { tree } = await open({
      recipients: [
        { address: OWN, value: 250000000 },
        { address: OTHER, value: 1000000000 },
      ],
    });
    expect(text(tree)).toContain('TO 2 RECIPIENTS');
    expect(words(tree, 'TransactionTotalValue')).toBe('12.5');
    expect(hostById(tree, 'TransactionAddress')).toHaveLength(2);
    expect(hostById(tree, 'TransactionValue').map(wordsOf)).toEqual(['2.5 MARS', '10 MARS']);
    expect(words(tree, 'ConfirmOwnAddress')).toBe('One of your own addresses · CIVIC WALLET');
    expect(words(tree, 'TransactionTotal')).toBe('12.50001356 MARS');
  });

  it('sends once, with one success tap, and passes on what the next screen shows', async () => {
    const { tree, wallet } = await open();
    await tap(tree, 'ConfirmSendButton');
    await settle();
    expect(wallet.broadcastTx).toHaveBeenCalledTimes(1);
    expect(wallet.broadcastTx).toHaveBeenCalledWith(txHex);
    expect(mockHaptic.mock.calls).toEqual([['notificationSuccess']]);
    expect(mockNav.navigate).toHaveBeenCalledWith('Success', {
      fee: 0.00001356,
      amount: '10',
      txid: transaction.getId(),
      recipients: [{ address: OTHER, value: 1000000000 }],
      marsRate: RATE,
    });
  });

  it('reports a payment the network refused and stays on the review', async () => {
    const { tree, wallet } = await open();
    wallet.broadcastTx.mockResolvedValue(false);
    await tap(tree, 'ConfirmSendButton');
    await settle();
    expect(mockPresentAlert).toHaveBeenCalledWith({ message: 'Broadcast failed.' });
    expect(mockNav.navigate).not.toHaveBeenCalled();
    expect(button(tree, 'ConfirmSendButton').props.accessibilityState.disabled).toBe(false);
  });

  it('goes back, opens the transaction details, and cannot send while offline mode is on', async () => {
    const { tree } = await open();
    await tap(tree, 'ConfirmBackButton');
    await tap(tree, 'ConfirmBack');
    expect(mockNav.goBack).toHaveBeenCalledTimes(2);
    await tap(tree, 'TransactionDetailsButton');
    expect(mockNav.navigate).toHaveBeenCalledWith(
      'CreateTransaction',
      expect.objectContaining({ tx: txHex, feeSatoshi: 1356, satoshiPerByte: 6 }),
    );

    const offline = await open(undefined, { isElectrumDisabled: true });
    expect(wordsOf(button(offline.tree, 'ConfirmSendButton'))).toBe('Offline mode is on');
    expect(button(offline.tree, 'ConfirmSendButton').props.accessibilityState.disabled).toBe(true);
  });
});

describe('Sent', () => {
  const open = async params => {
    mockRoute = { name: 'Success', params };
    return render(<Success />, {});
  };
  const sent = { fee: 0.00001356, amount: '10', txid: TXID, recipients: [{ address: OTHER, value: 1000000000 }], marsRate: RATE };

  it('shows what was sent, to whom, the fee, the transaction ID and what happens next', async () => {
    const tree = await open(sent);
    const output = text(tree);
    expect(output).toContain('MCR / SENT');
    expect(output).toContain('Payment sent');
    expect(words(tree, 'SuccessAmount')).toBe('10');
    expect(words(tree, 'SuccessFiat')).toBe('≈ $0.61');
    expect(words(tree, 'SuccessRecipient')).toBe(`To${OTHER.slice(0, 6)}…${OTHER.slice(-6)}`);
    expect(words(tree, 'SuccessFee')).toBe('0.00001356 MARS');
    expect(output).toContain('under $0.01');
    expect(words(tree, 'SuccessTxid')).toBe(TXID);
    expect(words(tree, 'SuccessNext')).toContain(
      'It confirms in the next block, usually within a few minutes; blocks sometimes take longer.',
    );
    expect(hostById(tree, 'SuccessMark')).toHaveLength(1);
    expect(tree.root.findByType(SuccessMark).props.animate).toBe(true);
    expect(output).toContain('Done');
  });

  it('copies the transaction ID and opens it on the explorer', async () => {
    const tree = await open(sent);
    await tap(tree, 'SuccessCopyTxid');
    expect(Clipboard.setString).toHaveBeenCalledWith(TXID);
    expect(wordsOf(button(tree, 'SuccessCopyTxid'))).toBe('Copied');
    await tap(tree, 'SuccessExplorer');
    expect(Linking.openURL).toHaveBeenCalledWith(`https://explore.marscoin.org/tx/${TXID}`);
    await tap(tree, 'SuccessRecipient');
    expect(Clipboard.setString).toHaveBeenLastCalledWith(OTHER);
  });

  it('closes the send sheet on Done, or returns to the first screen where there is no sheet', async () => {
    const tree = await open(sent);
    await tap(tree, 'SuccessDone');
    expect(mockParent.pop).toHaveBeenCalledTimes(1);
    expect(mockNav.popToTop).not.toHaveBeenCalled();

    // In the Scan tab the parent is the tab bar, which has nothing to pop.
    mockNav.getParent.mockImplementation(() => ({ jumpTo: jest.fn() }));
    const inTab = await open(sent);
    await tap(inTab, 'SuccessDone');
    expect(mockNav.popToTop).toHaveBeenCalledTimes(1);
    expect(mockParent.pop).toHaveBeenCalledTimes(1);
  });

  it('shows the finished mark without movement under Reduce Motion', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
    const tree = await open(sent);
    expect(tree.root.findByType(SuccessMark).props.animate).toBe(false);
    expect(hostById(tree, 'SuccessMark')).toHaveLength(1);
    expect(words(tree, 'SuccessAmount')).toBe('10');
  });

  it('still serves the screens that only say "done"', async () => {
    const onDonePressed = jest.fn();
    const tree = await open({ amount: undefined, onDonePressed });
    const output = text(tree);
    expect(output).toContain('Sent');
    expect(output).not.toContain('Payment sent');
    expect(hostById(tree, 'SuccessReceipt')).toHaveLength(0);
    expect(hostById(tree, 'SuccessNext')).toHaveLength(0);
    await tap(tree, 'SuccessDone');
    expect(onDonePressed).toHaveBeenCalledTimes(1);
    expect(mockParent.pop).not.toHaveBeenCalled();

    const view = await render(<SuccessModule.SuccessView />, {});
    expect(hostById(view, 'SuccessMark')).toHaveLength(1);
  });
});
