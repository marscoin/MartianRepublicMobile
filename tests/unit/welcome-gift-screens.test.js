// Renders the welcome gift, the home screen's path card in both of its modes,
// and the last page of the application around the gift. The server, the chain
// and the phone's storage are stand-ins: nothing here reaches a network.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Animated } from 'react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
let mockParams = {};
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNav,
    useRoute: () => ({ params: mockParams }),
    useIsFocused: () => true,
    useFocusEffect: effect => useEffect(effect, [effect]),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('react-native-linear-gradient', () => {
  return ({ children }) => children || null;
});
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-snackbar', () => ({ show: jest.fn(), LENGTH_SHORT: 0 }));
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
const mockAlert = jest.fn();
jest.mock('../../components/MarsDialog', () => ({ marsAlert: (...args) => mockAlert(...args) }));
jest.mock('../../components/themes', () => ({
  useTheme: () => ({ colors: {}, fonts: { fontFamily: 'System', regular: { fontFamily: 'System' } } }),
}));
jest.mock('../../BlueComponents', () => ({ BlueSpacing20: () => null }));
jest.mock('../../class', () => ({}));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({ AbstractHDElectrumWallet: {} }));
jest.mock('../../models/networkTransactionFees', () => ({
  __esModule: true,
  default: { recommendedFees: async () => ({ mediumFee: 2 }) },
  NetworkTransactionFee: class {},
}));
jest.mock('../../blue_modules/MARSConnection', () => ({ waitTillConnected: jest.fn(async () => {}), getTxHex: jest.fn() }));
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});
jest.mock('../../blue_modules/civic-api', () => ({
  getCivicToken: jest.fn(async () => 'session-token'),
  useCivicSession: () => ({ address: 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1', status: 'active' }),
}));
jest.mock('../../blue_modules/citizenship-draft', () => ({
  readCitizenshipDraft: jest.fn(async () => ({})),
  saveCitizenshipDraft: jest.fn(async () => {}),
}));
jest.mock('../../blue_modules/workspace-api', () => ({
  assertWorkspaceIdentity: jest.fn(),
  WORKSPACE_ORIGIN: 'https://martianrepublic.org',
  workspaceStore: { read: jest.fn(async () => ({})), subscribe: jest.fn(() => () => {}), submit: jest.fn() },
}));
let mockWorkspace = {};
jest.mock('../../blue_modules/workspace-hooks', () => ({
  useWorkspaceData: () => ({ data: mockWorkspace, refresh: mockRefresh, loading: false }),
}));
const mockRefresh = jest.fn();
// The server's side of the gift and the chain's side of publishing.
const mockGrant = { fetchGrantOffer: jest.fn(), claimGrantOffer: jest.fn(), waitForGrant: jest.fn() };
jest.mock('../../blue_modules/welcome-grant', () => ({
  fetchGrantOffer: (...args) => mockGrant.fetchGrantOffer(...args),
  claimGrantOffer: (...args) => mockGrant.claimGrantOffer(...args),
  waitForGrant: (...args) => mockGrant.waitForGrant(...args),
}));
const mockPublication = { prepare: jest.fn(), publish: jest.fn() };
jest.mock('../../blue_modules/citizenship-publication', () => ({
  ...jest.requireActual('../../blue_modules/citizenship-publication'),
  prepareCitizenshipPublication: (...args) => mockPublication.prepare(...args),
  publishCitizenshipTransaction: (...args) => mockPublication.publish(...args),
}));

const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const { BlueStorageContext } = require('../../blue_modules/storage-context');
const { INSUFFICIENT_FUNDS } = require('../../blue_modules/citizenship-publication');
const { PATH_PREFERENCE_KEY } = require('../../blue_modules/path-preference');
const { journey } = require('../../blue_modules/onboarding');
const WelcomeGift = require('../../components/WelcomeGift').default;
const Journey = require('../../screen/onboarding/Journey').default;
const { JoinInvite } = require('../../screen/onboarding/Journey');
const CivicHome = require('../../screen/workspace/CivicHome').default;
const ApplicationReview = require('../../screen/citizen/joinGeneralPublicApplication3').default;

const ADDRESS = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
const txid = 'ab'.repeat(32);
const grantTxid = 'cd'.repeat(32);

const trees = [];
async function render(element) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  await act(async () => {});
  trees.push(tree);
  return tree;
}
// Everything a person could read, one line per text element.
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
const byTestID = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type === 'string');
const pressable = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && node.props.onPress)[0];
const press = (tree, testID) => act(async () => pressable(tree, testID).props.onPress());
// A request that waits until the test lets it finish.
function held() {
  let release;
  const promise = new Promise(resolve => {
    release = resolve;
  });
  return { promise, release };
}

