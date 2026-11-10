import * as bitcoin from 'bitcoinjs-lib';
import { createEsplora } from '../../blue_modules/swap/esplora';
import { createBtcWallet, isBitcoinAddress } from '../../blue_modules/swap/btc-wallet';
import { coinsToAtomic, createMarsSwapChain } from '../../blue_modules/swap/mars-chain';
import {
  btcFeeProblem,
  btcWindowProblem,
  normalizeOffer,
  rankOffers,
  refundGapSeconds,
  refundOrderProblem,
} from '../../blue_modules/swap/safety';

const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

function services(routes) {
  const calls = [];
  const fetch = jest.fn(async (url, options) => {
    calls.push({ url, options });
    const [, base, path] = /^(https:\/\/[^/]+\/api)(.*)$/.exec(url);
    const handler = routes[base];
    if (!handler) throw new Error('network down');
    return handler(path, options);
  });
  return { fetch, calls };
}
const A = 'https://a.example/api';
const B = 'https://b.example/api';

describe('Swap timelock safety', () => {
  const fresh = { marsHeight: 1000, marsLocktime: 1234, btcHeight: 500, btcLocktime: 524 };

  it('matches the reference margins for a fresh offer', () => {
    expect(Math.round(refundGapSeconds(fresh))).toBe(6465);
    expect(refundOrderProblem(fresh)).toBeNull();
    expect(btcWindowProblem(fresh)).toBeNull();
  });

  it('refuses an offer that has aged past the one-hour refund gap', () => {
    expect(refundOrderProblem({ ...fresh, marsHeight: 1027 })).toBeNull();
    expect(refundOrderProblem({ ...fresh, marsHeight: 1028 })).toMatch(/too close/);
  });

  it('requires two hours of Bitcoin window and known heights', () => {
    expect(btcWindowProblem({ btcHeight: 512, btcLocktime: 524 })).toBeNull();
    expect(btcWindowProblem({ btcHeight: 513, btcLocktime: 524 })).toMatch(/Too little time/);
    expect(btcWindowProblem({ btcHeight: undefined, btcLocktime: 524 })).toMatch(/unavailable/);
    expect(refundOrderProblem({ ...fresh, marsHeight: 0 })).toMatch(/unavailable/);
  });

  it('refuses amounts that could not be refunded at the current fee', () => {
    expect(btcFeeProblem({ btcAmount: 6244, feeRate: 4 })).toBeNull();
    expect(btcFeeProblem({ btcAmount: 6244, feeRate: 37 })).toBeNull();
    expect(btcFeeProblem({ btcAmount: 6244, feeRate: 38 })).toMatch(/too small/);
    expect(btcFeeProblem({ btcAmount: 6244, feeRate: NaN })).toMatch(/unavailable/);
  });

  const raw = {
    offer_id: 'f1ecf45aca1a461c5ff58caefe9cc1ce',
    mars_amount_sat: 7050000000,
    btc_amount_sat: 6239,
    rate: 8.8e-7,
    maker_pubkey: '036fc84ac47d3598aa96b71a25a88c57815e4106fa43b9208b31b8e56692f48cde',
    payment_hash160: '098f2fa4564a59e412a4073c7cc2e61b52ffd044',
    mars_htlc_address: 'mars1qattackercontrolled',
    mars_locktime: 3598452,
    expires_at: 1794257085.9,
  };

  it('accepts a live-shaped offer and ignores relay-supplied address and rate', () => {
    expect(normalizeOffer(raw)).toEqual({
      id: raw.offer_id,
      marsAmount: 7050000000,
      btcAmount: 6239,
      makerPubkey: raw.maker_pubkey,
      paymentHash: raw.payment_hash160,
      marsLocktime: 3598452,
      expiresAt: 1794257085.9,
    });
  });

  it.each([
    ['maker_pubkey', '046fc84ac47d3598aa96b71a25a88c57815e4106fa43b9208b31b8e56692f48cde'],
    ['maker_pubkey', 'zz'],
    ['payment_hash160', '098f'],
    ['mars_amount_sat', 70.5],
    ['mars_amount_sat', '7050000000'],
    ['btc_amount_sat', 100],
    ['btc_amount_sat', -5],
    ['mars_locktime', 1794257085],
    ['mars_locktime', 1.5],
    ['offer_id', '../../etc'],
    ['expires_at', 'soon'],
  ])('drops an offer with a malformed %s', (field, value) => {
    expect(normalizeOffer({ ...raw, [field]: value })).toBeNull();
  });

  it('lists usable offers first, cheapest Marscoin first', () => {
    const offers = [
      { ...normalizeOffer(raw), id: 'expensive', btcAmount: 7000 },
      { ...normalizeOffer(raw), id: 'stale', btcAmount: 5000, marsLocktime: 3598300 },
      { ...normalizeOffer(raw), id: 'cheap' },
    ];
    const ranked = rankOffers(offers, { marsHeight: 3598218, btcHeight: 975000, feeRate: 4, now: 1794256000 });
    expect(ranked.map(offer => offer.id)).toEqual(['cheap', 'expensive', 'stale']);
    expect(ranked[2].problem).toMatch(/too close/);
    expect(ranked[0].problem).toBeNull();
  });
});

