// Renders the scanner in each of its states and checks that what it reads is
// handed on exactly as before. The camera, the photo library and the clipboard
// are replaced; the screen's own handling is real.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
let mockParams = {};
let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
  useIsFocused: () => mockFocused,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-camera-kit', () => ({ Camera: 'Camera', CameraType: { Back: 'back', Front: 'front' } }));
const mockLaunchImageLibrary = jest.fn();
jest.mock('react-native-image-picker', () => ({ launchImageLibrary: (...args) => mockLaunchImageLibrary(...args) }));
const mockDecodeImage = jest.fn();
jest.mock('@remobile/react-native-qrcode-local-image', () => ({ decode: (...args) => mockDecodeImage(...args) }), { virtual: true });
jest.mock('../../blue_modules/fs', () => ({ showFilePickerAndReadFile: jest.fn() }));
const mockGranted = jest.fn();
jest.mock('../../helpers/scan-qr', () => ({ isCameraAuthorizationStatusGranted: () => mockGranted() }));
const mockOpenSettings = jest.fn();
jest.mock('../../class/camera', () => ({ openPrivacyDesktopSettings: (...args) => mockOpenSettings(...args) }));
const mockClipboard = jest.fn();
jest.mock('../../blue_modules/clipboard', () => () => ({ getClipboardContent: () => mockClipboard() }));
const mockHaptic = jest.fn();
jest.mock('../../blue_modules/hapticFeedback', () => ({
  __esModule: true,
  default: (...args) => mockHaptic(...args),
  HapticFeedbackTypes: { ImpactLight: 'impactLight' },
}));
const mockAlert = jest.fn();
jest.mock('../../components/MarsDialog', () => ({ marsAlert: (...args) => mockAlert(...args) }));
const mockPresentAlert = jest.fn();
jest.mock('../../components/Alert', () => ({ __esModule: true, default: (...args) => mockPresentAlert(...args) }));
jest.mock('../../loc', () => ({
  __esModule: true,
  default: {
    _: {
      close: 'Close',
      pick_image: 'Choose image from library',
      ok: 'OK',
      qr_custom_input_button: 'Tap 10 times to enter custom input',
      invalid_animated_qr_code_fragment: 'Invalid animated QR Code fragment. Please try again.',
    },
    send: { open_settings: 'Open Settings', scan_error: 'Scan error', qr_error_no_qrcode: 'No QR code in that image.' },
  },
}));
// Multi-part codes: a stand-in decoder that completes after `mockPartsNeeded`.
let mockPartsNeeded = 4;
jest.mock('../../blue_modules/ur', () => ({
  BlueURDecoder: class {
    constructor() {
      this.parts = 0;
    }

    receivePart(part) {
      if (part.includes('BROKEN')) throw new Error('bad part');
      this.parts++;
    }

    isComplete() {
      return this.parts >= mockPartsNeeded;
    }

    estimatedPercentComplete() {
      return this.parts / mockPartsNeeded;
    }

    toString() {
      return 'decoded-v2';
    }
  },
  extractSingleWorkload: ur => {
    const [index, total] = ur.split('/')[1].split('OF').map(Number);
    return [index, total];
  },
  decodeUR: () => Buffer.from('hello mars').toString('hex'),
}));

const ScanQRCode = require('../../screen/send/ScanQRCode').default;

const trees = [];
async function render() {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<ScanQRCode />);
  });
  // Let the permission and reduce-motion answers arrive.
  await act(async () => {});
  trees.push(tree);
  return tree;
}
const text = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''))
    .join('\n');
const byId = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type !== 'string');
const hostById = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type === 'string');
const tap = (tree, testID) =>
  act(async () => tree.root.findAll(node => node.props.testID === testID && node.props.onPress)[0].props.onPress());
const camera = tree => tree.root.findAll(node => node.type === 'Camera');
const scan = (tree, data) => act(async () => camera(tree)[0].props.onReadCode({ nativeEvent: { codeStringValue: data } }));