let reduceMotion;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockWorkspace = {};
  for (const key of Object.keys(AsyncStorage.data)) delete AsyncStorage.data[key];
  reduceMotion = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

describe('The welcome gift', () => {
  const show = (props = {}) =>
    render(<WelcomeGift visible amountText="0.01 MARS" onAccept={jest.fn()} onDecline={jest.fn()} onStop={jest.fn()} {...props} />);

  it('offers the gift in plain words with the real amount and two choices', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const tree = await show({ onAccept, onDecline });
    const shown = text(tree);
    expect(shown).toContain('MARTIAN REPUBLIC / WELCOME GIFT');
    expect(shown).toContain('A welcome gift from the Republic.');
    expect(shown).toContain('The Martian Republic gives every newcomer 0.01 MARS. It pays the network fee to publish your');
    expect(shown).toContain('0.01 MARS');
    expect(shown).toContain('nothing is requested and no Marscoin is');
    expect(shown).toContain('Accept and publish');
    expect(shown).toContain('Not now');
    expect(shown).not.toMatch(/!|Congrat/);
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'header')).not.toHaveLength(0);

    await press(tree, 'WelcomeGiftAccept');
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    await press(tree, 'WelcomeGiftDecline');
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('does not invent an amount it was not told', async () => {
    const tree = await show({ amountText: null });
    expect(text(tree)).toContain('The Martian Republic gives every newcomer a little Marscoin.');
    expect(text(tree)).not.toMatch(/\d MARS/);
  });

  it('draws nothing until there is an offer', async () => {
    const tree = await show({ visible: false });
    expect(tree.toJSON()).toBeNull();
  });

  it('says what is happening while the gift is claimed, with no way to accept twice', async () => {
    const tree = await show({ progress: 'Requesting your welcome gift…' });
    expect(text(tree)).toContain('Requesting your welcome gift…');
    expect(text(tree)).toContain('Keep the app open.');
    expect(pressable(tree, 'WelcomeGiftAccept')).toBeUndefined();
    expect(pressable(tree, 'WelcomeGiftDecline')).toBeUndefined();
    expect(pressable(tree, 'WelcomeGiftStop')).toBeUndefined();
    expect(byTestID(tree, 'WelcomeGiftProgress')[0].props.accessibilityLiveRegion).toBe('polite');
  });

  it('lets the person stop waiting for the coins, and only then', async () => {
    const onStop = jest.fn();
    const tree = await show({ progress: 'Waiting for it to arrive…', canStop: true, onStop });
    expect(text(tree)).toContain('Stop waiting');
    await press(tree, 'WelcomeGiftStop');
    expect(onStop).toHaveBeenCalledTimes(1);
    const stopping = await show({ progress: 'Waiting for it to arrive…', canStop: true, stopping: true });
    expect(text(stopping)).toContain('Stopping…');
    expect(pressable(stopping, 'WelcomeGiftStop').props.disabled).toBe(true);
  });

  it('reveals itself with a short movement, and with none when Reduce Motion is on', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await show();
    expect(timing).not.toHaveBeenCalled();

    reduceMotion.mockResolvedValue(false);
    await show();
    expect(timing).toHaveBeenCalledTimes(2);
    for (const [, config] of timing.mock.calls) {
      expect(config.useNativeDriver).toBe(true);
      expect(config.duration).toBeLessThanOrEqual(600);
    }
  });
});

