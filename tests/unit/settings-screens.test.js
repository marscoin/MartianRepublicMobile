// Renders the shared settings pieces and the screens built from them, to catch
// runtime errors and to hold the wording, the test IDs and the handlers in
// place. Storage, the network and native modules are replaced.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Platform, Switch } from 'react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn(), pop: jest.fn(), setOptions: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: {}, name: 'ElectrumSettings' }),
}));
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('../../loc', () => {
  const en = require('../../loc/en.json');
  return {
    __esModule: true,
    default: { ...en, formatString: (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]) },
    formatStringAddTwoWhiteSpaces: value => value,
  };
});
jest.mock('../../blue_modules/storage-context', () => {
  const { createContext } = require('react');
  return { BlueStorageContext: createContext({}) };
});
jest.mock('../../BlueComponents', () => {
  const accessory = () => null;
  accessory.InputAccessoryViewID = 'accessory';
  return {
    BlueHeaderDefaultSub: () => null,
    BlueDoneAndDismissKeyboardInputAccessory: accessory,
    BlueDismissKeyboardInputAccessory: accessory,
    BlueCopyToClipboardButton: () => null,
  };
});
const mockAlert = jest.fn();
jest.mock('../../components/MarsDialog', () => ({ marsAlert: (...args) => mockAlert(...args) }));
const mockPresentAlert = jest.fn();
jest.mock('../../components/Alert', () => ({ __esModule: true, default: (...args) => mockPresentAlert(...args) }));
jest.mock('../../blue_modules/hapticFeedback', () => ({ __esModule: true, default: jest.fn(), HapticFeedbackTypes: {} }));

// General
const mockUr = { isURv1Enabled: jest.fn(async () => false), setUseURv1: jest.fn(), clearUseURv1: jest.fn() };
jest.mock('../../blue_modules/ur', () => mockUr);

// Privacy
const mockClipboard = { isReadClipboardAllowed: jest.fn(async () => true), setReadClipboardAllowed: jest.fn(async () => {}) };
jest.mock('../../blue_modules/clipboard', () => () => mockClipboard);
const mockQuickActions = { getEnabled: jest.fn(async () => true), setEnabled: jest.fn(async () => {}) };
jest.mock('../../class/quick-actions', () => ({ __esModule: true, default: mockQuickActions }));
const mockWidgets = {
  isBalanceDisplayAllowed: jest.fn(async () => false),
  setBalanceDisplayAllowed: jest.fn(async () => {}),
  reloadAllTimelines: jest.fn(),
};
jest.mock('../../blue_modules/WidgetCommunication', () => ({ __esModule: true, default: mockWidgets }));
const mockAnalytics = { setOptOut: jest.fn() };
jest.mock('../../blue_modules/analytics', () => mockAnalytics);
const mockOpenSettings = jest.fn();
jest.mock('react-native-permissions', () => ({ openSettings: (...args) => mockOpenSettings(...args) }));

// Network
const mockNotifications = { isNotificationsCapable: true };
jest.mock('../../blue_modules/notifications', () => ({ __esModule: true, default: mockNotifications }));
const mockElectrum = {
  ELECTRUM_HOST: 'electrum_host',
  ELECTRUM_TCP_PORT: 'electrum_tcp_port',
  ELECTRUM_SSL_PORT: 'electrum_ssl_port',
  ELECTRUM_SERVER_HISTORY: 'electrum_server_history',
  isDisabled: jest.fn(async () => false),
  setDisabled: jest.fn(async () => {}),
  getConfig: jest.fn(),
  serverFeatures: jest.fn(async () => ({ server_version: 'ElectrumX' })),
  testConnection: jest.fn(async () => true),
  forceDisconnect: jest.fn(),
  connectMain: jest.fn(),
};
jest.mock('../../blue_modules/BlueElectrum', () => mockElectrum);
const mockStored = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async key => (key in mockStored ? mockStored[key] : null)),
    setItem: jest.fn(async (key, value) => {
      mockStored[key] = value;
    }),
  },
}));
jest.mock('react-native-default-preference', () => ({
  __esModule: true,
  default: { setName: jest.fn(async () => {}), set: jest.fn(async () => {}), clear: jest.fn(async () => {}) },
}));
jest.mock('../../class/deeplink-schema-match', () => ({
  __esModule: true,
  default: { getServerFromSetElectrumServerAction: () => false },
}));
const mockRequestCamera = jest.fn(async () => {});
jest.mock('../../helpers/scan-qr', () => ({ requestCameraAuthorization: (...args) => mockRequestCamera(...args) }));

