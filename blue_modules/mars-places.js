import { crypto } from 'bitcoinjs-lib';
import { MAP_BOX, PLACES } from './mars-places-data';

export { MAP_BOX };

// "35.7°S 36.6°W": latitude and longitude the way maps of Mars write them.
export function placeCoordinates({ lat, lon }) {
  const west = lon > 180;
  return `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${(west ? 360 - lon : lon).toFixed(1)}°${west ? 'W' : 'E'}`;
}

/**
 * A citizen's home on Mars, shown on their civic ID card: one of the places in mars-places-data.js, chosen from their
 * civic address, so it is the same on every phone and never changes. The address's SHA-256, read as one large number,
 * modulo the number of places. Null without an address.
 */
export function homePlace(address) {
  if (typeof address !== 'string' || !address) return null;
  let index = 0;
  for (const byte of crypto.sha256(Buffer.from(address, 'utf8'))) index = (index * 256 + byte) % PLACES.length;
  const place = PLACES[index];
  return { ...place, index, coordinates: placeCoordinates(place) };
}

// Where the map's box lands on a card of a given size when it covers the card ("slice"), and where the place is.
export function mapLayout(width, height, box = MAP_BOX) {
  const scale = Math.max(width / box.width, height / box.height);
  const x = (width - box.width * scale) / 2;
  const y = (height - box.height * scale) / 2;
  return { scale, x, y, spotX: x + (box.width / 2) * scale, spotY: y + box.height * box.spotY * scale };
}
