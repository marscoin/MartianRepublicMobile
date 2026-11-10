import { createBallotExplorer } from '../../blue_modules/voting/ballot-explorer';

const CID = 'Qmaow2cUCwQoYmKM37cgXLCFAtJFXz7h2xSrKCQDt6nrxw';
const dataHex = text => `6a${Buffer.from([text.length]).toString('hex')}${Buffer.from(text).toString('hex')}`;
const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

function explorer(routes) {
  const calls = [];
  const fetch = jest.fn(async (url, options) => {
    calls.push({ url, options });
    const path = url.replace('https://explore.marscoin.org', '');
    if (!(path in routes)) throw new Error('network down');
    return typeof routes[path] === 'function' ? routes[path](options) : answer(routes[path]);
  });
  return { api: createBallotExplorer({ fetch }), calls };
}

describe('Ballot address traffic through the explorer', () => {
  it('reads coins with exact amounts and marks unconfirmed ones', async () => {
    const { api, calls } = explorer({
      '/api/addr/Mballot/utxo': [
        { txid: 'ab'.repeat(32), vout: 4, amount: 0.1, confirmations: 6, height: 3598000 },
        { txid: 'cd'.repeat(32), vout: 0, amount: 0.30000001, confirmations: 0 },
      ],
    });
    expect(await api.unspent('Mballot')).toEqual([
      { txid: 'ab'.repeat(32), vout: 4, value: 10000000, height: 3598000 },
      { txid: 'cd'.repeat(32), vout: 0, value: 30000001, height: 0 },
    ]);
    expect(calls[0].url).toBe('https://explore.marscoin.org/api/addr/Mballot/utxo');
  });

  it('finds votes among the address history and ignores everything else', async () => {
    const { api } = explorer({
      '/api/txs?address=Mballot': {
        pagesTotal: 1,
        txs: [
          { txid: 'vote', confirmations: 3, vout: [{ scriptPubKey: { hex: dataHex(`PRN_${CID}`) } }] },
          { txid: 'pending', confirmations: 0, vout: [{ scriptPubKey: { hex: dataHex(`PRA_${CID}`) } }] },
          {
            txid: 'issuance',
            confirmations: 9,
            vout: [{ scriptPubKey: { hex: '76a914' + '00'.repeat(20) + '88ac' } }, { scriptPubKey: { hex: '00' } }],
          },
          { txid: 'other-record', confirmations: 9, vout: [{ scriptPubKey: { hex: dataHex(`GP_${CID}`) } }] },
          { txid: 'garbage', confirmations: 9, vout: [{ scriptPubKey: { hex: 'zz' } }] },
        ],
      },
    });
    expect(await api.votes('Mballot')).toEqual([
      { choice: 'no', cid: CID, txid: 'vote', confirmed: true },
      { choice: 'abstain', cid: CID, txid: 'pending', confirmed: false },
    ]);
  });

  it('broadcasts a vote and reports refusals and outages differently', async () => {
    const txid = 'ef'.repeat(32);
    let { api, calls } = explorer({ '/api/tx/send': { txid } });
    expect(await api.broadcast('0100')).toBe(txid);
    expect(calls[0].options).toMatchObject({ method: 'POST', body: JSON.stringify({ rawtx: '0100' }) });

    ({ api } = explorer({ '/api/tx/send': () => answer('bad-txns-inputs-missingorspent', 400) }));
    await expect(api.broadcast('0100')).rejects.toMatchObject({ status: 400 });
    ({ api } = explorer({}));
    await expect(api.broadcast('0100')).rejects.toThrow('unreachable');
    ({ api } = explorer({ '/api/tx/send': { result: 'ok' } }));
    await expect(api.broadcast('0100')).rejects.toThrow('did not accept');
  });

  it('checks whether a transaction is known', async () => {
    const txid = 'ef'.repeat(32);
    const { api } = explorer({ [`/api/tx/${txid}`]: { txid } });
    expect(await api.hasTransaction(txid)).toBe(true);
    expect(await api.hasTransaction('00'.repeat(32))).toBe(false);
  });

  it('refuses unexpected answers rather than treating them as empty', async () => {
    let { api } = explorer({ '/api/addr/Mballot/utxo': { error: 'nope' } });
    await expect(api.unspent('Mballot')).rejects.toThrow('unexpected');
    ({ api } = explorer({ '/api/txs?address=Mballot': [] }));
    await expect(api.votes('Mballot')).rejects.toThrow('unexpected');
  });
});
