import { networkNodes, networkSummary, probeNode, pulseDuration, ringPositions } from '../../blue_modules/network-status';

const answers = {
  'https://explore.marscoin.org/api/status': { info: { blocks: 3598750 } },
  'https://martianrepublic.org/api/congress/proposals?per_page=1': { total: 17, data: [] },
  'https://swaps.marscoin.org/api/snapshot': { mode: 'live', maker: { offers: [{}, {}, {}] } },
  'https://mempool.space/api/blocks/tip/height': '975330',
  'https://blockstream.info/api/blocks/tip/height': '975330',
};
const fetch = async url => {
  if (!(url in answers)) return { ok: false, status: 503 };
  const body = answers[url];
  return { ok: true, status: 200, json: async () => body, text: async () => String(body) };
};
const nodes = (overrides = {}) =>
  networkNodes({ fetch, relayTip: async () => 3598750, walletServer: async () => ({ host: 'electrum.marscoin.org' }), ...overrides });

describe('live network view', () => {
  it('asks every service a real question and reports what it said', async () => {
    const results = await Promise.all(nodes().map(node => probeNode(node)));
    expect(results.every(result => result.ok && result.ms >= 1)).toBe(true);
    const by = Object.fromEntries(results.map(result => [result.id, result]));
    expect(by.explorer).toMatchObject({ marsHeight: 3598750, detail: 'Block 3,598,750' });
    expect(by.relay.marsHeight).toBe(3598750);
    expect(by.mempool.btcHeight).toBe(975330);
    expect(by.maker.detail).toBe('3 offers open');
    expect(by.republic.detail).toBe('17 proposals on record');
    expect(by.wallet.host).toBe('electrum.marscoin.org');
  });

  it('reports a failing service without failing the others', async () => {
    const list = nodes({
      relayTip: async () => {
        throw new Error('The Marscoin swap relay did not answer in time.');
      },
    });
    const results = await Promise.all(list.map(node => probeNode(node)));
    const relay = results.find(result => result.id === 'relay');
    expect(relay).toEqual({ id: 'relay', ok: false, ms: null, error: 'The Marscoin swap relay did not answer in time.' });
    expect(results.filter(result => result.ok)).toHaveLength(list.length - 1);
  });

  it('gives up on a service that never answers', async () => {
    const hung = { id: 'x', probe: () => new Promise(() => {}) };
    expect(await probeNode(hung, { timeout: 20 })).toMatchObject({ ok: false, error: 'No answer in time.' });
  });

  it('sums the picture up in one line', () => {
    expect(networkSummary([]).tone).toBe('idle');
    expect(networkSummary([{ ok: true }, { ok: true }])).toEqual({ tone: 'good', text: 'All 2 connections are answering.' });
    expect(networkSummary([{ ok: true }, { ok: false }])).toEqual({ tone: 'warn', text: '1 of 2 connections are answering.' });
    expect(networkSummary([{ ok: false }]).tone).toBe('bad');
  });

  it('sends quicker pulses to quicker servers, within limits', () => {
    expect(pulseDuration(0)).toBe(0);
    expect(pulseDuration(40)).toBe(700);
    expect(pulseDuration(400)).toBeCloseTo(1380, 5);
    expect(pulseDuration(9000)).toBe(3200);
  });

  it('places nodes evenly on a ring inside the canvas', () => {
    const ring = ringPositions(7);
    expect(ring).toHaveLength(7);
    expect(ring[0].x).toBeCloseTo(0.5, 6);
    expect(ring[0].y).toBeCloseTo(0.12, 6);
    ring.forEach(point => {
      expect(point.x).toBeGreaterThan(0.05);
      expect(point.x).toBeLessThan(0.95);
      expect(point.y).toBeGreaterThan(0.05);
      expect(point.y).toBeLessThan(0.95);
    });
  });
});