describe('Bitcoin services', () => {
  it('uses the lowest height when both services agree, and refuses when they do not', async () => {
    let w = services({ [A]: () => reply('975002'), [B]: () => reply('975001') });
    let esplora = createEsplora({ fetch: w.fetch, sources: [A, B] });
    expect(await esplora.agreedTipHeight()).toBe(975001);
    expect(await esplora.tipHeight()).toBe(975002);

    w = services({ [A]: () => reply('975010'), [B]: () => reply('975001') });
    esplora = createEsplora({ fetch: w.fetch, sources: [A, B] });
    await expect(esplora.agreedTipHeight()).rejects.toThrow('disagree');
  });

  it('will not choose a timelock from a single service', async () => {
    const w = services({ [A]: () => reply('975002') });
    const esplora = createEsplora({ fetch: w.fetch, sources: [A, B] });
    await expect(esplora.agreedTipHeight()).rejects.toThrow('disagree');
    expect(await esplora.tipHeight()).toBe(975002);
  });

  it('merges history so a claim seen by either service is found', async () => {
    const w = services({
      [A]: () => reply([{ txid: 'funding' }]),
      [B]: () => reply([{ txid: 'funding' }, { txid: 'claim' }]),
    });
    const esplora = createEsplora({ fetch: w.fetch, sources: [A, B] });
    expect((await esplora.transactions('bc1qexample')).map(tx => tx.txid)).toEqual(['funding', 'claim']);
  });

  it('fails over for reads and reports when nothing is reachable', async () => {
    const tx = new bitcoin.Transaction();
    tx.addInput(Buffer.alloc(32, 1), 0);
    tx.addOutput(Buffer.from('6a', 'hex'), 0);
    const w = services({ [B]: path => reply(path.endsWith('/hex') ? tx.toHex() : []) });
    const esplora = createEsplora({ fetch: w.fetch, sources: [A, B] });
    expect(await esplora.transactionHex(tx.getId())).toBe(tx.toHex());
    const offline = createEsplora({ fetch: services({}).fetch, sources: [A, B] });
    await expect(offline.transactions('bc1qexample')).rejects.toThrow('unreachable');
    await expect(offline.broadcast('00')).rejects.toThrow('unreachable');
  });

  it('refuses transaction bytes that do not hash to the requested ID', async () => {
    const tx = new bitcoin.Transaction();
    tx.addInput(Buffer.alloc(32, 1), 0);
    tx.addOutput(Buffer.from('6a', 'hex'), 0);
    const other = new bitcoin.Transaction();
    other.addInput(Buffer.alloc(32, 2), 0);
    other.addOutput(Buffer.from('6a', 'hex'), 0);
    // The first service substitutes another transaction; the second is honest.
    let w = services({ [A]: () => reply(other.toHex()), [B]: () => reply(tx.toHex()) });
    expect(await createEsplora({ fetch: w.fetch, sources: [A, B] }).transactionHex(tx.getId())).toBe(tx.toHex());
    w = services({ [A]: () => reply(other.toHex()), [B]: () => reply(other.toHex()) });
    await expect(createEsplora({ fetch: w.fetch, sources: [A, B] }).transactionHex(tx.getId())).rejects.toThrow();
  });

  it('reports an output as spent when either service has seen the spend', async () => {
    let w = services({
      [A]: () => reply({ spent: false }),
      [B]: () => reply({ spent: true, txid: 'ab'.repeat(32), status: { confirmed: true } }),
    });
    expect(await createEsplora({ fetch: w.fetch, sources: [A, B] }).outspend('cd'.repeat(32), 1)).toEqual({
      spent: true,
      txid: 'ab'.repeat(32),
      confirmed: true,
    });
    expect(w.calls[0].url).toBe(`${A}/tx/${'cd'.repeat(32)}/outspend/1`);
    w = services({ [A]: () => reply({ spent: false }), [B]: () => reply('not found', 404) });
    expect(await createEsplora({ fetch: w.fetch, sources: [A, B] }).outspend('cd'.repeat(32), 1)).toEqual({ spent: false });
    w = services({ [A]: () => reply('not found', 404), [B]: () => reply('not found', 404) });
    await expect(createEsplora({ fetch: w.fetch, sources: [A, B] }).outspend('cd'.repeat(32), 1)).rejects.toThrow('unreachable');
  });

  it('treats a transaction a service already has as broadcast', async () => {
    const w = services({ [A]: () => reply('Transaction already in block chain', 400), [B]: () => reply('boom', 500) });
    expect(await createEsplora({ fetch: w.fetch, sources: [A, B] }).broadcast('00')).toBe(true);
    expect(w.calls[0].options).toMatchObject({ method: 'POST', body: '00' });
  });

  it('calls a transaction rejected only when every service refused the transaction itself', async () => {
    let w = services({
      [A]: () => reply('sendrawtransaction RPC error: non-final', 400),
      [B]: () => reply('bad-txns-inputs-missingorspent', 400),
    });
    await expect(createEsplora({ fetch: w.fetch, sources: [A, B] }).broadcast('00')).rejects.toMatchObject({
      rejected: true,
      message: 'Bitcoin network rejected the transaction: sendrawtransaction RPC error: non-final',
    });
    // A rate limit, an outage, or one silent service leaves the outcome unknown.
    for (const routes of [
      { [A]: () => reply('non-final', 400) },
      { [A]: () => reply('Too Many Requests', 429), [B]: () => reply('non-final', 400) },
      { [A]: () => reply('Service Unavailable', 503), [B]: () => reply('Bad Gateway', 502) },
    ]) {
      w = services(routes);
      const failure = await createEsplora({ fetch: w.fetch, sources: [A, B] })
        .broadcast('00')
        .catch(error => error);
      expect(failure.rejected).toBeUndefined();
      expect(failure.message).toMatch(/unreachable/);
    }
  });

  it('uses the lower of two fee estimates, within plausible bounds', async () => {
    const fees = (first, second) =>
      createEsplora({
        fetch: services({
          ...(first === undefined
            ? {}
            : { [A]: path => (path === '/v1/fees/recommended' ? reply({ halfHourFee: first }) : reply({ 3: first })) }),
          ...(second === undefined ? {} : { [B]: () => reply({ 3: second, 6: 1 }) }),
        }).fetch,
        sources: [A, B],
      }).feeRate();
    expect(await fees(7, 9.2)).toBe(7);
    expect(await fees(100000, 4)).toBe(4);
    expect(await fees(7, undefined)).toBe(7);
    expect(await fees(undefined, 2.2)).toBe(3);
    expect(await fees(100000, 90000)).toBe(500);
    expect(await fees(0.2, 0.1)).toBe(1);
    await expect(fees(undefined, undefined)).rejects.toThrow('fee is unavailable');
  });
});

