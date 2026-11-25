// The civic ID card on the home screen: the citizen over the contour map of their home on Mars.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-svg', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  const element = name => props => createElement(View, { testID: `svg-${name}`, ...props });
  return {
    __esModule: true,
    default: element('Svg'),
    ClipPath: element('ClipPath'),
    Defs: element('Defs'),
    G: element('G'),
    Line: element('Line'),
    LinearGradient: element('LinearGradient'),
    Path: element('Path'),
    Rect: element('Rect'),
    Stop: element('Stop'),
  };
});

const CivicCard = require('../../components/CivicCard').default;
const { homePlace } = require('../../blue_modules/mars-places');

const ADDRESS = 'MSzU92871vc6B9ut6E7Y3aB6iQ1u4F2k9L';
const hosts = (tree, testID) => tree.root.findAll(node => node.props?.testID === testID && typeof node.type === 'string');
const texts = tree =>
  tree.root
    .findAll(node => node.type === 'Text')
    .map(node => [].concat(node.props.children).join(''))
    .join(' | ');

async function card(props = {}) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(
      <CivicCard
        name="Fellow Martian"
        status="YOUR REPUBLIC IDENTITY"
        address={ADDRESS}
        avatar={{ uri: 'x' }}
        onPress={() => {}}
        {...props}
      />,
    );
  });
  return tree;
}
// The card learns its size, then draws the map; the place's tag learns its own width, then takes its side.
async function layOut(tree, width, height, tagWidth = 150) {
  await act(async () => hosts(tree, 'CivicCard-map')[0].props.onLayout({ nativeEvent: { layout: { width, height } } }));
  await act(async () => hosts(tree, 'CivicCard-tag')[0].props.onLayout({ nativeEvent: { layout: { width: tagWidth, height: 22 } } }));
  return hosts(tree, 'CivicCard-tag')[0];
}

describe('the civic ID card', () => {
  it('names the citizen, their address, its code and their home on Mars', async () => {
    const tree = await card();
    const shown = texts(tree);
    expect(shown).toContain('CIVIC IDENTITY');
    expect(shown).toContain('CIV-MSZU9287');
    expect(shown).toContain('Fellow Martian');
    expect(shown).toContain('YOUR REPUBLIC IDENTITY');
    expect(shown).toContain(ADDRESS);
    expect(shown).toContain('35.7°S 36.6°W');
    const button = tree.root.findAll(node => node.props?.testID === 'CivicCard' && node.props.onPress)[0];
    expect(button.props.accessibilityLabel).toBe('Open your civic ID. Fellow Martian, your republic identity. Home on Mars: Hale Crater.');
  });

  it('draws the contour lines of that place once it knows its size, with a crosshair and the place’s name', async () => {
    const tree = await card();
    expect(hosts(tree, 'svg-Path').filter(path => path.props.d === homePlace(ADDRESS).major)).toHaveLength(0);
    await layOut(tree, 342, 272);
    const paths = hosts(tree, 'svg-Path').map(path => path.props.d);
    expect(paths).toContain(homePlace(ADDRESS).major);
    expect(paths).toContain(homePlace(ADDRESS).minor);
    expect(hosts(tree, 'svg-Line')).toHaveLength(2);
    expect(texts(tree)).toContain('HOME · HALE CRATER');
  });

  it('puts the place’s name on the side of the crosshair that has room', async () => {
    const tree = await card();
    const roomy = await layOut(tree, 400, 272, 150);
    const left = [].concat(roomy.props.style).reduce((value, style) => (style && 'left' in style ? style.left : value), null);
    expect(left).toBeGreaterThan(200); // right of the crosshair at 200
    const narrow = await card();
    const tight = await layOut(narrow, 300, 272, 170);
    const leftNarrow = [].concat(tight.props.style).reduce((value, style) => (style && 'left' in style ? style.left : value), null);
    expect(leftNarrow).toBeLessThan(150); // left of the crosshair at 150
  });

  it('opens the civic ID when tapped', async () => {
    const onPress = jest.fn();
    const tree = await card({ onPress });
    await act(async () => tree.root.findAll(node => node.props?.testID === 'CivicCard' && node.props.onPress)[0].props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
