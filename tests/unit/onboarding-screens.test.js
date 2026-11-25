// Walks a newcomer through the setup screens with a real generated wallet and
// checks what they see and what is saved at each point.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';

const mockNav = { navigate: jest.fn(), push: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
let mockParams = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }));
jest.mock('react-native-linear-gradient', () => () => null);
jest.mock('react-native-elements', () => ({ Icon: () => null }));
const mockBlur = { enableBlur: jest.fn(), disableBlur: jest.fn() };
jest.mock('../../hooks/usePrivacy', () => () => mockBlur);
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});
// A stand-in wallet with the same surface the screens use.
const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
let mockCreated = 0;
jest.mock('../../screen/wallets/mars-wallet', () => ({
  MarsElectrumWallet: class {
    constructor() {
      this.type = 'marscoin';
      this.civic = false;
      this.id = `wallet-${++mockCreated}`;
    }

    async generate() {
      this.secret = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    }

    setLabel(label) {
      this.label = label;
    }

    getLabel() {
      return this.label;
    }

    getSecret() {
      return this.secret;
    }

    getID() {
      return this.id;
    }

    setCivic() {
      this.civic = true;
    }

    _getExternalAddressByIndex() {
      return 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
    }
  },
}));

const { BlueStorageContext } = require('../../blue_modules/storage-context');
const { MarsElectrumWallet } = require('../../screen/wallets/mars-wallet');
const OnboardingIntro = require('../../screen/onboarding/OnboardingIntro').default;
const OnboardingWords = require('../../screen/onboarding/OnboardingWords').default;
const OnboardingCheck = require('../../screen/onboarding/OnboardingCheck').default;
const OnboardingReady = require('../../screen/onboarding/OnboardingReady').default;

let store;
const trees = [];
async function render(Screen) {
  let tree;
  const element = () => (
    <BlueStorageContext.Provider value={{ wallets: store.wallets, addWallet: store.addWallet, saveToDisk: store.saveToDisk }}>
      <Screen />
    </BlueStorageContext.Provider>
  );
  await act(async () => {
    tree = TestRenderer.create(element());
  });
  await act(async () => tree.update(element()));
  trees.push(tree);
  return tree;
}
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
const press = (tree, title) =>
  act(async () => tree.root.findAll(node => node.props.title === title && node.props.onPress)[0].props.onPress());

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockCreated = 0;
  mockParams = {};
  store = { wallets: [], saved: 0 };
  store.addWallet = jest.fn(wallet => {
    store.wallets = [...store.wallets, wallet];
  });
  store.saveToDisk = jest.fn(async () => {
    store.saved++;
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
});

describe('Introduction', () => {
  it('shows one idea per step and moves forward one screen at a time', async () => {
    mockParams = { page: 0 };
    let tree = await render(OnboardingIntro);
    expect(text(tree)).toContain('You made it to Mars.');
    await press(tree, 'Begin registration');
    expect(mockNav.push).toHaveBeenCalledWith('OnboardingIntro', { page: 1 });

    mockParams = { page: 2 };
    tree = await render(OnboardingIntro);
    expect(text(tree)).toContain('Twelve words. Guard them.');
    expect(text(tree)).toContain('The Republic will never ask for them.');
    await press(tree, 'Show me my words');
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingWords');
  });

  it('reports progress to screen readers', async () => {
    mockParams = { page: 1 };
    const tree = await render(OnboardingIntro);
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0].props.accessibilityLabel).toBe('Step 2 of 7');
  });
});

describe('Creating the wallet and writing down its words', () => {
  it('creates one wallet, saves it before showing the words, and shields them from screenshots', async () => {
    const tree = await render(OnboardingWords);
    expect(store.addWallet).toHaveBeenCalledTimes(1);
    expect(store.saved).toBe(1);
    expect(store.wallets[0].civic).toBe(false);
    expect(mockBlur.enableBlur).toHaveBeenCalled();
    const shown = text(tree);
    PHRASE.split(' ').forEach(word => expect(shown).toContain(word));
    expect(shown).toContain('Write these down.');
    await press(tree, 'I have written them down');
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingCheck', { walletID: 'wallet-1' });
    await act(async () => trees.pop().unmount());
    expect(mockBlur.disableBlur).toHaveBeenCalled();
  });

  it('picks up an unfinished setup instead of creating a second wallet', async () => {
    const earlier = new MarsElectrumWallet();
    await earlier.generate();
    earlier.setLabel('CIVIC WALLET');
    store.wallets = [earlier];
    const tree = await render(OnboardingWords);
    expect(store.addWallet).not.toHaveBeenCalled();
    expect(text(tree)).toContain('abandon');
  });

  it('does not show words that could not be saved', async () => {
    store.saveToDisk.mockRejectedValueOnce(new Error('disk full'));
    const tree = await render(OnboardingWords);
    expect(text(tree)).toContain('could not be saved on this device');
    expect(text(tree)).not.toContain('abandon');
    expect(tree.root.findAll(node => node.props.title === 'Try again')).not.toHaveLength(0);
  });
});