let onBarScanned;
let onDismiss;
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockPartsNeeded = 4;
  mockGranted.mockResolvedValue(true);
  mockClipboard.mockResolvedValue('');
  onBarScanned = jest.fn();
  onDismiss = jest.fn();
  mockParams = { onBarScanned, onDismiss, launchedBy: undefined, showFileImportButton: true };
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});

describe('Scanner', () => {
  it('shows the camera, the frame, the guidance and four labelled controls when the camera is allowed', async () => {
    const tree = await render();
    expect(camera(tree)).toHaveLength(1);
    expect(camera(tree)[0].props.scanBarcode).toBe(true);
    expect(camera(tree)[0].props.torchMode).toBe('off');
    expect(hostById(tree, 'ScanQrReticle')).toHaveLength(1);
    const output = text(tree);
    expect(output).toContain('MCR / SCAN');
    expect(output).toContain('Hold a Marscoin address or a payment code inside the frame.');
    for (const label of ['Close', 'Photo', 'Paste', 'Light']) expect(output).toContain(label);
    expect(hostById(tree, 'ScanQrCameraDenied')).toHaveLength(0);
    expect(hostById(tree, 'UrProgressBar')).toHaveLength(0);
    // The hidden entry used by end-to-end tests is still there.
    expect(byId(tree, 'ScanQrBackdoorButton')).not.toHaveLength(0);
  });

  it('explains itself and offers Settings, a photo and paste when the camera is refused', async () => {
    mockGranted.mockResolvedValue(false);
    const tree = await render();
    expect(camera(tree)).toHaveLength(0);
    expect(hostById(tree, 'ScanQrCameraDenied')).toHaveLength(1);
    const output = text(tree);
    expect(output).toContain('The camera is switched off');
    expect(output).toContain('Allow it in Settings');
    expect(output).not.toContain('Light');
    await tap(tree, 'ScanQrOpenSettings');
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(byId(tree, 'ScanQrPickImage')).not.toHaveLength(0);
    expect(byId(tree, 'ScanQrPaste')).not.toHaveLength(0);
    expect(byId(tree, 'ScanQrTorch')).toHaveLength(0);
  });

  it('hands a plain code to the caller once, with a tap of feedback', async () => {
    const tree = await render();
    await scan(tree, 'marscoin:MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1?amount=5');
    expect(onBarScanned).toHaveBeenCalledTimes(1);
    expect(onBarScanned).toHaveBeenCalledWith('marscoin:MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1?amount=5');
    expect(mockHaptic).toHaveBeenCalledWith('impactLight');
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('returns to the screen that opened it before handing the code on', async () => {
    mockParams = { ...mockParams, launchedBy: 'SendDetails' };
    const tree = await render();
    await scan(tree, 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
    expect(mockNav.navigate).toHaveBeenCalledWith({ name: 'SendDetails', params: {}, merge: true });
    expect(onBarScanned).toHaveBeenCalledWith('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
  });

  it('counts the parts of an older multi-part code and finishes on the last', async () => {
    const tree = await render();
    await scan(tree, 'UR:BYTES/1OF3/aaa');
    expect(hostById(tree, 'UrProgressBar')).toHaveLength(1);
    expect(text(tree)).toContain('Part 1 of 3');
    await scan(tree, 'UR:BYTES/2OF3/bbb');
    expect(text(tree)).toContain('Part 2 of 3');
    expect(hostById(tree, 'UrProgressFill')[0].props.style).toEqual(expect.arrayContaining([{ width: '67%' }]));
    expect(onBarScanned).not.toHaveBeenCalled();
    await scan(tree, 'UR:BYTES/3OF3/ccc');
    expect(onBarScanned).toHaveBeenCalledWith({ data: 'hello mars' });
  });

  it('shows how much of a newer multi-part code has been read', async () => {
    const tree = await render();
    await scan(tree, 'UR:CRYPTO-PSBT/1-4/aaa');
    expect(text(tree)).toContain('25% read');
    await scan(tree, 'UR:CRYPTO-PSBT/2-4/bbb');
    expect(text(tree)).toContain('50% read');
    expect(text(tree)).toContain('Keep the code in the frame.');
    await scan(tree, 'UR:CRYPTO-PSBT/3-4/ccc');
    await scan(tree, 'UR:CRYPTO-PSBT/4-4/ddd');
    expect(onBarScanned).toHaveBeenCalledWith({ data: 'decoded-v2' });
  });

  it('says so in a themed dialog when a part cannot be read', async () => {
    const tree = await render();
    await scan(tree, 'UR:CRYPTO-PSBT/BROKEN');
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockAlert.mock.calls[0][1]).toBe('Invalid animated QR Code fragment. Please try again.');
    expect(onBarScanned).not.toHaveBeenCalled();
  });

  it('closes by going back, or to the opener, and tells the caller', async () => {
    const tree = await render();
    await tap(tree, 'ScanQrClose');
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    mockParams = { ...mockParams, launchedBy: 'WalletsList' };
    const second = await render();
    await tap(second, 'ScanQrClose');
    expect(mockNav.navigate).toHaveBeenCalledWith({ name: 'WalletsList', params: {}, merge: true });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('reads a code out of a photo from the library', async () => {
    mockLaunchImageLibrary.mockImplementation((options, done) => done({ assets: [{ uri: 'file:///tmp/code.png' }] }));
    mockDecodeImage.mockImplementation((uri, done) => done(null, 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1'));
    const tree = await render();
    await tap(tree, 'ScanQrPickImage');
    expect(mockLaunchImageLibrary.mock.calls[0][0]).toMatchObject({ mediaType: 'photo', selectionLimit: 1 });
    expect(mockDecodeImage.mock.calls[0][0]).toBe('/tmp/code.png');
    expect(onBarScanned).toHaveBeenCalledWith('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
  });

  it('says so when the photo holds no code', async () => {
    mockLaunchImageLibrary.mockImplementation((options, done) => done({ assets: [{ uri: 'file:///tmp/cat.png' }] }));
    mockDecodeImage.mockImplementation((uri, done) => done(new Error('none')));
    const tree = await render();
    await tap(tree, 'ScanQrPickImage');
    expect(mockPresentAlert).toHaveBeenCalledWith({ message: 'No QR code in that image.' });
    expect(onBarScanned).not.toHaveBeenCalled();
    expect(camera(tree)).toHaveLength(1);
  });

  it('pastes the clipboard as if it had been scanned, and says so when it is empty', async () => {
    const tree = await render();
    await tap(tree, 'ScanQrPaste');
    expect(onBarScanned).not.toHaveBeenCalled();
    expect(text(tree)).toContain('Nothing to paste.');

    mockClipboard.mockResolvedValue('  MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1\n');
    await tap(tree, 'ScanQrPaste');
    expect(onBarScanned).toHaveBeenCalledWith('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
  });

  it('switches the light on and off', async () => {
    const tree = await render();
    await tap(tree, 'ScanQrTorch');
    expect(camera(tree)[0].props.torchMode).toBe('on');
    await tap(tree, 'ScanQrTorch');
    expect(camera(tree)[0].props.torchMode).toBe('off');
  });

  it('draws no moving line when the phone asks for reduced motion', async () => {
    const moving = async () => {
      const tree = await render();
      return tree.root.findAll(node => 'moving' in node.props)[0].props.moving;
    };
    expect(await moving()).toBe(true);
    AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
    expect(await moving()).toBe(false);
  });

  it('lets the hidden manual entry feed the same path', async () => {
    const tree = await render();
    for (let i = 0; i < 6; i++) await tap(tree, 'ScanQrBackdoorButton');
    const input = tree.root.findAll(node => node.props.testID === 'scanQrBackdoorInput' && node.props.onChangeText)[0];
    await act(async () => input.props.onChangeText('typed-code'));
    await tap(tree, 'scanQrBackdoorOkButton');
    expect(onBarScanned).toHaveBeenCalledWith('typed-code');
  });

  it('stops the camera while another screen is in front', async () => {
    mockFocused = false;
    const tree = await render();
    expect(camera(tree)).toHaveLength(0);
  });
});
