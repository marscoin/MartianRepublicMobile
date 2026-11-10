// Renders the swap and ballot screens with representative data to catch
// runtime errors in layout and state handling. Network and native modules are
// replaced; the wording and presentation logic are real.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { SwapState } from '../../blue_modules/swap/engine';

const mockNavigate = jest.fn();
let mockParams = {};
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    useRoute: () => ({ params: mockParams }),
    useIsFocused: () => true,
    useFocusEffect: effect => useEffect(() => effect(), [effect]),
  };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('../../components/QRCodeComponent', () => () => null);
jest.mock('../../blue_modules/app-review', () => ({ celebrate: jest.fn(), noteAppOpened: jest.fn(), openStoreReview: jest.fn() }));
jest.mock('../../blue_modules/civic-api', () => ({ getCivicToken: jest.fn() }));
jest.mock('../../blue_modules/workspace-api', () => ({
  assertWorkspaceIdentity: jest.fn(),
  WORKSPACE_ORIGIN: 'https://martianrepublic.org',
}));

const mockWallet = {
  type: 'marscoin',
  civic: true,
  _getSeed: () => Buffer.alloc(64),
  getSecret: () => 'phrase',
  getID: () => 'wallet-1',
  getAddressAsync: async () => 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1',
};
let mockWallets = [mockWallet];
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});

let mockSwaps = [];
let mockOwnerId = null;
const mockEngine = { listOffers: jest.fn(), accept: jest.fn(), pay: jest.fn(), cancel: jest.fn(), get: jest.fn() };
const mockBtcWallet = { sync: jest.fn(), createPayment: jest.fn() };
const mockGetServices = jest.fn(() => ({ engine: mockEngine, btcWallet: mockBtcWallet }));
jest.mock('../../blue_modules/swap', () => ({
  getSwapServices: (...args) => mockGetServices(...args),
  useSwaps: () => mockSwaps,
  useSwapOwnerId: () => mockOwnerId,
  useSwapWatcher: jest.fn(),
  advanceSwaps: jest.fn(async () => {}),
  esplora: { tipHeight: jest.fn(async () => 975010), feeRate: jest.fn(async () => 3), broadcast: jest.fn() },
  swapChain: { tipHeight: jest.fn(async () => 3598300) },
}));

const mockVoting = { readBallot: jest.fn(), prepareBallotInput: jest.fn(), joinBallotRound: jest.fn(), castVote: jest.fn() };
jest.mock('../../blue_modules/voting', () => mockVoting);
const mockFetchProposal = jest.fn();
jest.mock('../../blue_modules/voting/congress', () => ({
  ...jest.requireActual('../../blue_modules/voting/congress'),
  fetchProposal: (...args) => mockFetchProposal(...args),
}));

const { BlueStorageContext } = require('../../blue_modules/storage-context');
const SwapHome = require('../../screen/swap/SwapHome').default;
const SwapDetail = require('../../screen/swap/SwapDetail').default;
const BtcWallet = require('../../screen/swap/BtcWallet').default;
const Ballot = require('../../screen/congress/ballot').default;

const trees = [];
async function render(Screen) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(
      <BlueStorageContext.Provider value={{ wallets: mockWallets }}>
        <Screen />
      </BlueStorageContext.Provider>,
    );
  });
  await act(async () => {});
  trees.push(tree);
  return tree;
}
// Everything a person could read on the screen, one line per text element.
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
// Screens keep timers while mounted.
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
});

