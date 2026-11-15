// Renders "Find older funds" through its states with a real wallet, real key
// derivation and real signing. Only the network is a stand-in: nothing here
// reaches a server.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../../blue_modules/constants';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
let mockParams;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../NavigationService', () => ({
  navigate: jest.fn(),
  navigationRef: { isReady: () => true, getCurrentRoute: () => ({ name: 'FindOlderFunds' }), addListener: () => () => {} },
}));
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('../../blue_modules/app-review', () => ({ celebrate: jest.fn(), noteAppOpened: jest.fn(), openStoreReview: jest.fn() }));
jest.mock('../../blue_modules/civic-api', () => ({ getCivicToken: jest.fn() }));
jest.mock('../../blue_modules/workspace-api', () => ({
  assertWorkspaceIdentity: jest.fn(),
  WORKSPACE_ORIGIN: 'https://martianrepublic.org',
}));
jest.mock('../../blue_modules/swap', () => ({
  useSwaps: () => [],
  useSwapOwnerId: () => null,
  useSwapWatcher: jest.fn(),
  useMakerRunner: jest.fn(),
}));
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});
// The wallet's storage and UI parents are not needed; its Marscoin code is real.
jest.mock('../../class', () => ({
  HDLegacyP2PKHWallet: class {
    getID() {
      return this.testId || 'wallet-1';
    }

    getLabel() {
      return this.testLabel || 'Civic wallet';
    }
  },
}));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({ AbstractHDElectrumWallet: { defaultRBFSequence: 0xfffffffd } }));
jest.mock('../../class/rng', () => ({ randomBytes: async size => require('crypto').randomBytes(size) }));

// The stand-in network. Each test sets what it answers.
const mockNet = {};
jest.mock('../../blue_modules/MARSConnection', () => ({
  waitTillConnected: (...args) => mockNet.waitTillConnected(...args),
  multiGetHistoryByAddress: (...args) => mockNet.multiGetHistoryByAddress(...args),
  multiGetBalanceByAddress: (...args) => mockNet.multiGetBalanceByAddress(...args),
  multiGetUtxoByAddress: (...args) => mockNet.multiGetUtxoByAddress(...args),
  getTransactionsByAddress: (...args) => mockNet.getTransactionsByAddress(...args),
  getTxHex: (...args) => mockNet.getTxHex(...args),
  broadcastV2: (...args) => mockNet.broadcastV2(...args),
  estimateFees: (...args) => mockNet.estimateFees(...args),
}));

const { BlueStorageContext } = require('../../blue_modules/storage-context');
const { MarsElectrumWallet } = require('../../screen/wallets/mars-wallet');
const { offerOlderFundsAfterRestore } = require('../../blue_modules/older-funds-flow');
const FindOlderFunds = require('../../screen/wallets/FindOlderFunds').default;

// Key derivation and signing run in plain JavaScript here and are slow.
jest.setTimeout(180000);

// Public BIP39 test vector. Never use this mnemonic for funds.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OLDER = 'MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR'; // m/44'/2'/0'/0'/0/0
const OWN = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1'; // the wallet's own first receive address

// One wallet for the whole file: the module remembers the addresses it has
// worked out for a wallet, which keeps these tests quick.
let wallet;
const theWallet = () => {
  if (!wallet) {
    wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
  }
  return wallet;
};

let counter = 0;
function fundingTx(address, value) {
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, ++counter), 0);
  tx.addOutput(bitcoin.address.toOutputScript(address, Marscoin.mainnet), value);
  return tx;
}

