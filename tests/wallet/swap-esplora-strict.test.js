import { createEsplora } from '../../blue_modules/swap/esplora';

// Two services, each scripted per path. A missing path answers 404.
function services(first, second) {
  const tables = { 'https://a.example': first, 'https://b.example': second };
  const fetch = async url => {
    const base = Object.keys(tables).find(key => url.startsWith(key));
    const answer = tables[base][url.slice(base.length)];
    if (answer === undefined) return { ok: false, status: 404, text: async () => 'Transaction not found' };
    if (answer instanceof Error) throw answer;
    return { ok: true, status: 200, text: async () => (typeof answer === 'string' ? answer : JSON.stringify(answer)) };
  };
  return createEsplora({ fetch, sources: Object.keys(tables) });
}

const TXID = 'ab'.repeat(32);
const confirmed = height => ({ confirmed: true, block_height: height });

describe('checks that every Bitcoin service must pass', () => {
  it('counts a payment as confirmed only when both report the same block', async () => {
    const path = `/tx/${TXID}/status`;
    expect(await services({ [path]: confirmed(975002) }, { [path]: confirmed(975002) }).confirmedHeight(TXID)).toBe(975002);
    expect(await services({ [path]: confirmed(975002) }, { [path]: confirmed(975003) }).confirmedHeight(TXID)).toBe(0);
    expect(await services({ [path]: confirmed(975002) }, { [path]: { confirmed: false } }).confirmedHeight(TXID)).toBe(0);
  });

  it('does not let one service vouch for a payment the other has never seen', async () => {
    const path = `/tx/${TXID}/status`;
    expect(await services({ [path]: confirmed(975002) }, {}).confirmedHeight(TXID)).toBe(0);
    expect(await services({ [path]: confirmed(975002) }, { [path]: new Error('offline') }).confirmedHeight(TXID)).toBe(0);
    expect(await services({}, {}).confirmedHeight(TXID)).toBe(0);
  });

  it('calls an output unspent only when both say so', async () => {
    const path = `/tx/${TXID}/outspend/0`;
    expect(await services({ [path]: { spent: false } }, { [path]: { spent: false } }).unspentEverywhere(TXID, 0)).toBe(true);
    expect(await services({ [path]: { spent: false } }, { [path]: { spent: true, txid: 'cd'.repeat(32) } }).unspentEverywhere(TXID, 0)).toBe(false);
    expect(await services({ [path]: { spent: false } }, {}).unspentEverywhere(TXID, 0)).toBe(false);
  });

  it('takes the higher fee estimate when asked for an urgent rate, and the lower otherwise', async () => {
    const api = services({ '/v1/fees/recommended': { halfHourFee: 3 } }, { '/fee-estimates': { 3: 9.2 } });
    expect(await api.feeRate()).toBe(3);
    expect(await api.feeRate({ highest: true })).toBe(10);
  });
});