describe('Checking the words', () => {
  const start = async () => {
    const wallet = new MarsElectrumWallet();
    await wallet.generate();
    wallet.setLabel('CIVIC WALLET');
    store.wallets = [wallet];
    mockParams = { walletID: wallet.getID() };
    return render(OnboardingCheck);
  };
  const options = tree =>
    tree.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        node.props.style &&
        !node.props.title &&
        node.props.onPress &&
        !node.props.accessibilityLabel,
    );

  it('asks for three words by position and moves on only after three right answers', async () => {
    const tree = await start();
    for (let round = 0; round < 3; round++) {
      expect(text(tree)).toMatch(/Which is your \d+(st|nd|rd|th) word\?/);
      expect(text(tree)).toContain(`CHECK ${round + 1} OF 3`);
      expect(mockNav.navigate).not.toHaveBeenCalled();
      await act(async () =>
        tree.root.findAll(node => node.props.testID === 'OnboardingCheckAnswer' && node.props.onPress)[0].props.onPress(),
      );
      await act(async () => new Promise(resolve => setTimeout(resolve, 520)));
    }
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingReady', { walletID: 'wallet-1', page: 0 });
  });

  it('answers a wrong choice gently and lets the person look again', async () => {
    const tree = await start();
    const wrong = options(tree).find(node => node.props.testID !== 'OnboardingCheckAnswer');
    await act(async () => wrong.props.onPress());
    expect(text(tree)).toContain('Not that one.');
    expect(mockNav.navigate).not.toHaveBeenCalled();
    await press(tree, 'Show my words again');
    expect(mockNav.goBack).toHaveBeenCalled();
  });
});

describe('Finishing', () => {
  const start = async page => {
    const wallet = new MarsElectrumWallet();
    await wallet.generate();
    wallet.setLabel('CIVIC WALLET');
    store.wallets = [wallet];
    mockParams = { walletID: wallet.getID(), page };
    return { tree: await render(OnboardingReady), wallet };
  };

  it('presents the wallet as an identity with its public address', async () => {
    const { tree, wallet } = await start(0);
    expect(text(tree)).toContain('Your papers are in order.');
    expect(text(tree)).toContain('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
    expect(text(tree)).not.toContain('abandon');
    expect(wallet.civic).toBe(false);
    await press(tree, 'Continue');
    expect(mockNav.push).toHaveBeenCalledWith('OnboardingReady', { walletID: 'wallet-1', page: 1 });
  });

  it('makes it the civic wallet and saves only at the very end', async () => {
    const { tree, wallet } = await start(1);
    expect(text(tree)).not.toContain('Get your first Marscoin');
    expect(text(tree)).toContain('1. Meet the community');
    expect(text(tree)).toContain('2. Introduce yourself');
    expect(text(tree)).toContain('free to start');
    expect(text(tree)).toContain('welcome gift when available');
    // Joining is presented as optional.
    expect(text(tree)).toContain('None of it is required');
    expect(wallet.civic).toBe(false);
    await press(tree, 'Enter the Republic');
    expect(wallet.civic).toBe(true);
    expect(store.saved).toBe(1);
    expect(mockNav.navigate).toHaveBeenCalledWith('BottomTabs');
  });

  it('stays put and explains if the last step cannot be saved', async () => {
    const { tree } = await start(1);
    store.saveToDisk.mockRejectedValueOnce(new Error('locked'));
    await press(tree, 'Enter the Republic');
    expect(Alert.alert).toHaveBeenCalledWith('Not saved yet', expect.stringContaining('Your wallet is safe'));
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });
});