// A network holding the given coins: [{ address, value, height }].
function network(coins = []) {
  const transactions = new Map();
  const byAddress = {};
  for (const { address, value, height = 1000 } of coins) {
    const tx = fundingTx(address, value);
    transactions.set(tx.getId(), tx);
    (byAddress[address] = byAddress[address] || []).push({ txId: tx.getId(), vout: 0, value, height });
  }
  Object.assign(mockNet, {
    waitTillConnected: jest.fn(async () => true),
    multiGetHistoryByAddress: jest.fn(async addresses =>
      Object.fromEntries(
        addresses.map(address => [address, (byAddress[address] || []).map(coin => ({ tx_hash: coin.txId, height: coin.height }))]),
      ),
    ),
    multiGetBalanceByAddress: jest.fn(async addresses => ({
      addresses: Object.fromEntries(
        addresses.map(address => [
          address,
          {
            confirmed: (byAddress[address] || []).filter(coin => coin.height > 0).reduce((sum, coin) => sum + coin.value, 0),
            unconfirmed: (byAddress[address] || []).filter(coin => !(coin.height > 0)).reduce((sum, coin) => sum + coin.value, 0),
          },
        ]),
      ),
    })),
    multiGetUtxoByAddress: jest.fn(async addresses =>
      Object.fromEntries(addresses.map(address => [address, (byAddress[address] || []).map(coin => ({ ...coin, address }))])),
    ),
    getTransactionsByAddress: jest.fn(async () => []),
    getTxHex: jest.fn(async txid => transactions.get(txid).toHex()),
    broadcastV2: jest.fn(async hex => bitcoin.Transaction.fromHex(hex).getId()),
    // The send screen's source: its default rate becomes fast + 5 = 6 zubrins/byte.
    estimateFees: jest.fn(async () => ({ fast: 1, medium: 1, slow: 1 })),
  });
  return transactions;
}

const trees = [];
async function render(wallets = [theWallet()]) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(
      <BlueStorageContext.Provider value={{ wallets }}>
        <FindOlderFunds />
      </BlueStorageContext.Provider>,
    );
  });
  trees.push(tree);
  return tree;
}
// Everything a person could read on the screen, one line per text element.
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
const button = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && node.props.onPress)[0];
const press = (tree, testID) => act(async () => button(tree, testID).props.onPress());
// Wait until the screen says something (the work behind it is asynchronous).
async function until(tree, wanted) {
  for (let turn = 0; turn < 6000; turn++) {
    if (text(tree).includes(wanted)) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Never showed "${wanted}". The screen says:\n${text(tree)}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
});