describe('The path card', () => {
  it('shows a newcomer five steps, starting with the community, and a quiet way out', async () => {
    const onSkip = jest.fn();
    const onOpen = jest.fn();
    const tree = await render(<Journey steps={journey({})} onOpen={onOpen} onSkip={onSkip} />);
    const shown = text(tree);
    expect(shown).toContain('YOUR PATH');
    expect(shown).toContain('1\n of \n5'.replace(/\n/g, ''));
    expect(shown).toContain('Meet the community');
    expect(shown).toContain('Just use the wallet for now');
    expect(shown).not.toContain('Get your first Marscoin');
    await press(tree, 'JourneyAction');
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: 'terms', route: 'CitizenScreen' }));
    await press(tree, 'JourneySkip');
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('lists every step, in order, behind "See what comes after"', async () => {
    const tree = await render(<Journey steps={journey({ termsAccepted: true })} onOpen={jest.fn()} />);
    expect(text(tree)).toContain('free to start');
    expect(text(tree)).toContain('welcome gift when available');
    const more = tree.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.onPress && !node.props.testID)[0];
    await act(async () => more.props.onPress());
    const shown = text(tree);
    const order = ['Create your wallet', 'Meet the community', 'Introduce yourself', 'Become a citizen', 'Vote'].map(title =>
      shown.indexOf(title),
    );
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // No way out is drawn unless the screen offers one.
    expect(pressable(tree, 'JourneySkip')).toBeUndefined();
  });

  it('becomes one row that invites the person back', async () => {
    const onJoin = jest.fn();
    const tree = await render(<JoinInvite onJoin={onJoin} />);
    expect(text(tree)).toContain('Join the Republic');
    expect(text(tree)).toContain('Your wallet works either way.');
    await press(tree, 'JoinInvite');
    expect(onJoin).toHaveBeenCalledTimes(1);
  });
});

describe('The home screen', () => {
  const home = () =>
    render(
      <BlueStorageContext.Provider value={{ wallets: [] }}>
        <CivicHome />
      </BlueStorageContext.Provider>,
    );
  const saved = () => JSON.parse(AsyncStorage.data[PATH_PREFERENCE_KEY] || '{}');

  it('shows a newcomer the path, and keeps a way to get Marscoin that is not a step', async () => {
    mockWorkspace = { citizenship: { status: 'new', terms_accepted: false } };
    const tree = await home();
    expect(byTestID(tree, 'Journey')).toHaveLength(1);
    expect(byTestID(tree, 'JoinInvite')).toHaveLength(0);
    expect(text(tree)).toContain('Just use the wallet for now');
    expect(text(tree)).not.toContain('Get your first Marscoin');
    expect(pressable(tree, 'Around-SwapHome')).toBeDefined();
  });

  it('puts the path away on "Just use the wallet for now", remembers it, and brings it back when asked', async () => {
    mockWorkspace = { citizenship: { status: 'new', terms_accepted: true } };
    let tree = await home();
    await press(tree, 'JourneySkip');
    expect(byTestID(tree, 'Journey')).toHaveLength(0);
    expect(byTestID(tree, 'JoinInvite')).toHaveLength(1);
    expect(saved()).toEqual({ walletOnly: { [ADDRESS]: true } });
    // The rest of the home screen is untouched.
    expect(pressable(tree, 'Around-SwapHome')).toBeDefined();
    expect(pressable(tree, 'Around-Proposals')).toBeDefined();

    // Opening the app again: still the invitation, not the path.
    tree = await home();
    expect(byTestID(tree, 'Journey')).toHaveLength(0);
    expect(byTestID(tree, 'JoinInvite')).toHaveLength(1);

    await press(tree, 'JoinInvite');
    expect(byTestID(tree, 'Journey')).toHaveLength(1);
    expect(byTestID(tree, 'JoinInvite')).toHaveLength(0);
    expect(saved()).toEqual({ walletOnly: {} });
  });

  it('shows the path of someone who has published, whatever they chose before', async () => {
    AsyncStorage.data[PATH_PREFERENCE_KEY] = JSON.stringify({ walletOnly: { [ADDRESS]: true } });
    mockWorkspace = { citizenship: { status: 'submitted', terms_accepted: true, application_stage: 'published_pending' } };
    const tree = await home();
    expect(byTestID(tree, 'Journey')).toHaveLength(1);
    expect(byTestID(tree, 'JoinInvite')).toHaveLength(0);
    expect(text(tree)).not.toContain('Just use the wallet for now');
  });
});