const offer = {
  id: 'aa'.repeat(16),
  marsAmount: 7050000000,
  btcAmount: 6229,
  makerPubkey: '02' + 'ab'.repeat(32),
  paymentHash: 'cd'.repeat(20),
  marsLocktime: 3598500,
  expiresAt: 9999999999,
  problem: null,
};
const swap = (state, extra = {}) => ({
  id: 's1',
  walletId: 'wallet-1',
  state,
  error: null,
  createdAt: 1794000000,
  updatedAt: 1794000000,
  marsAmount: 7050000000,
  btcAmount: 6229,
  btcLocktime: 975030,
  marsLocktime: 3598500,
  marsHtlcAddress: 'mars1qn3whadz4r8w2jpfn0wrp5dg4grccuyxzp5sxxl5khxp579eegexqm9anzr',
  btcHtlcAddress: 'bc1qvacw248n8qjszvjkxm27ctt4eq5aqamdvagvh7grjjcp978rugzqaf0g7k',
  btcPayment: null,
  marsClaim: null,
  btcRefunds: [],
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServices.mockImplementation(() => ({ engine: mockEngine, btcWallet: mockBtcWallet }));
  mockWallets = [mockWallet];
  mockSwaps = [];
  mockOwnerId = null;
  mockParams = {};
  mockEngine.listOffers.mockResolvedValue({
    offers: [
      offer,
      {
        ...offer,
        id: 'bb'.repeat(16),
        marsAmount: 14100000000,
        btcAmount: 12690,
        problem: 'This offer is too close to its Marscoin deadline to complete safely.',
      },
    ],
    marsHeight: 3598300,
    btcHeight: 975010,
    feeRate: 3,
  });
  mockBtcWallet.sync.mockResolvedValue({
    balance: 25000,
    confirmed: 25000,
    unconfirmed: 0,
    utxos: [],
    receiveAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    changeAddress: 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('Swap screens', () => {
  it('shows the Bitcoin balance and offers, and dims unsafe ones with the reason', async () => {
    const tree = await render(SwapHome);
    const output = text(tree);
    expect(output).toContain('25,000 sats');
    expect(output).toContain('70.5 MARS');
    expect(output).toContain('6,229 sats');
    expect(output).toContain('88.4');
    expect(output).toContain('too close to its Marscoin deadline');
    expect(tree.root.findAll(node => node.props.title === 'Swap')).not.toHaveLength(0);
  });

  it('explains the terms before reserving an offer, then opens the swap', async () => {
    mockEngine.accept.mockResolvedValue({ id: 's1' });
    const tree = await render(SwapHome);
    await act(async () => tree.root.findAll(node => node.props.title === 'Swap' && node.props.onPress)[0].props.onPress());
    const [title, body, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe('Swap 6,229 sats for 70.5 MARS?');
    expect(body).toMatch(/pay Bitcoin only after this app has verified/);
    await act(async () => buttons[1].onPress());
    expect(mockEngine.accept).toHaveBeenCalledWith(offer, {
      marsDestination: 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1',
      btcRefundAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    });
    expect(mockNavigate).toHaveBeenCalledWith('SwapDetail', { swapId: 's1' });
  });

  it('blocks a second swap while one is in progress and reports load failures', async () => {
    mockSwaps = [swap(SwapState.WAITING_MARS)];
    mockEngine.listOffers.mockRejectedValue(new Error('Unable to reach the Marscoin swap relay. Check your connection and try again.'));
    const tree = await render(SwapHome);
    expect(text(tree)).toContain('Swap in progress');
    expect(text(tree)).toContain('Unable to reach the Marscoin swap relay');
    expect(text(tree)).toContain('25,000 sats');
  });

  it('shows Bitcoin that is on its way before it confirms', async () => {
    mockBtcWallet.sync.mockResolvedValue({
      balance: 25000,
      confirmed: 0,
      unconfirmed: 25000,
      incoming: 25000,
      utxos: [],
      receiveAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      changeAddress: 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
    });
    expect(text(await render(SwapHome))).toContain('Includes 25,000 sats incoming');
    const wallet = text(await render(BtcWallet));
    expect(wallet).toContain('Incoming');
    expect(wallet).toContain('Seen on the Bitcoin network');
  });

  it('asks for a review when a swap is seen through to completion, not when an old one is opened', async () => {
    const { celebrate } = require('../../blue_modules/app-review');
    mockParams = { swapId: 's1' };
    mockSwaps = [swap(SwapState.COMPLETED)];
    await render(SwapDetail);
    expect(celebrate).not.toHaveBeenCalled();

    mockSwaps = [swap(SwapState.CLAIMING)];
    const tree = await render(SwapDetail);
    mockSwaps = [swap(SwapState.COMPLETED)];
    await act(async () =>
      tree.update(
        <BlueStorageContext.Provider value={{ wallets: mockWallets }}>
          <SwapDetail />
        </BlueStorageContext.Provider>,
      ),
    );
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it('asks for a wallet when there is none', async () => {
    mockWallets = [];
    expect(text(await render(SwapHome))).toContain('Create or restore a Marscoin wallet first');
    expect(text(await render(BtcWallet))).toContain('Create or restore a Marscoin wallet first');
  });

  it.each(Object.values(SwapState))('renders a swap in state %s', async state => {
    mockParams = { swapId: 's1' };
    mockSwaps = [swap(state, { error: state === SwapState.UNCLAIMED ? 'The Marscoin deadline passed.' : null })];
    const output = text(await render(SwapDetail));
    expect(output).toContain('6,229 sats');
    expect(output).toContain('70.499 MARS');
    expect(output.includes('from this wallet')).toBe(state === SwapState.READY_TO_PAY);
    expect(output.includes('Cancel swap')).toBe([SwapState.ACCEPTING, SwapState.WAITING_MARS, SwapState.READY_TO_PAY].includes(state));
  });

  it('shows the network fee, pays only after confirmation, and explains a shortfall', async () => {
    mockParams = { swapId: 's1' };
    mockSwaps = [swap(SwapState.READY_TO_PAY)];
    mockEngine.get.mockResolvedValue(mockSwaps[0]);
    mockEngine.pay.mockRejectedValue(
      Object.assign(new Error('Not enough Bitcoin for this amount and the network fee.'), { shortfall: 1200 }),
    );
    const tree = await render(SwapDetail);
    await act(async () =>
      tree.root.findAll(node => String(node.props.title).includes('from this wallet') && node.props.onPress)[0].props.onPress(),
    );
    expect(mockEngine.pay).not.toHaveBeenCalled();
    expect(Alert.alert.mock.calls[0][1]).toMatch(/Bitcoin network fee: about 465 sats \(3 sat\/vB\)/);
    await act(async () => Alert.alert.mock.calls[0][2][1].onPress());
    expect(mockEngine.pay).toHaveBeenCalledWith(mockSwaps[0], mockBtcWallet);
    expect(Alert.alert.mock.calls[1]).toEqual([
      'Not enough Bitcoin',
      'Add at least 1,200 sats to your Bitcoin wallet, or pay from another wallet.',
    ]);
  });

  it('pays once even if the confirmation is pressed twice', async () => {
    mockParams = { swapId: 's1' };
    mockSwaps = [swap(SwapState.READY_TO_PAY)];
    mockEngine.get.mockResolvedValue(mockSwaps[0]);
    let finish;
    mockEngine.pay.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const tree = await render(SwapDetail);
    await act(async () =>
      tree.root.findAll(node => String(node.props.title).includes('from this wallet') && node.props.onPress)[0].props.onPress(),
    );
    const confirm = Alert.alert.mock.calls[0][2][1].onPress;
    await act(async () => {
      confirm();
      confirm();
    });
    await act(async () => finish());
    expect(mockEngine.pay).toHaveBeenCalledTimes(1);
  });

  it('keeps using the wallet that owns a swap when another wallet is added', async () => {
    const everyday = { ...mockWallet, civic: false, getID: () => 'wallet-2' };
    mockWallets = [everyday, mockWallet];
    mockOwnerId = 'wallet-1';
    mockEngine.accept.mockResolvedValue({ id: 's1' });
    const tree = await render(SwapHome);
    await act(async () => tree.root.findAll(node => node.props.title === 'Swap' && node.props.onPress)[0].props.onPress());
    await act(async () => Alert.alert.mock.calls[0][2][1].onPress());
    // Offers were taken with the civic wallet's services, not the newer wallet's.
    expect(mockEngine.accept).toHaveBeenCalled();
    expect(mockGetServices.mock.calls.every(([wallet]) => wallet.getID() === 'wallet-1')).toBe(true);
  });

  it('shows a receive address and refuses an invalid withdrawal address', async () => {
    const tree = await render(BtcWallet);
    expect(text(tree)).toContain('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    const field = tree.root.findAll(node => node.props.accessibilityLabel === 'Bitcoin address' && node.props.onChangeText)[0];
    await act(async () => field.props.onChangeText('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1'));
    await act(async () => tree.root.findAll(node => node.props.title === 'Review and send' && node.props.onPress)[0].props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith('Check the address', 'That is not a valid Bitcoin address.');
    expect(mockBtcWallet.createPayment).not.toHaveBeenCalled();
  });
});

describe('Ballot screen', () => {
  const proposal = {
    id: 14,
    title: 'Establish Code RFC Forum',
    tier: 'operational',
    phase: 'voting',
    txid: 'ab',
    ipfs_hash: 'https://ipfs.marscoin.org/ipfs/Qmaow2cUCwQoYmKM37cgXLCFAtJFXz7h2xSrKCQDt6nrxw',
    yays: 2,
    nays: 0,
    voting_ends_at: '2099-01-01 00:00:00',
  };
  beforeEach(() => {
    mockParams = { proposalId: 14 };
    mockFetchProposal.mockResolvedValue({ proposal });
    mockVoting.prepareBallotInput.mockResolvedValue({});
  });

  it('explains the cost and offers a ballot when none exists', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'none' });
    const tree = await render(Ballot);
    const output = text(tree);
    expect(output).toContain('Establish Code RFC Forum');
    expect(output).toContain('0.2 MARS');
    expect(output).toContain('2 yes · 0 no');
    expect(tree.root.findAll(node => node.props.title === 'Request my ballot')[0].props.disabled).toBe(false);
  });

  it('explains why a ballot cannot be requested when the civic wallet cannot pay', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'none' });
    mockVoting.prepareBallotInput.mockRejectedValue(
      new Error('A ballot costs 0.2 MARS in network fees. Add Marscoin to your civic wallet, then try again.'),
    );
    const tree = await render(Ballot);
    expect(text(tree)).toContain('A ballot costs 0.2 MARS in network fees');
    expect(tree.root.findAll(node => node.props.title === 'Request my ballot')[0].props.disabled).toBe(true);
  });

  it('shows the gathering voters while waiting and lets the citizen leave', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'none' });
    const cancel = jest.fn();
    let progress;
    mockVoting.joinBallotRound.mockImplementation(({ onProgress }) => {
      progress = onProgress;
      return { promise: new Promise(() => {}), cancel };
    });
    const tree = await render(Ballot);
    await act(async () => tree.root.findAll(node => node.props.title === 'Request my ballot' && node.props.onPress)[0].props.onPress());
    await act(async () => progress({ stage: 'waiting', present: 2 }));
    expect(text(tree)).toContain('Nothing is spent while you wait');
    expect(tree.root.findAll(node => node.props.title === 'Request my ballot')).toHaveLength(0);
    await act(async () => progress({ stage: 'shuffling', voters: 3 }));
    expect(text(tree)).toContain('Mixing ballots with the other voters');
    await act(async () => trees.pop().unmount());
    expect(cancel).toHaveBeenCalled();
  });

  it('re-reads the chain after a failed round and lets the citizen stop mid-round', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'none' });
    let fail;
    let progress;
    const cancel = jest.fn();
    mockVoting.joinBallotRound.mockImplementation(({ onProgress }) => {
      progress = onProgress;
      return { promise: new Promise((resolve, reject) => (fail = reject)), cancel };
    });
    const tree = await render(Ballot);
    await act(async () => tree.root.findAll(node => node.props.title === 'Request my ballot' && node.props.onPress)[0].props.onPress());
    await act(async () => progress({ stage: 'signing', voters: 3 }));
    expect(tree.root.findAll(node => node.props.title === 'Stop and leave')).not.toHaveLength(0);
    const reads = mockVoting.readBallot.mock.calls.length;
    await act(async () => fail(new Error('The connection was lost after you signed.')));
    expect(Alert.alert).toHaveBeenCalledWith('Ballot not issued', 'The connection was lost after you signed.');
    expect(mockVoting.readBallot.mock.calls.length).toBeGreaterThan(reads);
  });

  it('casts one vote even if two confirmations are pressed', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'ready' });
    let finish;
    mockVoting.castVote.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const tree = await render(Ballot);
    await act(async () => tree.root.findAll(node => node.props.title === 'Yes' && node.props.onPress)[0].props.onPress());
    await act(async () => tree.root.findAll(node => node.props.title === 'No' && node.props.onPress)[0].props.onPress());
    await act(async () => {
      Alert.alert.mock.calls[0][2][1].onPress();
      Alert.alert.mock.calls[1][2][1].onPress();
    });
    await act(async () => finish('txid'));
    expect(mockVoting.castVote).toHaveBeenCalledTimes(1);
    expect(mockVoting.castVote.mock.calls[0][0].choice).toBe('yes');
  });

  it('casts a vote only after an explicit confirmation', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'ready' });
    mockVoting.castVote.mockResolvedValue('txid');
    const tree = await render(Ballot);
    await act(async () => tree.root.findAll(node => node.props.title === 'No' && node.props.onPress)[0].props.onPress());
    expect(mockVoting.castVote).not.toHaveBeenCalled();
    expect(Alert.alert.mock.calls[0][0]).toBe('Vote No?');
    expect(Alert.alert.mock.calls[0][1]).toMatch(/final and cannot be changed/);
    await act(async () => Alert.alert.mock.calls[0][2][1].onPress());
    expect(mockVoting.castVote).toHaveBeenCalledWith({ wallet: mockWallet, proposal, choice: 'no' });
  });

  it('shows a cast vote with its transaction, and no way to vote again', async () => {
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'counted', choice: 'yes', txid: 'ef'.repeat(32) });
    const tree = await render(Ballot);
    expect(text(tree)).toContain('Your vote is on the chain');
    expect(text(tree)).toContain('ef'.repeat(32));
    expect(tree.root.findAll(node => ['Yes', 'No', 'Abstain', 'Request my ballot'].includes(node.props.title))).toHaveLength(0);
  });

  it('does not offer a ballot when voting is closed or there is no civic wallet', async () => {
    mockFetchProposal.mockResolvedValue({ proposal: { ...proposal, phase: 'expired' } });
    mockVoting.readBallot.mockResolvedValue({ address: 'M', status: 'none' });
    expect(text(await render(Ballot))).toContain('Voting on this proposal is not open');
    mockWallets = [{ ...mockWallet, civic: false }];
    expect(text(await render(Ballot))).toContain('Restore your civic wallet to vote');
  });
});