describe('Find older funds screen', () => {
  it('explains itself, shows each place as it is checked, and says when nothing was found', async () => {
    network();
    let release;
    mockNet.waitTillConnected = jest.fn(() => new Promise(resolve => (release = resolve)));
    const tree = await render();
    await until(tree, 'CHECKING');
    expect(text(tree)).toContain(
      'Older versions of the Republic’s wallet sometimes kept coins on other addresses that belong to the same recovery words. This checks those places.',
    );
    for (const label of [
      'Earlier website wallet',
      'Website wallet, second address set',
      'Words saved with an extra space',
      'Extra space, earlier website wallet',
      'Extra space, second address set',
    ]) {
      expect(text(tree)).toContain(label);
    }
    expect(text(tree)).not.toContain('No older funds found');
    expect(text(tree)).not.toContain('Nothing');

    // Hold the network at the third place: two are done, one is being checked.
    let hold;
    const answer = mockNet.multiGetHistoryByAddress;
    let calls = 0;
    mockNet.multiGetHistoryByAddress = jest.fn(async addresses => {
      if (++calls === 5) await new Promise(resolve => (hold = resolve));
      return answer(addresses);
    });
    for (let turn = 0; turn < 500 && !mockNet.waitTillConnected.mock.calls.length; turn++) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    }
    await act(async () => release(true));
    for (let turn = 0; turn < 6000 && mockNet.multiGetHistoryByAddress.mock.calls.length < 5; turn++) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    }
    await until(tree, 'Checking…');
    expect(text(tree)).toContain('CHECKING');
    expect(text(tree).match(/^Nothing$/gm)).toHaveLength(2);
    expect(text(tree)).not.toContain('No older funds found');

    await act(async () => hold());
    await until(tree, 'No older funds found');
    expect(text(tree)).toContain('PLACES CHECKED');
    expect(text(tree).match(/^Nothing$/gm)).toHaveLength(5);
    expect(text(tree)).not.toContain('Move to this wallet');
    expect(button(tree, 'OlderFundsMove')).toBeUndefined();
    expect(mockNet.broadcastV2).not.toHaveBeenCalled();
  });

  it('shows what it found, asks before moving, then signs, sends once and shows the transaction', async () => {
    const transactions = network([
      { address: OLDER, value: 1250000000 },
      { address: 'MA2xLQxc7HYQzieY4kyQFmKwND4wvbCSBL', value: 250000000 },
      { address: OWN, value: 999 }, // the wallet's own coin: never part of this
    ]);
    const tree = await render();
    await until(tree, 'Total found');
    const found = text(tree);
    expect(found).toContain('EARLIER WEBSITE WALLET');
    expect(found).toContain('12.5 MARS');
    expect(found).toContain('WORDS SAVED WITH AN EXTRA SPACE');
    expect(found).toContain('2.5 MARS');
    expect(found).toContain('On 1 address.');
    expect(found).toContain('15 MARS');
    expect(found).toContain('Move to this wallet');
    expect(found).not.toContain('No older funds found');
    expect(found).not.toContain('awaiting confirmation');

    // Nothing is signed or sent before the person has seen the numbers.
    await press(tree, 'OlderFundsMove');
    await until(tree, 'Confirm the move');
    expect(mockNet.getTxHex).not.toHaveBeenCalled();
    expect(mockNet.broadcastV2).not.toHaveBeenCalled();
    const review = text(tree);
    const fee = (4 + 1 + 2 * 148 + 1 + 34 + 4) * 6;
    expect(fee).toBe(2040);
    expect(review).toContain('Amount found\n15 MARS');
    expect(review).toContain('Network fee\n2,040 zubrins');
    expect(review).toContain('Will arrive\n14.9999796 MARS');
    expect(review).toContain(OWN);
    expect(review).toContain('Move now');
    expect(review).toContain('Not now');

    await press(tree, 'OlderFundsConfirm');
    await until(tree, 'ON ITS WAY');
    expect(mockNet.broadcastV2).toHaveBeenCalledTimes(1);
    const tx = bitcoin.Transaction.fromHex(mockNet.broadcastV2.mock.calls[0][0]);
    expect(tx.outs).toHaveLength(1);
    expect(bitcoin.address.fromOutputScript(tx.outs[0].script, Marscoin.mainnet)).toBe(OWN);
    expect(tx.outs[0].value).toBe(1500000000 - fee);
    const spent = tx.ins.map(input => Buffer.from(input.hash).reverse().toString('hex'));
    expect(spent).toHaveLength(2);
    for (const txid of spent) {
      const previous = transactions.get(txid).outs[0];
      expect(bitcoin.address.fromOutputScript(previous.script, Marscoin.mainnet)).not.toBe(OWN);
    }
    const sent = text(tree);
    expect(sent).toContain('14.9999796 MARS');
    expect(sent).toContain(tx.getId());
    expect(sent).toContain('They appear in the wallet after the next block.');
    expect(sent).not.toContain('Move to this wallet');
    await press(tree, 'OlderFundsDone');
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('lets the person back out of the confirmation without sending anything', async () => {
    network([{ address: OLDER, value: 1250000000 }]);
    const tree = await render();
    await until(tree, 'Total found');
    await press(tree, 'OlderFundsMove');
    await until(tree, 'Confirm the move');
    await press(tree, 'OlderFundsCancel');
    expect(text(tree)).toContain('Move to this wallet');
    expect(text(tree)).not.toContain('Confirm the move');
    expect(mockNet.getTxHex).not.toHaveBeenCalled();
    expect(mockNet.broadcastV2).not.toHaveBeenCalled();
  });

  it('keeps what it found when the network rejects the transaction', async () => {
    network([{ address: OLDER, value: 1250000000 }]);
    mockNet.broadcastV2 = jest.fn(async () => Promise.reject(new Error('min relay fee not met')));
    const tree = await render();
    await until(tree, 'Total found');
    await press(tree, 'OlderFundsMove');
    await until(tree, 'Confirm the move');
    await press(tree, 'OlderFundsConfirm');
    await until(tree, 'The network did not accept the transaction.');
    expect(mockNet.broadcastV2).toHaveBeenCalledTimes(1); // no silent retry
    const after = text(tree);
    expect(after).toContain('min relay fee not met');
    expect(after).toContain('12.5 MARS');
    expect(after).toContain('Move to this wallet');
    expect(after).not.toContain('ON ITS WAY');
  });

  it('keeps what it found when the transaction cannot be prepared', async () => {
    network([{ address: OLDER, value: 1250000000 }]);
    const tree = await render();
    await until(tree, 'Total found');
    mockNet.getTransactionsByAddress = jest.fn(async () => Promise.reject(new Error('offline')));
    await press(tree, 'OlderFundsMove');
    await until(tree, 'Could not');
    expect(text(tree)).toContain('12.5 MARS');
    expect(text(tree)).toContain('Move to this wallet');
    expect(text(tree)).not.toContain('Confirm the move');
    // And when the previous transaction cannot be fetched at signing time.
    mockNet.getTransactionsByAddress = jest.fn(async () => []);
    mockNet.getTxHex = jest.fn(async () => Promise.reject(new Error('socket closed')));
    await press(tree, 'OlderFundsMove');
    await until(tree, 'Confirm the move');
    await press(tree, 'OlderFundsConfirm');
    await until(tree, 'socket closed');
    expect(text(tree)).toContain('Could not reach the Marscoin network.');
    expect(text(tree)).toContain('Move to this wallet');
    expect(mockNet.broadcastV2).not.toHaveBeenCalled();
  });

  it('says so when the coins are worth less than the fee to move them', async () => {
    network([{ address: OLDER, value: 700 }]);
    const tree = await render();
    await until(tree, 'Total found');
    expect(text(tree)).toContain('0.000007 MARS');
    await press(tree, 'OlderFundsMove');
    await until(tree, 'worth less than the network fee');
    expect(text(tree)).toContain('Move to this wallet');
    expect(text(tree)).not.toContain('Confirm the move');
    expect(mockNet.broadcastV2).not.toHaveBeenCalled();
  });

  it('shows unconfirmed coins but moves only confirmed ones', async () => {
    network([
      { address: OLDER, value: 1250000000 },
      { address: OLDER, value: 50000000, height: 0 },
    ]);
    const tree = await render();
    await until(tree, 'Total found');
    const found = text(tree);
    expect(found).toContain('13 MARS');
    expect(found).toContain('0.5 MARS of this is awaiting confirmation.');
    expect(found).toContain('Ready to move\n12.5 MARS');
    expect(found).toContain('0.5 MARS is still awaiting confirmation. Check again after the next block to move it too.');
    await press(tree, 'OlderFundsMove');
    await until(tree, 'Confirm the move');
    expect(text(tree)).toContain('Amount found\n12.5 MARS');
    expect(text(tree)).toContain('moves 1 coin from');
  });

  it('asks to wait when every coin found is still unconfirmed', async () => {
    network([{ address: OLDER, value: 50000000, height: 0 }]);
    const tree = await render();
    await until(tree, 'Total found');
    const found = text(tree);
    expect(found).toContain('0.5 MARS');
    expect(found).toContain(
      'These coins are still awaiting confirmation and cannot be moved yet. Wait for the next block, then check again.',
    );
    expect(found).not.toContain('Move to this wallet');
    expect(button(tree, 'OlderFundsMove')).toBeUndefined();
    expect(button(tree, 'OlderFundsRecheck')).toBeDefined();
  });

  it('reports a network failure as a failure, and checks again on request', async () => {
    network([{ address: OLDER, value: 1250000000 }]);
    mockNet.multiGetBalanceByAddress = jest.fn(async () => Promise.reject(new Error('Electrum client is not connected')));
    const tree = await render();
    await until(tree, 'Could not reach the Marscoin network. Check your connection and try again.');
    expect(text(tree)).toContain('Electrum client is not connected');
    expect(text(tree)).toContain('Try again');
    expect(text(tree)).not.toContain('No older funds found');
    expect(text(tree)).not.toContain('Nothing');

    network([{ address: OLDER, value: 1250000000 }]);
    await act(async () => tree.root.findAll(node => node.props.action === 'Try again' && node.props.onPress)[0].props.onPress());
    await until(tree, 'Total found');
    expect(text(tree)).toContain('12.5 MARS');
    expect(text(tree)).not.toContain('Could not reach');
  });

  it('reports a network that never connects as a failure', async () => {
    network();
    mockNet.waitTillConnected = jest.fn(async () => Promise.reject(new Error('The Marscoin network is unreachable.')));
    const tree = await render();
    await until(tree, 'Try again');
    expect(text(tree)).toContain('The Marscoin network is unreachable.');
    expect(text(tree)).not.toContain('No older funds found');
    expect(mockNet.multiGetHistoryByAddress).not.toHaveBeenCalled();
  });

  it('is only for a Marscoin wallet made from recovery words', async () => {
    network();
    const watchOnly = { type: 'watchOnly', getID: () => 'w', secret: 'xpub', getLabel: () => 'Watch' };
    const tree = await render([watchOnly]);
    expect(text(tree)).toContain('This needs a Marscoin wallet made from recovery words.');
    expect(mockNet.waitTillConnected).not.toHaveBeenCalled();
    // A wallet asked for by ID that is not eligible is not silently replaced by another.
    mockParams = { walletID: 'w' };
    const second = await render([watchOnly, theWallet()]);
    expect(text(second)).toContain('This needs a Marscoin wallet made from recovery words.');
    expect(mockNet.waitTillConnected).not.toHaveBeenCalled();
  });
});

