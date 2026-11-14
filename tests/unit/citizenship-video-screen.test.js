// Renders the liveness page of the application. The camera, the compressor and
// the phone's storage are stand-ins.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { firstName: 'A', lastName: 'B', displayName: 'ab', bio: '', photo: 'p' } }),
}));
jest.mock('react-native-linear-gradient', () => ({ children }) => children || null);
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native-fs', () => ({ stat: jest.fn(async () => ({ size: 1000 })) }));
jest.mock('react-native-compressor', () => ({ Video: { compress: jest.fn(async () => 'file:///tmp/small.mp4') } }));
const mockLaunch = jest.fn();
jest.mock('react-native-image-picker', () => ({ launchCamera: (...args) => mockLaunch(...args) }));
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => 'MUTfdz2DQmEVTkVAjWGTonFzdpSiHTNQSo') },
}));
const mockAlert = jest.fn();
jest.mock('../../components/MarsDialog', () => ({ marsAlert: (...args) => mockAlert(...args) }));
jest.mock('../../components/themes', () => ({ useTheme: () => ({ colors: {}, fonts: { regular: { fontFamily: 'System' } } }) }));
jest.mock('../../loc', () => ({}));
jest.mock('../../blue_modules/civic-api', () => ({ getCivicToken: jest.fn(async () => 't') }));
jest.mock('../../blue_modules/citizenship-draft', () => ({ saveCitizenshipDraft: jest.fn(), ipfsURL: x => x }));

const Screen = require('../../screen/citizen/joinGeneralPublicApplication2').default;
const text = tree => JSON.stringify(tree.toJSON());

describe('liveness page', () => {
  beforeEach(() => {
    mockLaunch.mockReset();
    mockAlert.mockReset();
  });

  it('shows the characters to read aloud and no longer asks for paper', async () => {
    let tree;
    await act(async () => {
      tree = TestRenderer.create(<Screen />);
    });
    expect(tree.root.findByProps({ testID: 'SpokenCode' }).props.children).toBe('N Q S o');
    expect(text(tree)).not.toMatch(/paper/i);
  });

  it('records with the system camera and shows the recording', async () => {
    mockLaunch.mockResolvedValue({ assets: [{ uri: 'file:///tmp/raw.mov' }] });
    let tree;
    await act(async () => {
      tree = TestRenderer.create(<Screen />);
    });
    await act(async () => {
      await tree.root.findByProps({ testID: 'RecordCitizenshipVideo' }).props.onPress();
    });
    expect(tree.root.findByType('Video').props.source).toEqual({ uri: 'file:///tmp/small.mp4' });
    expect(tree.root.findAllByProps({ testID: 'RecordCitizenshipVideoAgain' }).length).toBeGreaterThan(0);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('stays on the page with a plain message when the camera is refused', async () => {
    mockLaunch.mockResolvedValue({ errorCode: 'permission' });
    let tree;
    await act(async () => {
      tree = TestRenderer.create(<Screen />);
    });
    await act(async () => {
      await tree.root.findByProps({ testID: 'RecordCitizenshipVideo' }).props.onPress();
    });
    expect(mockAlert).toHaveBeenCalledWith('Recording not saved', expect.stringMatching(/Settings/));
    expect(tree.root.findAllByType('Video')).toHaveLength(0);
  });
});