describe('Publishing the application', () => {
  const form = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada',
    bio: 'Engineer.',
    photo: 'https://ipfs.marscoin.org/ipfs/photo',
    video: 'https://ipfs.marscoin.org/ipfs/video',
  };
  const wallet = { civic: true, _address: ADDRESS, _getExternalAddressByIndex: () => ADDRESS, getID: () => 'wallet-1' };
  const offer = { outcome: 'available', txid: null, amountZubrins: 1000000, reason: null, challenge: { nonce: 'n1' } };
  const publication = { txid, txHex: '00', fee: 2260, status: 'prepared' };
  const tooFew = () => Object.assign(new Error('Not enough.'), { code: INSUFFICIENT_FUNDS });

  const open = async () => {
    mockParams = { ...form, address: ADDRESS };
    return render(
      <BlueStorageContext.Provider value={{ wallets: [wallet] }}>
        <ApplicationReview />
      </BlueStorageContext.Provider>,
    );
  };
  const publishButton = tree =>
    tree.root.findAll(node => node.props.onPress && typeof node.props.disabled === 'boolean' && !node.props.testID)[0];
  // The label beside the verification box toggles it, like the box itself.
  const tick = tree =>
    act(async () =>
      tree.root
        .findAll(node => node.type === 'Text' && node.props.onPress && /^I, Ada Lovelace, verify/.test(String(node.props.children)))[0]
        .props.onPress(),
    );
  const tapPublish = tree => act(async () => publishButton(tree).props.onPress());
  // An empty civic wallet until the gift arrives.
  const emptyUntilGift = () => {
    let funded = false;
    mockPublication.prepare.mockImplementation(async () => {
      if (!funded) throw tooFew();
      return publication;
    });
    mockGrant.waitForGrant.mockImplementation(async () => {
      funded = true;
      return true;
    });
    mockGrant.fetchGrantOffer.mockResolvedValue(offer);
    mockGrant.claimGrantOffer.mockResolvedValue({ outcome: 'sent', txid: grantTxid, amountZubrins: 1000000, reason: null });
    mockPublication.publish.mockImplementation(async ({ publication: sent }) => ({ ...sent, status: 'submitted' }));
  };

  it('does nothing until the verification box is ticked', async () => {
    emptyUntilGift();
    const tree = await open();
    expect(publishButton(tree).props.disabled).toBe(true);
    await tapPublish(tree);
    expect(mockPublication.prepare).not.toHaveBeenCalled();
    expect(mockGrant.fetchGrantOffer).not.toHaveBeenCalled();
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(0);
  });

  it('with enough Marscoin, never mentions the gift and asks to confirm the fee', async () => {
    mockPublication.prepare.mockResolvedValue(publication);
    const tree = await open();
    await tick(tree);
    await tapPublish(tree);
    expect(mockGrant.fetchGrantOffer).not.toHaveBeenCalled();
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(0);
    const [title, message] = mockAlert.mock.calls[0];
    expect(title).toBe('Publish your application');
    expect(message).toContain('Network fee: 0.00002260 MARS');
    expect(mockPublication.publish).not.toHaveBeenCalled();
  });

  it('shows the gift without claiming it, then on "Accept and publish" claims, waits, publishes and lands on success', async () => {
    emptyUntilGift();
    const tree = await open();
    await tick(tree);
    await tapPublish(tree);
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(1);
    expect(text(tree)).toContain('The Martian Republic gives every newcomer 0.01 MARS.');
    expect(mockGrant.fetchGrantOffer).toHaveBeenCalledTimes(1);
    expect(mockGrant.claimGrantOffer).not.toHaveBeenCalled();
    expect(mockPublication.publish).not.toHaveBeenCalled();

    // Hold the claim so the in-progress state can be read.
    const claim = held();
    mockGrant.claimGrantOffer.mockReturnValue(claim.promise);
    await act(async () => {
      pressable(tree, 'WelcomeGiftAccept').props.onPress();
    });
    expect(text(tree)).toContain('Requesting your welcome gift…');
    expect(pressable(tree, 'WelcomeGiftAccept')).toBeUndefined();
    await act(async () => claim.release({ outcome: 'sent', txid: grantTxid, amountZubrins: 1000000, reason: null }));

    expect(mockGrant.claimGrantOffer).toHaveBeenCalledTimes(1);
    expect(mockGrant.claimGrantOffer.mock.calls[0][0]).toMatchObject({ wallet, offer });
    expect(mockGrant.waitForGrant).toHaveBeenCalledWith(expect.objectContaining({ wallet, txid: grantTxid, timeout: 180000 }));
    expect(mockPublication.publish).toHaveBeenCalledTimes(1);
    expect(mockPublication.publish.mock.calls[0][0]).toMatchObject({ wallet, publication });
    expect(mockNav.navigate).toHaveBeenCalledWith('JoinGeneralPublicApplicationSuccessScreen', { txid });
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(0);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('on "Not now" requests nothing, sends nothing, and leaves a quiet note with the ways to pay', async () => {
    emptyUntilGift();
    const tree = await open();
    await tick(tree);
    await tapPublish(tree);
    await press(tree, 'WelcomeGiftDecline');

    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(0);
    expect(mockGrant.claimGrantOffer).not.toHaveBeenCalled();
    expect(mockGrant.waitForGrant).not.toHaveBeenCalled();
    expect(mockPublication.publish).not.toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(byTestID(tree, 'WelcomeGiftDeclined')).toHaveLength(1);
    const shown = text(tree);
    expect(shown).toContain('No gift was requested and no Marscoin was sent.');
    expect(shown).toContain('Get Marscoin with Bitcoin');
    expect(shown).toContain('Show my address');

    // The gift can still be accepted later: tapping the button offers it again.
    await tapPublish(tree);
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(1);
    expect(byTestID(tree, 'WelcomeGiftDeclined')).toHaveLength(0);
    expect(mockGrant.claimGrantOffer).not.toHaveBeenCalled();
  });

  it('when no gift is available, says so accurately and offers the ways to get Marscoin', async () => {
    mockPublication.prepare.mockRejectedValue(tooFew());
    mockGrant.fetchGrantOffer.mockResolvedValue({
      outcome: 'unavailable',
      txid: null,
      amountZubrins: null,
      reason: 'The welcome gift is not available right now.',
    });
    const tree = await open();
    await tick(tree);
    await tapPublish(tree);
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(0);
    const [title, message, buttons] = mockAlert.mock.calls[0];
    expect(title).toBe('You need a little Marscoin');
    expect(message).toContain('The welcome gift is not available right now.');
    expect(buttons.map(button => button.text)).toEqual(['Get Marscoin with Bitcoin', 'Show my address', 'Not now']);
    expect(mockGrant.claimGrantOffer).not.toHaveBeenCalled();
  });

  it('says the gift is on its way, and publishes nothing, when it was sent but has not arrived', async () => {
    emptyUntilGift();
    mockGrant.waitForGrant.mockResolvedValue(false);
    const tree = await open();
    await tick(tree);
    await tapPublish(tree);
    await press(tree, 'WelcomeGiftAccept');
    expect(mockAlert).toHaveBeenCalledWith('Your welcome gift is on its way', expect.stringContaining('Nothing has been published.'));
    expect(mockPublication.publish).not.toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalled();
    expect(byTestID(tree, 'WelcomeGift')).toHaveLength(0);
  });
});