describe('Built-in Bitcoin wallet', () => {
  // BIP84 test vector: "abandon ... about".
  const seed = Buffer.from(
    '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4',
    'hex',
  );
  const utxo = (value, index = 0, n = 1) => ({ txid: String(n).repeat(64), vout: 0, value, confirmed: true, chain: 0, index });

  it('derives the standard native-segwit addresses for a recovery phrase', () => {
    const wallet = createBtcWallet({ seed, esplora: {} });
    expect(wallet.address(0, 0)).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(wallet.address(0, 1)).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(wallet.address(1, 0)).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });

  it('finds funds and hands out the next unused addresses', async () => {
    const wallet = createBtcWallet({ seed, esplora: {} });
    const funded = wallet.address(0, 1);
    const esplora = {
      addressStats: jest.fn(async address =>
        address === funded ? { transactions: 2, confirmed: 9000, unconfirmed: 500 } : { transactions: 0, confirmed: 0, unconfirmed: 0 },
      ),
      utxos: jest.fn(async () => [
        { txid: 'a'.repeat(64), vout: 1, value: 9000, confirmed: true },
        { txid: 'b'.repeat(64), vout: 0, value: 500, confirmed: false },
      ]),
    };
    const state = await createBtcWallet({ seed, esplora }).sync();
    expect(state).toMatchObject({ balance: 9500, confirmed: 9000, unconfirmed: 500 });
    expect(state.receiveAddress).toBe(wallet.address(0, 2));
    expect(state.changeAddress).toBe(wallet.address(1, 0));
    expect(state.utxos[0]).toMatchObject({ chain: 0, index: 1 });
    expect(esplora.utxos).toHaveBeenCalledTimes(1);
  });

  it('pays exactly the requested amount and returns change', () => {
    const wallet = createBtcWallet({ seed, esplora: {} });
    const to = 'bc1qvacw248n8qjszvjkxm27ctt4eq5aqamdvagvh7grjjcp978rugzqaf0g7k';
    const payment = wallet.createPayment({ utxos: [utxo(50000)], to, amount: 6244, feeRate: 5, changeAddress: wallet.address(1, 0) });
    expect(payment.tx.outs[0].value).toBe(6244);
    expect(bitcoin.address.fromOutputScript(payment.tx.outs[0].script)).toBe(to);
    expect(payment.tx.outs[1].value).toBe(50000 - 6244 - payment.fee);
    expect(payment.fee / payment.tx.virtualSize()).toBeGreaterThanOrEqual(5);
    expect(payment.fee / payment.tx.virtualSize()).toBeLessThan(5.5);
    expect(payment.txid).toBe(payment.tx.getId());
  });

  it('folds an uneconomical remainder into the fee instead of creating dust', () => {
    const wallet = createBtcWallet({ seed, esplora: {} });
    const payment = wallet.createPayment({
      utxos: [utxo(6700)],
      to: wallet.address(0, 5),
      amount: 6244,
      feeRate: 2,
      changeAddress: wallet.address(1, 0),
    });
    expect(payment.tx.outs).toHaveLength(1);
    expect(payment.fee).toBe(456);
  });

  it('sweeps the whole balance and explains shortfalls', () => {
    const wallet = createBtcWallet({ seed, esplora: {} });
    const sweep = wallet.createPayment({
      utxos: [utxo(4000, 0, 1), utxo(3000, 1, 2)],
      to: wallet.address(0, 5),
      feeRate: 2,
      changeAddress: wallet.address(1, 0),
      sweep: true,
    });
    expect(sweep.tx.outs).toHaveLength(1);
    expect(sweep.amount + sweep.fee).toBe(7000);
    expect(() =>
      wallet.createPayment({
        utxos: [utxo(3000)],
        to: wallet.address(0, 5),
        amount: 6244,
        feeRate: 2,
        changeAddress: wallet.address(1, 0),
      }),
    ).toThrow('Not enough Bitcoin');
    expect(() =>
      wallet.createPayment({ utxos: [utxo(300)], to: wallet.address(0, 5), feeRate: 2, changeAddress: wallet.address(1, 0), sweep: true }),
    ).toThrow('too small');
    expect(() =>
      wallet.createPayment({
        utxos: [utxo(30000)],
        to: 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1',
        amount: 1000,
        feeRate: 2,
        changeAddress: wallet.address(1, 0),
      }),
    ).toThrow('not a valid Bitcoin address');
  });

  it('recognises Bitcoin addresses', () => {
    expect(isBitcoinAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toBe(true);
    expect(isBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    expect(isBitcoinAddress('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1')).toBe(false);
    expect(isBitcoinAddress('mars1qn3whadz4r8w2jpfn0wrp5dg4grccuyxzp5sxxl5khxp579eegexqm9anzr')).toBe(false);
  });
});

describe('Marscoin swap relay and chain', () => {
  it('converts explorer amounts exactly', () => {
    expect(coinsToAtomic('70.50000000')).toBe(7050000000);
    expect(coinsToAtomic('0.09765625')).toBe(9765625);
    expect(coinsToAtomic('0.1')).toBe(10000000);
    expect(coinsToAtomic('3')).toBe(300000000);
    expect(() => coinsToAtomic('1e3')).toThrow('Invalid amount');
    expect(() => coinsToAtomic('-1')).toThrow('Invalid amount');
  });

  it('filters malformed offers from the relay', async () => {
    const request = jest.fn(async () => [
      { offer_id: 'nope' },
      null,
      {
        offer_id: 'ab'.repeat(16),
        mars_amount_sat: 7050000000,
        btc_amount_sat: 6239,
        maker_pubkey: '02' + 'ab'.repeat(32),
        payment_hash160: 'cd'.repeat(20),
        mars_locktime: 3598452,
        expires_at: 1794257085,
      },
    ]);
    const offers = await createMarsSwapChain({ request }).offers();
    expect(offers).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('atomicswap.get_offers', []);
  });

  it('separates permanent relay refusals from temporary failures', async () => {
    const refuse = message => createMarsSwapChain({ request: async () => Promise.reject(new Error(message)) }).accept('id', {});
    await expect(refuse('offer already taken')).rejects.toMatchObject({ final: true });
    await expect(refuse('daily limit for accepting offers reached')).rejects.toMatchObject({ final: true });
    await expect(refuse('you already have a swap in progress; finish it before accepting another')).rejects.toMatchObject({ final: true });
    await expect(refuse('socket hang up')).rejects.toMatchObject({ final: false });
    await expect(createMarsSwapChain({ request: async () => null }).accept('id', {})).rejects.toMatchObject({ final: false });
    expect(await createMarsSwapChain({ request: async () => true }).accept('id', {})).toBe(true);
  });

  it('reads one output from the explorer and rejects a different transaction', async () => {
    const txid = 'ab'.repeat(32);
    const body = { txid, confirmations: 3, vout: [{ value: '70.50000000', n: 0, scriptPubKey: { hex: '0020aa' } }] };
    const fetch = jest.fn(async () => ({ ok: true, json: async () => body }));
    const chain = createMarsSwapChain({ request: jest.fn(), fetch });
    expect(await chain.explorerOutput(txid, 0)).toEqual({ confirmations: 3, value: 7050000000, scriptHex: '0020aa' });
    expect(fetch.mock.calls[0][0]).toBe(`https://explore.marscoin.org/api/tx/${txid}`);
    await expect(chain.explorerOutput('cd'.repeat(32), 0)).rejects.toThrow('unexpected');
    await expect(chain.explorerOutput(txid, 4)).rejects.toThrow('unexpected');
  });

  it('agrees a Marscoin height only when the relay and the second node are close, taking the higher', async () => {
    const chainAt = (relay, node) =>
      createMarsSwapChain({
        request: async () => ({ height: relay }),
        fetch: async () =>
          node === null ? Promise.reject(new Error('down')) : { ok: true, json: async () => ({ info: { blocks: node } }) },
      });
    expect(await chainAt(3598218, 3598220).agreedTipHeight()).toBe(3598220);
    expect(await chainAt(3598221, 3598218).agreedTipHeight()).toBe(3598221);
    // A relay reporting an old block must not be believed.
    await expect(chainAt(3597989, 3598218).agreedTipHeight()).rejects.toThrow('disagree');
    await expect(chainAt(3598218, null).agreedTipHeight()).rejects.toThrow('unreachable');
    await expect(chainAt(3598218, undefined).agreedTipHeight()).rejects.toThrow('disagree');
  });

  it('refuses Marscoin transaction bytes that do not hash to the requested ID', async () => {
    const tx = new bitcoin.Transaction();
    tx.addInput(Buffer.alloc(32, 1), 0);
    tx.addOutput(Buffer.from('6a', 'hex'), 0);
    const chain = createMarsSwapChain({ request: async () => tx.toHex() });
    expect(await chain.transactionHex(tx.getId())).toBe(tx.toHex());
    await expect(chain.transactionHex('ab'.repeat(32))).rejects.toThrow('Invalid response');
  });

  it('broadcasts through a second connection as well, and succeeds if either accepts', async () => {
    const txid = 'ab'.repeat(32);
    const elsewhere = jest.fn(async () => txid);
    const swallowing = createMarsSwapChain({ request: async () => Promise.reject(new Error('refused')), broadcastElsewhere: elsewhere });
    expect(await swallowing.broadcast('00')).toBe(txid);
    expect(elsewhere).toHaveBeenCalledWith('00');
    const both = createMarsSwapChain({
      request: async () => 'error',
      broadcastElsewhere: async () => Promise.reject(new Error('offline')),
    });
    await expect(both.broadcast('00')).rejects.toThrow('did not accept');
  });

  it('validates heights and broadcast results', async () => {
    await expect(createMarsSwapChain({ request: async () => ({ height: 0 }) }).tipHeight()).rejects.toThrow('unavailable');
    expect(await createMarsSwapChain({ request: async () => ({ height: 3598218, hex: '00' }) }).tipHeight()).toBe(3598218);
    await expect(createMarsSwapChain({ request: async () => 'error: bad-txns' }).broadcast('00')).rejects.toThrow('did not accept');
  });
});
