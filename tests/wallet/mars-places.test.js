import assert from 'assert';
import { homePlace, MAP_BOX, mapLayout, placeCoordinates } from '../../blue_modules/mars-places';
import { PLACES } from '../../blue_modules/mars-places-data';

describe('a citizen’s home on Mars', () => {
  it('is chosen from the civic address, the same every time', () => {
    // The identity in the App Store screenshots; also what the design mock-ups (Python) chose for it.
    const place = homePlace('MSzU92871vc6B9ut6E7Y3aB6iQ1u4F2k9L');
    assert.strictEqual(place.name, 'Hale Crater');
    assert.strictEqual(place.index, 20);
    assert.strictEqual(place.coordinates, '35.7°S 36.6°W');
    assert.deepStrictEqual(homePlace('MSzU92871vc6B9ut6E7Y3aB6iQ1u4F2k9L'), place);
  });

  it('spreads addresses over all the places', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(homePlace(`M${i}address`).index);
    assert.strictEqual(seen.size, PLACES.length);
  });

  it('is nothing without an address', () => {
    assert.strictEqual(homePlace(''), null);
    assert.strictEqual(homePlace(undefined), null);
  });

  it('keeps the list of places as it was published: changing it would move every citizen', () => {
    assert.deepStrictEqual(
      PLACES.map(place => place.name),
      [
        'Jezero Crater',
        'Gale Crater',
        'Olympus Mons',
        'Melas Chasma',
        'Arsia Mons',
        'Pavonis Mons',
        'Ascraeus Mons',
        'Elysium Mons',
        'Noctis Labyrinthus',
        'Candor Chasma',
        'Hebes Chasma',
        'Gusev Crater',
        'Holden Crater',
        'Eberswalde Crater',
        'Mawrth Vallis',
        'Nili Fossae',
        'Kasei Valles',
        'Ares Vallis',
        'Tharsis Tholus',
        'Apollinaris Mons',
        'Hale Crater',
        'Huygens Crater',
        'Schiaparelli Crater',
        'Ius Chasma',
      ],
    );
  });

  it('has a contour map for every place, small enough to ship', () => {
    for (const place of PLACES) {
      for (const path of [place.major, place.minor]) {
        assert.match(path, /^M[-\d lM]+$/, place.name);
      }
      assert.ok(place.major.length > 200, `${place.name} has major contour lines`);
      assert.ok(place.major.length + place.minor.length < 40000, `${place.name} is under 40 KB`);
    }
  });

  it('writes coordinates the way maps of Mars do', () => {
    assert.strictEqual(placeCoordinates({ lat: 18.38, lon: 77.58 }), '18.4°N 77.6°E');
    assert.strictEqual(placeCoordinates({ lat: -5.4, lon: 137.8 }), '5.4°S 137.8°E');
    assert.strictEqual(placeCoordinates({ lat: 18.65, lon: 226.2 }), '18.6°N 133.8°W');
  });

  it('covers a card of any shape with the map and finds the place on it', () => {
    // Wider than the map's box: scaled to the width, cropped top and bottom.
    const wide = mapLayout(1280, 500);
    assert.strictEqual(wide.scale, 2);
    assert.strictEqual(wide.x, 0);
    assert.strictEqual(wide.y, (500 - MAP_BOX.height * 2) / 2);
    assert.strictEqual(wide.spotX, 640);
    assert.strictEqual(wide.spotY, wide.y + MAP_BOX.height * MAP_BOX.spotY * 2);
    // A phone's card: taller than the box's shape, so scaled to the height and cropped at the sides.
    const card = mapLayout(342, 272);
    assert.strictEqual(card.scale, 272 / MAP_BOX.height);
    assert.strictEqual(card.y, 0);
    assert.strictEqual(card.spotX, 171);
    assert.strictEqual(Math.round(card.spotY * 10) / 10, 108.8);
  });
});
