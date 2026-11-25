// The cut-corner panels and the status strip at the top of the home screen. The servers the strip asks are
// stand-ins: nothing here reaches a network.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn() };
let mockBlur = [];
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNav,
    // Runs the effect like a focused screen, and keeps its clean-up so a test can leave the screen.
    useFocusEffect: effect =>
      useEffect(() => {
        const cleanup = effect();
        mockBlur.push(cleanup);
        return cleanup;
      }, [effect]),
  };
});
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-svg', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }) => createElement(View, { testID: 'outline-svg' }, children),
    Path: ({ d, fill, stroke }) => createElement(View, { testID: 'outline', d, fill, stroke }),
  };
});

const MarsFrame = require('../../components/MarsFrame').default;
const { cutOutline, MarsButton } = require('../../components/MarsFrame');
const StatusStrip = require('../../components/StatusStrip').default;
const { civicColors } = require('../../components/CivicUi');

const host = (tree, testID) => tree.root.findAll(node => node.props.testID === testID && typeof node.type === 'string');
const textOf = node =>
  node
    .findAll(item => typeof item.type === 'string' && item.type === 'Text')
    .map(item => [].concat(item.props.children).join(''))
    .join(' ');

async function render(element) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

afterEach(() => {
  mockBlur.forEach(cleanup => cleanup && cleanup());
  mockBlur = [];
  mockNav.navigate.mockClear();
});

describe('cut-corner panels', () => {
  it('cut the top-left and bottom-right corners, half a pixel inside the edge', () => {
    expect(cutOutline(200, 100, 12)).toBe('M12 0.5H199.5V88L188 99.5H0.5V12Z');
    // The two cuts are the same size: both diagonals run 11.5 px across and 11.5 px down.
    expect(cutOutline(200, 100, 12, 0)).toBe('M12 0H200V88L188 100H0V12Z');
  });

  it('never cut more than half of a small panel', () => {
    expect(cutOutline(20, 16, 12, 0)).toBe('M8 0H20V8L12 16H0V8Z');
  });

  it('draw the outline once the panel knows its size, and lay out what is inside meanwhile', async () => {
    const tree = await render(
      <MarsFrame testID="panel">
        <MarsButton title="Go" onPress={() => {}} testID="go" />
      </MarsFrame>,
    );
    expect(host(tree, 'outline')).toHaveLength(0);
    expect(host(tree, 'go')).toHaveLength(1);
    await act(async () => host(tree, 'panel')[0].props.onLayout({ nativeEvent: { layout: { width: 300, height: 120 } } }));
    const outline = host(tree, 'outline');
    expect(outline).toHaveLength(1);
    expect(outline[0].props.d).toBe(cutOutline(300, 120, 12));
    expect(outline[0].props.stroke).toBe(civicColors.border);
  });

  it('are buttons when given onPress, and a disabled button cannot be pressed', async () => {
    const onPress = jest.fn();
    const tree = await render(
      <>
        <MarsButton title="Open" onPress={onPress} testID="open" />
        <MarsButton title="Closed" onPress={onPress} disabled testID="closed" />
      </>,
    );
    // What is drawn, below the MarsButton element itself (which holds the onPress it was given).
    const pressable = testID =>
      tree.root.findAll(node => node.type !== MarsButton && node.props?.testID === testID && node.props.onPress)[0];
    await act(async () => pressable('open').props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pressable('closed')).toBeUndefined();
  });
});

describe('the status strip', () => {
  // Stand-ins for the wallet server, the relay, the explorer and the Republic, answering when the test says so.
  const servers = answers => {
    const pending = {};
    const nodes = ['wallet', 'relay', 'explorer', 'republic'].map(id => ({
      id,
      calls: 0,
      probe() {
        this.calls += 1;
        const answer = answers[id];
        if (answer === 'later') return new Promise((resolve, reject) => (pending[id] = { resolve, reject }));
        if (answer instanceof Error) return Promise.reject(answer);
        return Promise.resolve(answer || {});
      },
    }));
    return { nodes, pending };
  };
  const reading = (tree, which) => textOf(host(tree, `StatusStrip-${which}`)[0]);

  it('shows the chain, the Republic and the Marscoin servers, from what they answer', async () => {
    const { nodes } = servers({ relay: { marsHeight: 3607908 }, explorer: { marsHeight: 3607909 } });
    const tree = await render(<StatusStrip nodes={nodes} />);
    expect(reading(tree, 'chain')).toBe('CHAIN 3,607,909');
    expect(reading(tree, 'republic')).toBe('REPUBLIC OK');
    expect(reading(tree, 'servers')).toBe('SERVERS 3/3');
    const strip = tree.root.findAll(node => node.props.testID === 'StatusStrip' && node.props.onPress)[0];
    expect(strip.props.accessibilityLabel).toBe(
      'Network: Marscoin block 3,607,909, the Republic is answering, 3 of 3 Marscoin servers answering. Opens the live network view.',
    );
  });

  it('says "…" until answers arrive, then fills each reading in', async () => {
    const { nodes, pending } = servers({ wallet: 'later', relay: 'later', explorer: 'later', republic: 'later' });
    const tree = await render(<StatusStrip nodes={nodes} />);
    expect(reading(tree, 'chain')).toBe('CHAIN …');
    expect(reading(tree, 'servers')).toBe('SERVERS …');
    await act(async () => pending.explorer.resolve({ marsHeight: 3607909 }));
    expect(reading(tree, 'chain')).toBe('CHAIN 3,607,909');
    expect(reading(tree, 'servers')).toBe('SERVERS …');
  });

  it('shows a server that does not answer in the warning colour, not red', async () => {
    const { nodes } = servers({ wallet: new Error('Electrum client is not connected'), explorer: { marsHeight: 3607909 } });
    const tree = await render(<StatusStrip nodes={nodes} />);
    expect(reading(tree, 'servers')).toBe('SERVERS 2/3');
    const value = host(tree, 'StatusStrip-servers')[0].findAll(node => node.type === 'Text')[1];
    expect([].concat(value.props.style).find(style => style && style.color).color).toBe(civicColors.warn);
  });

  it('opens the live network view when tapped', async () => {
    const { nodes } = servers({});
    const tree = await render(<StatusStrip nodes={nodes} />);
    await act(async () => tree.root.findAll(node => node.props.testID === 'StatusStrip' && node.props.onPress)[0].props.onPress());
    expect(mockNav.navigate).toHaveBeenCalledWith('NetworkLive');
  });

  it('asks again every minute while the screen is open, and stops when it is left', async () => {
    jest.useFakeTimers();
    try {
      const { nodes } = servers({});
      await render(<StatusStrip nodes={nodes} />);
      expect(nodes[0].calls).toBe(1);
      await act(async () => jest.advanceTimersByTime(60000));
      expect(nodes[0].calls).toBe(2);
      mockBlur.forEach(cleanup => cleanup && cleanup());
      mockBlur = [];
      await act(async () => jest.advanceTimersByTime(180000));
      expect(nodes[0].calls).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