describe('the offer after restoring a wallet', () => {
  const quick = extra => ({ delay: 0, alert: jest.fn(), open: jest.fn(), ...extra });
  const restored = id => {
    const copy = theWallet();
    copy.testId = id;
    return copy;
  };
  afterEach(() => {
    delete theWallet().testId;
  });

  it('offers the screen when something is there, and only then', async () => {
    network([{ address: OLDER, value: 1250000000 }]);
    const options = quick();
    const scan = await offerOlderFundsAfterRestore(restored('restore-1'), options);
    expect(scan.total).toBe(1250000000);
    expect(options.alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = options.alert.mock.calls[0];
    expect(title).toBe('We found 12.5 MARS on older addresses of this wallet');
    expect(message).toContain('same recovery words');
    expect(buttons.map(item => item.text)).toEqual(['Show me', 'Not now']);
    expect(options.open).not.toHaveBeenCalled();
    buttons[0].onPress();
    expect(options.open).toHaveBeenCalledWith('restore-1');
    expect(mockNet.broadcastV2).not.toHaveBeenCalled();

    // Once per wallet: a second restore attempt in the same session stays quiet.
    const again = quick();
    expect(await offerOlderFundsAfterRestore(restored('restore-1'), again)).toBeNull();
    expect(again.alert).not.toHaveBeenCalled();
  });

  it('says nothing when nothing is found', async () => {
    network();
    const options = quick();
    const scan = await offerOlderFundsAfterRestore(restored('restore-2'), options);
    expect(scan.total).toBe(0);
    expect(options.alert).not.toHaveBeenCalled();
  });

  it('stays silent, and does not throw, when the network cannot be reached', async () => {
    network([{ address: OLDER, value: 1250000000 }]);
    mockNet.waitTillConnected = jest.fn(async () => Promise.reject(new Error('unreachable')));
    const options = quick();
    expect(await offerOlderFundsAfterRestore(restored('restore-3'), options)).toBeNull();
    mockNet.waitTillConnected = jest.fn(async () => true);
    mockNet.multiGetHistoryByAddress = jest.fn(async () => Promise.reject(new Error('lost')));
    expect(await offerOlderFundsAfterRestore(restored('restore-4'), options)).toBeNull();
    expect(options.alert).not.toHaveBeenCalled();
  });

  it('ignores wallets that have no recovery words', async () => {
    network();
    const options = quick();
    expect(await offerOlderFundsAfterRestore({ type: 'watchOnly', getID: () => 'x' }, options)).toBeNull();
    expect(await offerOlderFundsAfterRestore(null, options)).toBeNull();
    expect(mockNet.waitTillConnected).not.toHaveBeenCalled();
  });

  it('opens the screen on the home tab with the wallet’s ID by default', () => {
    const { openFindOlderFunds } = require('../../blue_modules/older-funds-flow');
    const NavigationService = require('../../NavigationService');
    openFindOlderFunds('wallet-9');
    expect(NavigationService.navigate).toHaveBeenCalledWith('Citizen', { screen: 'FindOlderFunds', params: { walletID: 'wallet-9' } });
  });
});