// Settings
jest.mock('../../blue_modules/civic-api', () => ({ getCivicToken: jest.fn(async () => 'token') }));
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(async () => ({ data: {} })) } }));
jest.mock('react-native-dialog', () => {
  const none = () => null;
  return { __esModule: true, default: { Container: none, Title: none, Description: none, Input: none, Button: none } };
});
jest.mock('react-native-restart', () => ({ __esModule: true, default: { Restart: jest.fn() } }));
jest.mock('../../BlueApp', () => ({ deleteAllWallets: jest.fn() }));

const { BlueStorageContext } = require('../../blue_modules/storage-context');
const Ui = require('../../components/SettingsUi');
const Settings = require('../../screen/settings/Settings').default;
const GeneralSettings = require('../../screen/settings/GeneralSettings').default;
const SettingsPrivacy = require('../../screen/settings/SettingsPrivacy').default;
const NetworkSettings = require('../../screen/settings/NetworkSettings').default;
const ElectrumSettings = require('../../screen/settings/electrumSettings').default;
const Tools = require('../../screen/settings/tools').default;

let context;
const trees = [];
async function render(element) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<BlueStorageContext.Provider value={context}>{element}</BlueStorageContext.Provider>);
  });
  await act(async () => {});
  trees.push(tree);
  return tree;
}
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
const pressable = (tree, testID) => tree.root.findAll(node => node.props?.testID === testID && node.props.onPress)[0];
const tap = (tree, testID) => act(async () => pressable(tree, testID).props.onPress());
const switches = tree => tree.root.findAllByType(Switch);
const switchById = (tree, testID) => switches(tree).find(node => node.props.testID === testID);
const switchByLabel = (tree, label) => switches(tree).find(node => node.props.accessibilityLabel === label);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  for (const key of Object.keys(mockStored)) delete mockStored[key];
  Platform.OS = 'ios';
  mockNotifications.isNotificationsCapable = true;
  mockElectrum.isDisabled.mockResolvedValue(false);
  mockElectrum.getConfig.mockResolvedValue({ host: 'electrum1.marscoin.org', port: 50002, connected: 1 });
  context = {
    language: 'en',
    wallets: [{}, {}],
    isAdvancedModeEnabled: jest.fn(async () => false),
    setIsAdvancedModeEnabled: jest.fn(async () => {}),
    isHandOffUseEnabled: false,
    setIsHandOffUseEnabledAsyncStorage: jest.fn(),
    isStorageEncrypted: jest.fn(async () => false),
    setDoNotTrack: jest.fn(async () => {}),
    isDoNotTrackEnabled: jest.fn(async () => false),
    setIsPrivacyBlurEnabled: jest.fn(),
    setIsElectrumDisabled: jest.fn(),
  };
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
});

