import {
  MIN_DIFFICULTY,
  assertHeaderWork,
  bitsToTarget,
  parseHeader,
  targetDifficulty,
  verifyHeaderChain,
} from '../../blue_modules/swap/mars-headers';

// Four consecutive Marscoin mainnet headers (heights 3598231 to 3598234),
// exactly as served by an Electrum server on 2026-11-09.
const fixture = require('./fixtures/mars-headers.json');
const heights = Object.keys(fixture).sort();
const real = heights.map(height => fixture[height]);

// Flip one byte at a position in a hex string.
const corrupt = (hex, byte) => {
  const buffer = Buffer.from(hex, 'hex');
  buffer[byte] ^= 0x01;
  return buffer.toString('hex');
};

describe('Marscoin proof of work', () => {
  it('accepts real merge-mined headers and their linkage', () => {
    const headers = verifyHeaderChain(real);
    expect(headers).toHaveLength(4);
    for (const header of headers) {
      expect(header.auxpow).not.toBeNull();
      // The node reported a difficulty of about 73,000 to 130,000 around these blocks.
      expect(targetDifficulty(bitsToTarget(header.bits))).toBeGreaterThan(50000);
      expect(targetDifficulty(bitsToTarget(header.bits))).toBeLessThan(200000);
      expect(MIN_DIFFICULTY).toBeLessThan(50000);
    }
    expect(headers[1].previous.equals(headers[0].hash)).toBe(true);
  });

  it('rejects a header whose contents were altered after mining', () => {
    // Changing the Marscoin merkle root changes the block hash the parent committed to.
    expect(() => assertHeaderWork(parseHeader(corrupt(real[0], 40)))).toThrow('lacks proof of work');
    // Changing the parent header breaks either its link to the coinbase or its hash.
    const parentStart = real[0].length / 2 - 80;
    expect(() => assertHeaderWork(parseHeader(corrupt(real[0], parentStart + 40)))).toThrow('lacks proof of work');
    expect(() => assertHeaderWork(parseHeader(corrupt(real[0], parentStart + 78)))).toThrow('lacks proof of work');
  });

  it('rejects headers that do not follow one another', () => {
    expect(() => verifyHeaderChain([real[0], real[2]])).toThrow('do not form a chain');
    expect(() => verifyHeaderChain([real[1], real[0]])).toThrow('do not form a chain');
  });

  it('rejects a block that claims an easy target', () => {
    const header = parseHeader(real[0]);
    // Valid work for this block, but judged against a floor above its difficulty.
    expect(() => assertHeaderWork(header, 10000000)).toThrow('too little proof of work');
    // Declaring a trivial target in the header itself is refused outright.
    const easy = Buffer.from(real[0], 'hex');
    easy.writeUInt32LE(0x1e0fffff, 72);
    expect(() => assertHeaderWork(parseHeader(easy.toString('hex')))).toThrow('too little proof of work');
  });

  it('rejects truncated or foreign headers', () => {
    expect(() => parseHeader(real[0].slice(0, 100))).toThrow('Invalid block header');
    expect(() => parseHeader(real[0].slice(0, real[0].length - 2))).toThrow('Invalid block header');
    const foreign = Buffer.from(real[0], 'hex');
    foreign.writeInt32LE(0x00620102, 0); // another merge-mined chain's ID
    expect(() => parseHeader(foreign.toString('hex'))).toThrow('another chain');
  });

  it('converts compact targets', () => {
    expect(bitsToTarget(0x1e0ffff0).toString(16)).toBe('ffff0' + '0'.repeat(54));
    expect(targetDifficulty(bitsToTarget(0x1d00ffff))).toBe(1);
    expect(() => bitsToTarget(0x1e800000)).toThrow('Invalid');
  });
});