describe('Shared settings pieces', () => {
  it('draws a labelled group and drops the dividing line under its last row', async () => {
    const tree = await render(
      <Ui.SettingsSection label="THIS APP">
        <Ui.SettingsRow title="First" note="Leads somewhere." onPress={() => {}} testID="first" />
        {false}
        <Ui.SettingsRow title="Second" value="USD" testID="second" />
      </Ui.SettingsSection>,
    );
    expect(text(tree)).toBe('THIS APP\nFirst\nLeads somewhere.\nSecond\nUSD');
    const rows = tree.root.findAllByType(Ui.SettingsRow);
    expect(rows.map(row => !!row.props.last)).toEqual([false, true]);
  });

  it('draws only the label when a group has no rows', async () => {
    const tree = await render(<Ui.SettingsSection label="YOUR OWN SERVER" />);
    expect(text(tree)).toBe('YOUR OWN SERVER');
    expect(tree.root.findAll(node => node.type === 'View')).toHaveLength(1);
  });

  it('makes a row a button only when it leads somewhere', async () => {
    const onPress = jest.fn();
    const tree = await render(
      <>
        <Ui.SettingsRow title="Opens" onPress={onPress} testID="opens" />
        <Ui.SettingsRow title="Plain" testID="plain" />
        <Ui.SettingsRow title="Off" onPress={onPress} disabled testID="off" />
      </>,
    );
    await tap(tree, 'opens');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pressable(tree, 'plain')).toBeUndefined();
    const touchable = testID => tree.root.findAll(node => node.props?.testID === testID && node.props.accessibilityRole === 'button')[0];
    expect(touchable('opens').props.accessibilityState).toEqual({ disabled: false });
    expect(touchable('off').props.accessibilityState).toEqual({ disabled: true });
    expect(touchable('plain')).toBeUndefined();
  });

  it('gives a switch the accent, a label and the handler', async () => {
    const onValueChange = jest.fn();
    const tree = await render(
      <Ui.SettingsSwitchRow title="Offline mode" note="No updates." value onValueChange={onValueChange} testID="row" switchTestID="sw" />,
    );
    const control = switchById(tree, 'sw');
    expect(control.props.value).toBe(true);
    expect(control.props.accessibilityLabel).toBe('Offline mode');
    expect(control.props.trackColor).toEqual({ false: '#30353B', true: '#FF812D' });
    control.props.onValueChange(false);
    expect(onValueChange).toHaveBeenCalledWith(false);
    expect(tree.root.findAll(node => node.props.testID === 'row' && node.type === 'View')).toHaveLength(1);
  });

  it('puts the overline and the title at the top of a page', async () => {
    const tree = await render(
      <Ui.SettingsScreen overline="MCR / SETTINGS / NETWORK" title="Marscoin server">
        <Ui.SettingsNote>Nothing to set up.</Ui.SettingsNote>
      </Ui.SettingsScreen>,
    );
    expect(text(tree)).toBe('MCR / SETTINGS / NETWORK\nMarscoin server\nNothing to set up.');
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'header' && node.type === 'Text')).toHaveLength(1);
  });

  it('gives every settings screen a dark bar with a back arrow and no bar title', () => {
    const theme = { colors: { foregroundColor: '#F5F1EB' }, closeImage: 1 };
    const options = Ui.settingsNavigation(() => 'Privacy')(theme)({ navigation: { getState: () => ({ index: 2 }) }, route: {} });
    expect(options.title).toBe('Privacy');
    expect(options.headerTitle).toBe('');
    expect(options.headerStyle).toEqual({ backgroundColor: '#080A0C' });
    expect(options.headerTintColor).toBe('#F5F1EB');
    expect(options.headerLeft).toBeUndefined();
    expect(options.headerRight).toBeUndefined();
    expect(options.headerLargeTitle).toBe(false);
  });
});

describe('Settings', () => {
  it('keeps every row, its destination and its test ID', async () => {
    const tree = await render(<Settings />);
    const output = text(tree);
    for (const words of ['MCR / SETTINGS', 'THIS APP', 'THE REPUBLIC', 'START OVER', 'The network, live']) expect(output).toContain(words);
    expect(output).not.toContain('Choose the Marscoin server');
    const routes = {
      NetworkLive: 'NetworkLive',
      GeneralSettings: 'GeneralSettings',
      Currency: 'Currency',
      SecurityButton: 'EncryptStorage',
      NetworkSettings: 'NetworkSettings',
      Tools: 'Tools',
    };
    for (const [testID, route] of Object.entries(routes)) {
      await tap(tree, testID);
      expect(mockNav.navigate).toHaveBeenLastCalledWith(route);
    }
    for (const testID of ['TermsOfService', 'ResetApp', 'DeleteApp']) expect(pressable(tree, testID)).toBeDefined();
  });
});

describe('General', () => {
  it('shows its groups in plain words and leads to the screens below it', async () => {
    const tree = await render(<GeneralSettings />);
    const output = text(tree);
    expect(output).toContain('MCR / SETTINGS\nGeneral');
    for (const words of ['On Launch', 'Privacy', 'Continuity', 'Advanced Mode', 'Older multi-part QR codes']) {
      expect(output).toContain(words);
    }
    expect(output).not.toMatch(/BlueWallet|Bitcoin|LNDHub/);
    await tap(tree, 'SettingsPrivacy');
    expect(mockNav.navigate).toHaveBeenLastCalledWith('SettingsPrivacy');
  });

  it('hides the start screen choice with a single wallet and Continuity off iOS', async () => {
    context.wallets = [{}];
    Platform.OS = 'android';
    const output = text(await render(<GeneralSettings />));
    expect(output).not.toContain('On Launch');
    expect(output).not.toContain('Continuity');
  });

  it('saves advanced mode and the older QR format through the same calls', async () => {
    const tree = await render(<GeneralSettings />);
    await act(async () => switchById(tree, 'AdvancedMode').props.onValueChange(true));
    expect(context.setIsAdvancedModeEnabled).toHaveBeenCalledWith(true);
    await act(async () => switchByLabel(tree, 'Older multi-part QR codes').props.onValueChange(true));
    expect(mockUr.setUseURv1).toHaveBeenCalledTimes(1);
    await act(async () => switchByLabel(tree, 'Older multi-part QR codes').props.onValueChange(false));
    expect(mockUr.clearUseURv1).toHaveBeenCalledTimes(1);
    switchByLabel(tree, 'Continuity').props.onValueChange(true);
    expect(context.setIsHandOffUseEnabledAsyncStorage).toHaveBeenCalledWith(true);
  });
});

describe('Privacy', () => {
  it('names this app and saves each switch where it was saved before', async () => {
    const tree = await render(<SettingsPrivacy />);
    const output = text(tree);
    expect(output).toContain('MCR / SETTINGS / GENERAL\nPrivacy');
    expect(output).toContain('Touch and hold the Martian Republic icon');
    expect(output).not.toMatch(/BlueWallet|Bitcoin/);
    expect(switchById(tree, 'ClipboardSwitch').props.value).toBe(true);
    await act(async () => switchById(tree, 'ClipboardSwitch').props.onValueChange(false));
    expect(mockClipboard.setReadClipboardAllowed).toHaveBeenCalledWith(false);
    await act(async () => switchById(tree, 'QuickActionsSwitch').props.onValueChange(false));
    expect(mockQuickActions.setEnabled).toHaveBeenCalledWith(false);
    await act(async () => switchByLabel(tree, 'Total balance in widgets').props.onValueChange(true));
    expect(mockWidgets.setBalanceDisplayAllowed).toHaveBeenCalledWith(true);
    await act(async () => switchByLabel(tree, 'Disable Analytics').props.onValueChange(true));
    expect(mockAnalytics.setOptOut).toHaveBeenCalledWith(true);
    expect(context.setDoNotTrack).toHaveBeenCalledWith(true);
    await tap(tree, 'PrivacySystemSettings');
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('leaves out shortcuts and widgets while storage is encrypted', async () => {
    context.isStorageEncrypted = jest.fn(async () => true);
    const tree = await render(<SettingsPrivacy />);
    expect(switchById(tree, 'QuickActionsSwitch')).toBeUndefined();
    expect(text(tree)).not.toContain('widgets');
  });
});

describe('Network', () => {
  it('says there is nothing to set up, and leads to the server and notifications', async () => {
    const tree = await render(<NetworkSettings />);
    const output = text(tree);
    expect(output).toContain('MCR / SETTINGS\nNetwork');
    expect(output).toContain('reconnects by itself');
    expect(output).not.toMatch(/Electrum|Choose/);
    await tap(tree, 'ElectrumSettings');
    expect(mockNav.navigate).toHaveBeenLastCalledWith('ElectrumSettings');
    await tap(tree, 'NotificationSettings');
    expect(mockNav.navigate).toHaveBeenLastCalledWith('NotificationSettings');
  });

  it('leaves notifications out where the phone cannot receive them', async () => {
    mockNotifications.isNotificationsCapable = false;
    const tree = await render(<NetworkSettings />);
    expect(pressable(tree, 'NotificationSettings')).toBeUndefined();
  });
});

describe('Marscoin server', () => {
  const props = () => ({ navigation: { navigate: jest.fn() }, route: { name: 'ElectrumSettings', params: {} } });

  it('shows the connected server and says the app looks after it', async () => {
    const tree = await render(<ElectrumSettings {...props()} />);
    const output = text(tree);
    expect(output).toContain('MCR / SETTINGS / NETWORK\nMarscoin server');
    expect(output).toContain('Connected\nelectrum1.marscoin.org:50002');
    expect(output).toContain('will move to another by itself');
    expect(output).toContain('Optional. Leave these empty and the app uses its own servers.');
    expect(output).not.toMatch(/BlueWallet|Bitcoin/);
    for (const testID of ['HostInput', 'PortInput', 'SSLPortInput', 'Save', 'ResetToDefault']) {
      expect(tree.root.findAll(node => node.props.testID === testID)).not.toHaveLength(0);
    }
  });

  it('reads as not connected, without failing, while there is no connection', async () => {
    mockElectrum.getConfig.mockRejectedValue(new Error('Electrum client is not connected'));
    const tree = await render(<ElectrumSettings {...props()} />);
    const output = text(tree);
    expect(output).toContain('Not Connected');
    expect(output).toContain('The app keeps trying by itself.');
    expect(output).not.toContain('undefined');
  });

  it('switches offline mode through the same calls and hides the server form', async () => {
    const tree = await render(<ElectrumSettings {...props()} />);
    await act(async () => switchById(tree, 'ElectrumConnectionEnabledSwitch').props.onValueChange(true));
    expect(mockElectrum.setDisabled).toHaveBeenCalledWith(true);
    expect(context.setIsElectrumDisabled).toHaveBeenCalledWith(true);
    expect(mockElectrum.forceDisconnect).toHaveBeenCalledTimes(1);
    const output = text(tree);
    expect(output).toContain('Offline mode is on');
    expect(output).not.toContain('YOUR OWN SERVER');
    await act(async () => switchById(tree, 'ElectrumConnectionEnabledSwitch').props.onValueChange(false));
    expect(mockElectrum.setDisabled).toHaveBeenLastCalledWith(false);
    expect(mockElectrum.connectMain).toHaveBeenCalledTimes(1);
  });

  it('tests a server of your own before saving it, and lists it afterwards', async () => {
    const tree = await render(<ElectrumSettings {...props()} />);
    const field = testID => tree.root.findAll(node => node.props.testID === testID && node.props.onChangeText)[0];
    await act(async () => field('HostInput').props.onChangeText(' my.server.example '));
    await act(async () => field('PortInput').props.onChangeText('50001'));
    await tap(tree, 'Save');
    await act(async () => {});
    // With no port saved before, a typed port is taken as the SSL port, as it always was.
    expect(mockElectrum.testConnection).toHaveBeenCalledWith('my.server.example', '', '50001');
    expect(mockStored.electrum_host).toBe('my.server.example');
    expect(mockStored.electrum_ssl_port).toBe('50001');
    expect(mockPresentAlert).toHaveBeenCalledWith({
      message: 'Your changes have been saved. You may need to restart Martian Republic for them to take effect.',
    });
    expect(text(tree)).toContain('SERVERS YOU HAVE USED\nClear\nmy.server.example:50001\nSelect');
  });

  it('opens the scanner with the same parameters', async () => {
    const screenProps = props();
    const tree = await render(<ElectrumSettings {...screenProps} />);
    await tap(tree, 'ElectrumScan');
    expect(mockRequestCamera).toHaveBeenCalledTimes(1);
    expect(screenProps.navigation.navigate).toHaveBeenCalledWith('ScanQRCodeRoot', {
      screen: 'ScanQRCode',
      params: { launchedBy: 'ElectrumSettings', onBarScanned: expect.any(Function), showFileImportButton: true },
    });
  });
});

describe('Tools', () => {
  it('describes each tool and opens it', async () => {
    const tree = await render(<Tools />);
    expect(text(tree)).toContain('Send a signed transaction to the Marscoin network.');
    for (const route of ['IsItMyAddress', 'Broadcast', 'GenerateWord']) {
      await tap(tree, route);
      expect(mockNav.navigate).toHaveBeenLastCalledWith(route);
    }
  });
});
