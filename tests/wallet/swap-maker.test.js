import * as bitcoin from 'bitcoinjs-lib';
import { MakerState, acceptanceProblem, buildLockTx, createMakerEngine, makerContracts, secretFor } from '../../blue_modules/swap/maker';
import { BTC_NETWORK, MARS_NETWORK, buildClaimTx, buildRefundTx, extractPreimage, htlcAddress, spendsOutpoint } from '../../blue_modules/swap/htlc';
import { normalizeOffer, rankOffers, MARS_SPEND_FEE } from '../../blue_modules/swap/safety';

// A simulated pair of chains and relay, with a scripted taker. All keys are synthetic.
const COIN = 100000000;
const walletKey = Buffer.alloc(32, 7);
const walletPair = bitcoin.ECPair.fromPrivateKey(walletKey, { network: MARS_NETWORK });
const WALLET_ADDRESS = bitcoin.payments.p2pkh({ pubkey: walletPair.publicKey, network: MARS_NETWORK }).address;
const BTC_DESTINATION = 'bc1qxtts9kqcd22ck5upvrhz9zs3geaufp66my95e6';
const takerKey = Buffer.alloc(32, 4);
const taker = bitcoin.ECPair.fromPrivateKey(takerKey);
const TAKER_MARS = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
const TAKER_BTC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const id = tx => tx.getId();
const outpoint = input => `${Buffer.from(input.hash).reverse().toString('hex')}:${input.index}`;

function world({ coins = [900 * COIN] } = {}) {
  const state = {
    time: 1794000000000,
    marsHeight: 3598300,
    btcHeight: 975000,
    feeRate: 4,
    offers: new Map(),
    acceptances: new Map(),
    cancels: [],
    cancelWorks: true,
    reports: [],
    marsTxs: new Map(), // txid -> { tx, height }
    marsBroadcasts: [],
    marsDown: false,
    btcTxs: new Map(), // txid -> { tx, height }
    btcBroadcasts: [],
    btcSecondSourceLag: false,
    saved: [],
    counter: 0,
  };
  const records = new Map();
  const store = {
    all: async () => [...records.values()],
    save: async record => {
      records.set(record.id, record);
      state.saved.push(JSON.parse(JSON.stringify(record)));
    },
    remove: async key => {
      records.delete(key);
    },
  };

  // The wallet's coins: ordinary pay-to-address outputs, already confirmed.
  coins.forEach((value, index) => {
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 100 + index), 0);
    tx.addOutput(bitcoin.address.toOutputScript(WALLET_ADDRESS, MARS_NETWORK), value);
    state.marsTxs.set(id(tx), { tx, height: state.marsHeight - 10 });
  });

  const spentOn = (txs, txid, vout) => [...txs.values()].find(({ tx }) => tx.ins.some(input => outpoint(input) === `${txid}:${vout}`));
  const unspentPaying = (txs, script) =>
    [...txs.values()].flatMap(({ tx, height }) =>
      tx.outs
        .map((out, vout) => ({ out, vout }))
        .filter(({ out, vout }) => out.script.equals(script) && !spentOn(txs, id(tx), vout))
        .map(({ out, vout }) => ({ txid: id(tx), vout, value: out.value, height })),
    );

  const chain = {
    agreedTipHeight: async () => state.marsHeight,
    postOffer: jest.fn(async offer => {
      state.offers.set(offer.offer_id, offer);
      return true;
    }),
    cancelOffer: jest.fn(async offerId => {
      state.cancels.push(offerId);
      if (!state.cancelWorks) return false;
      state.offers.delete(offerId);
      return true;
    }),
    acceptance: async offerId => state.acceptances.get(offerId) || null,
    reportAbandoned: jest.fn(async offerId => {
      state.reports.push(offerId);
      return true;
    }),
    unspent: async script => unspentPaying(state.marsTxs, script),
    broadcast: jest.fn(async hex => {
      if (state.marsDown) throw new Error('The Marscoin network did not accept the transaction.');
      const tx = bitcoin.Transaction.fromHex(hex);
      if (tx.locktime > state.marsHeight) throw new Error('non-final');
      for (const input of tx.ins) {
        const [txid, vout] = outpoint(input).split(':');
        const spender = spentOn(state.marsTxs, txid, Number(vout));
        if (spender && id(spender.tx) !== id(tx)) throw new Error('inputs missing or spent');
      }
      state.marsBroadcasts.push(hex);
      if (!state.marsTxs.has(id(tx))) state.marsTxs.set(id(tx), { tx, height: 0 });
      return id(tx);
    }),
    explorerOutput: async (txid, vout) => {
      const found = state.marsTxs.get(txid);
      if (!found) throw new Error('unknown');
      return { confirmations: found.height ? state.marsHeight - found.height + 1 : 0, value: found.tx.outs[vout].value };
    },
  };

  const btc = {
    agreedTipHeight: async () => state.btcHeight,
    feeRate: async () => state.feeRate,
    transactions: async address =>
      [...state.btcTxs.values()]
        .filter(({ tx }) => tx.outs.some(out => out.script.equals(bitcoin.address.toOutputScript(address, BTC_NETWORK))))
        .map(({ tx, height }) => ({ txid: id(tx), status: { confirmed: height > 0 } })),
    transactionHex: async txid => state.btcTxs.get(txid).tx.toHex(),
    confirmedHeight: async txid => (state.btcSecondSourceLag ? 0 : state.btcTxs.get(txid)?.height || 0),
    outspend: async (txid, vout) => {
      const spender = spentOn(state.btcTxs, txid, vout);
      return spender ? { spent: true, txid: id(spender.tx), confirmed: spender.height > 0 } : { spent: false };
    },
    broadcast: jest.fn(async hex => {
      const tx = bitcoin.Transaction.fromHex(hex);
      state.btcBroadcasts.push(hex);
      const [txid, vout] = outpoint(tx.ins[0]).split(':');
      const rival = spentOn(state.btcTxs, txid, Number(vout));
      if (rival && rival.height > 0 && id(rival.tx) !== id(tx)) throw new Error('inputs spent');
      if (rival && id(rival.tx) !== id(tx)) state.btcTxs.delete(id(rival.tx)); // replaced by fee
      if (!state.btcTxs.has(id(tx))) state.btcTxs.set(id(tx), { tx, height: 0 });
      return true;
    }),
  };

  const root = bitcoin.bip32.fromSeed(Buffer.alloc(64, 3));
  const engine = createMakerEngine({
    chain,
    btc,
    store,
    keyFor: ([a, b]) => root.deriveHardened(a).deriveHardened(b).privateKey,
    funds: {
      address: WALLET_ADDRESS,
      privateKey: () => walletKey,
      coins: async () => unspentPaying(state.marsTxs, bitcoin.address.toOutputScript(WALLET_ADDRESS, MARS_NETWORK)),
      rawTx: async txid => state.marsTxs.get(txid).tx.toHex(),
    },
    now: () => state.time,
    random: size => {
      state.counter++;
      return bitcoin.crypto.sha256(Buffer.from(`random-${state.counter}`)).slice(0, size);
    },
  });

  const mineMars = (blocks = 1) => {
    state.marsHeight += blocks;
    for (const entry of state.marsTxs.values()) if (!entry.height) entry.height = state.marsHeight - blocks + 1;
  };
  const mineBtc = (blocks = 1) => {
    state.btcHeight += blocks;
    for (const entry of state.btcTxs.values()) if (!entry.height) entry.height = state.btcHeight - blocks + 1;
  };

  // The scripted taker.
  const accept = (record, overrides = {}) => {
    const btcLocktime = overrides.btcLocktime ?? state.btcHeight + 24;
    const takerPubkey = overrides.takerPubkey ?? taker.publicKey.toString('hex');
    // A malformed acceptance still names some address; compute it from valid values.
    const valid = /^0[23][0-9a-f]{64}$/.test(takerPubkey) && btcLocktime > 0;
    const contracts = makerContracts({ ...record, takerPubkey: valid ? takerPubkey : taker.publicKey.toString('hex'), btcLocktime: valid ? btcLocktime : 1 });
    const acceptance = {
      taker_pubkey: takerPubkey,
      btc_htlc_address: overrides.address ?? htlcAddress(contracts.btc, BTC_NETWORK),
      btc_locktime: btcLocktime,
      timestamp: Math.floor(state.time / 1000),
    };
    state.acceptances.set(record.id, acceptance);
    return acceptance;
  };
  const payBtc = (record, value = record.btcAmount, salt = 50) => {
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, salt), 0);
    tx.addOutput(makerContracts(record).btcOutput, value);
    state.btcTxs.set(id(tx), { tx, height: 0 });
    return tx;
  };

  const one = async () => (await store.all())[0];
  const post = (plan = [{ marsAmount: 100 * COIN, btcAmount: 9000 }]) => engine.post(plan, { lifetime: 900, btcDestination: BTC_DESTINATION });
  return { state, engine, store, chain, btc, mineMars, mineBtc, accept, payBtc, one, post, records };
}

describe('offers', () => {
  it('publishes an offer other wallets can take, without naming the wallet', async () => {
    const { state, post } = world();
    const [record] = await post();
    const offer = state.offers.get(record.id);
    expect(offer).toMatchObject({
      offer_id: record.id,
      mars_amount_sat: 100 * COIN,
      btc_amount_sat: 9000,
      maker_pubkey: record.pubkey,
      payment_hash160: record.paymentHash,
      mars_locktime: state.marsHeight + 234,
      maker_address: '',
    });
    expect(offer.expires_at).toBe(Math.floor(state.time / 1000) + 900);
    expect(JSON.stringify(offer)).not.toContain(WALLET_ADDRESS);
    // The app's own taker side accepts it as well-formed and safe.
    const [ranked] = rankOffers([normalizeOffer(offer)], {
      marsHeight: state.marsHeight,
      btcHeight: state.btcHeight,
      feeRate: state.feeRate,
      now: Math.floor(state.time / 1000),
    });
    expect(ranked.problem).toBeNull();
  });

  it('gives every offer its own key and secret, and stores neither', async () => {
    const { post, state } = world();
    const records = await post([
      { marsAmount: 100 * COIN, btcAmount: 9000 },
      { marsAmount: 200 * COIN, btcAmount: 19000 },
    ]);
    expect(records).toHaveLength(2);
    expect(records[0].paymentHash).not.toBe(records[1].paymentHash);
    expect(records[0].pubkey).not.toBe(records[1].pubkey);
    const root = bitcoin.bip32.fromSeed(Buffer.alloc(64, 3));
    for (const record of records) {
      const key = root.deriveHardened(record.keyPath[0]).deriveHardened(record.keyPath[1]).privateKey;
      const secret = secretFor(key);
      expect(bitcoin.crypto.hash160(secret).toString('hex')).toBe(record.paymentHash);
      const stored = JSON.stringify(state.saved);
      expect(stored).not.toContain(secret.toString('hex'));
      expect(stored).not.toContain(key.toString('hex'));
    }
    expect(JSON.stringify(state.saved)).not.toContain(walletKey.toString('hex'));
  });

  it('skips an offer too small to collect on at current fees', async () => {
    const { post, state } = world();
    state.feeRate = 100;
    expect(await post([{ marsAmount: 100 * COIN, btcAmount: 9000 }])).toEqual([]);
    expect(state.offers.size).toBe(0);
  });

  it('forgets an offer the relay did not take', async () => {
    const { post, chain, store } = world();
    chain.postOffer.mockRejectedValueOnce(new Error('offline'));
    expect(await post()).toEqual([]);
    expect(await store.all()).toEqual([]);
  });

  it('withdraws untaken offers and leaves a taken one alone', async () => {
    const { post, engine, accept, state, store } = world();
    const [first, second] = await post([
      { marsAmount: 100 * COIN, btcAmount: 9000 },
      { marsAmount: 200 * COIN, btcAmount: 19000 },
    ]);
    accept(second);
    await engine.withdraw();
    expect(state.cancels).toEqual([first.id]);
    expect((await store.all()).map(record => record.id)).toEqual([second.id]);
  });

  it('keeps watching an offer it could not cancel until that offer expires', async () => {
    const { post, engine, state, store } = world();
    await post();
    state.cancelWorks = false;
    await engine.withdraw();
    expect(await store.all()).toHaveLength(1);
    state.time += 901 * 1000;
    await engine.withdraw();
    expect(await store.all()).toHaveLength(0);
  });

  it('drops an expired offer nobody accepted', async () => {
    const { post, engine, state, store } = world();
    await post();
    state.time += 959 * 1000;
    await engine.tick();
    expect(await store.all()).toHaveLength(1);
    state.time += 2 * 1000;
    await engine.tick();
    expect(await store.all()).toHaveLength(0);
  });
});

describe('acceptances', () => {
  it('refuses what it cannot verify, and locks nothing', async () => {
    const cases = [
      [{ address: TAKER_BTC }, 'different Bitcoin contract'],
      [{ takerPubkey: 'zz' }, 'no valid key'],
      [{ btcLocktime: 0 }, 'no valid refund time'],
      [{ btcLocktime: 975000 + 5 }, 'Too little time'],
      [{ btcLocktime: 975000 + 60 }, 'too close to its Marscoin deadline'],
    ];
    for (const [overrides, reason] of cases) {
      const { post, engine, accept, one, state } = world();
      const [record] = await post();
      accept(record, overrides);
      await engine.tick();
      const after = await one();
      expect(after.state).toBe(MakerState.DECLINED);
      expect(after.error).toContain(reason);
      expect(state.marsBroadcasts).toEqual([]);
      expect(state.reports).toEqual([record.id]);
    }
  });

  it('refuses its own key as the taker', async () => {
    const { post } = world();
    const [record] = await post();
    expect(acceptanceProblem(record, { taker_pubkey: record.pubkey, btc_htlc_address: 'x', btc_locktime: 975024 }, {})).toContain('no valid key');
  });
});

describe('a completed sale', () => {
  it('locks first, waits for confirmed Bitcoin, then collects and reveals the secret', async () => {
    const w = world();
    const { state, engine, one } = w;
    const [record] = await w.post();
    w.accept(record);
    await engine.tick();

    let now = await one();
    expect(now.state).toBe(MakerState.MARS_LOCKED);
    // The lock pays exactly the agreed amount to the contract the taker expects.
    const lock = bitcoin.Transaction.fromHex(state.marsBroadcasts[0]);
    const contracts = makerContracts(now);
    expect(lock.outs[0].script.equals(contracts.marsOutput)).toBe(true);
    expect(lock.outs[0].value).toBe(100 * COIN);
    expect(now.marsHtlcAddress).toBe(htlcAddress(contracts.mars, MARS_NETWORK));
    // Change returns to the wallet; the fee is small.
    expect(bitcoin.address.fromOutputScript(lock.outs[1].script, MARS_NETWORK)).toBe(WALLET_ADDRESS);
    expect(900 * COIN - lock.outs[0].value - lock.outs[1].value).toBeLessThan(0.01 * COIN);
    // It was saved, signed, before it was sent.
    const savedBeforeSend = state.saved.find(item => item.state === MakerState.LOCKING);
    expect(savedBeforeSend.marsFunding.hex).toBe(state.marsBroadcasts[0]);

    // No Bitcoin yet: nothing is revealed.
    w.mineMars(2);
    await engine.tick();
    expect(state.btcBroadcasts).toEqual([]);

    // Bitcoin arrives. Unconfirmed, then one confirmation: still nothing.
    const payment = w.payBtc(now);
    await engine.tick();
    expect((await one()).note).toContain('0 of 2');
    w.mineBtc(1);
    await engine.tick();
    expect((await one()).note).toContain('1 of 2');
    expect(state.btcBroadcasts).toEqual([]);

    // Two confirmations: collect.
    w.mineBtc(1);
    await engine.tick();
    now = await one();
    expect(now.state).toBe(MakerState.CLAIMING);
    const claim = bitcoin.Transaction.fromHex(state.btcBroadcasts[0]);
    expect(spendsOutpoint(state.btcBroadcasts[0], payment.getId(), 0)).toBe(true);
    expect(bitcoin.address.fromOutputScript(claim.outs[0].script, BTC_NETWORK)).toBe(BTC_DESTINATION);
    expect(claim.outs[0].value).toBe(9000 - 4 * 2 * 150);
    // Saved before the secret left the phone.
    expect(state.saved.find(item => item.state === MakerState.CLAIMING).btcClaims[0].hex).toBe(state.btcBroadcasts[0]);

    // The taker reads the secret from our claim and collects the Marscoin.
    const secret = extractPreimage(state.btcBroadcasts[0], contracts.hash160);
    expect(secret).not.toBeNull();
    const takerClaim = buildClaimTx({
      script: contracts.mars,
      txid: lock.getId(),
      vout: 0,
      value: 100 * COIN,
      fee: MARS_SPEND_FEE,
      preimage: secret,
      privkey: takerKey,
      destination: TAKER_MARS,
      network: MARS_NETWORK,
    });
    await w.chain.broadcast(takerClaim.toHex());

    w.mineBtc(1);
    await engine.tick();
    now = await one();
    expect(now.state).toBe(MakerState.COMPLETED);
    expect(state.reports).toEqual([]);
  });

  it('counts the sale against the day and frees nothing twice', async () => {
    const w = world();
    const [record] = await w.post();
    expect(await w.engine.position()).toMatchObject({ confirmed: 900 * COIN, committed: 100 * COIN, soldToday: 0 });
    w.accept(record);
    await w.engine.tick();
    // The coin is spent; its change is not yet confirmed.
    expect(await w.engine.position()).toMatchObject({ confirmed: 0, committed: 0, soldToday: 100 * COIN });
    w.mineMars(1);
    const position = await w.engine.position();
    expect(position.confirmed).toBeGreaterThan(799 * COIN);
    expect(position.confirmed).toBeLessThan(800 * COIN);
    w.state.time += 25 * 3600 * 1000;
    expect((await w.engine.position()).soldToday).toBe(0);
  });
});

describe('never revealing the secret unsafely', () => {
  const locked = async (options, plan) => {
    const w = world(options);
    const [record] = await w.post(plan);
    w.accept(record);
    await w.engine.tick();
    return { w, record: await w.one() };
  };

  it('ignores a payment below the agreed amount', async () => {
    const { w, record } = await locked();
    w.payBtc(record, record.btcAmount - 1);
    w.mineBtc(3);
    await w.engine.tick();
    expect(w.state.btcBroadcasts).toEqual([]);
    expect((await w.one()).state).toBe(MakerState.MARS_LOCKED);
  });

  it('ignores a payment to any other address', async () => {
    const { w, record } = await locked();
    const tx = new bitcoin.Transaction();
    tx.addInput(Buffer.alloc(32, 77), 0);
    tx.addOutput(bitcoin.address.toOutputScript(TAKER_BTC, BTC_NETWORK), record.btcAmount);
    w.state.btcTxs.set(tx.getId(), { tx, height: w.state.btcHeight });
    w.mineBtc(3);
    await w.engine.tick();
    expect(w.state.btcBroadcasts).toEqual([]);
  });

  it('waits when the Bitcoin services do not all see the payment in a block', async () => {
    const { w, record } = await locked();
    w.payBtc(record);
    w.mineBtc(3);
    w.state.btcSecondSourceLag = true;
    await w.engine.tick();
    expect(w.state.btcBroadcasts).toEqual([]);
    w.state.btcSecondSourceLag = false;
    await w.engine.tick();
    expect(w.state.btcBroadcasts).toHaveLength(1);
  });

  it('does not collect a payment the taker has already taken back', async () => {
    const { w, record } = await locked();
    const payment = w.payBtc(record);
    w.mineBtc(2);
    const contracts = makerContracts(record);
    const back = buildRefundTx({
      script: contracts.btc,
      txid: payment.getId(),
      vout: 0,
      value: record.btcAmount,
      fee: 600,
      locktime: record.btcLocktime,
      privkey: takerKey,
      destination: TAKER_BTC,
      network: BTC_NETWORK,
    });
    w.state.btcTxs.set(back.getId(), { tx: back, height: w.state.btcHeight });
    await w.engine.tick();
    expect(w.state.btcBroadcasts).toEqual([]);
  });

  it('lets the swap unwind when the Bitcoin arrives too close to its refund time', async () => {
    const { w, record } = await locked();
    w.mineBtc(20);
    w.payBtc(record);
    w.mineBtc(2); // two confirmations, but only two blocks before the refund opens
    await w.engine.tick();
    const now = await w.one();
    expect(w.state.btcBroadcasts).toEqual([]);
    expect(now.state).toBe(MakerState.MARS_LOCKED);
    expect(now.note).toContain('too late');
  });
});

describe('taking the Marscoin back', () => {
  it('refunds after the timelock when the buyer never pays, and reports it once', async () => {
    const w = world();
    const [record] = await w.post();
    w.accept(record);
    await w.engine.tick();
    w.mineMars(233);
    await w.engine.tick();
    expect((await w.one()).state).toBe(MakerState.MARS_LOCKED);
    expect(w.state.marsBroadcasts).toHaveLength(1);

    w.mineMars(1);
    await w.engine.tick();
    let now = await w.one();
    expect(now.state).toBe(MakerState.REFUNDING);
    expect(w.state.reports).toEqual([record.id]);
    const refund = bitcoin.Transaction.fromHex(w.state.marsBroadcasts[1]);
    expect(refund.locktime).toBe(now.marsLocktime);
    expect(bitcoin.address.fromOutputScript(refund.outs[0].script, MARS_NETWORK)).toBe(WALLET_ADDRESS);
    expect(refund.outs[0].value).toBe(100 * COIN - MARS_SPEND_FEE);

    await w.engine.tick();
    expect((await w.one()).state).toBe(MakerState.REFUNDING);
    w.mineMars(1);
    await w.engine.tick();
    now = await w.one();
    expect(now.state).toBe(MakerState.REFUNDED);
    expect(w.state.reports).toEqual([record.id]);
  });

  it('does not report a buyer whose Bitcoin was seen', async () => {
    const w = world();
    const [record] = await w.post();
    w.accept(record);
    await w.engine.tick();
    w.payBtc(await w.one());
    await w.engine.tick();
    w.mineMars(234);
    await w.engine.tick();
    expect((await w.one()).state).toBe(MakerState.REFUNDING);
    expect(w.state.reports).toEqual([]);
  });
});

describe('interruptions', () => {
  it('sends a saved lock again after the network refused it', async () => {
    const w = world();
    const [record] = await w.post();
    w.accept(record);
    w.state.marsDown = true;
    await w.engine.tick();
    let now = await w.one();
    expect(now.state).toBe(MakerState.LOCKING);
    const saved = now.marsFunding.hex;
    w.state.marsDown = false;
    await w.engine.tick();
    now = await w.one();
    expect(now.state).toBe(MakerState.MARS_LOCKED);
    expect(w.state.marsBroadcasts).toEqual([saved]);
  });

  it('never spends the same coin for two buyers', async () => {
    const w = world({ coins: [300 * COIN] });
    const [first, second] = await w.post([
      { marsAmount: 100 * COIN, btcAmount: 9000 },
      { marsAmount: 100 * COIN, btcAmount: 9000 },
    ]);
    w.accept(first);
    w.accept(second, { takerPubkey: bitcoin.ECPair.fromPrivateKey(Buffer.alloc(32, 6)).publicKey.toString('hex') });
    await w.engine.tick();
    const states = (await w.store.all()).map(record => record.state).sort();
    expect(states).toEqual([MakerState.ACCEPTED, MakerState.MARS_LOCKED]);
    expect(w.state.marsBroadcasts).toHaveLength(1);
    // Once the change confirms, the second buyer is served from it.
    w.mineMars(1);
    await w.engine.tick();
    expect((await w.store.all()).map(record => record.state)).toEqual([MakerState.MARS_LOCKED, MakerState.MARS_LOCKED]);
    const [a, b] = w.state.marsBroadcasts.map(hex => bitcoin.Transaction.fromHex(hex));
    expect(outpoint(b.ins[0])).toBe(`${a.getId()}:1`);
  });

  it('declines rather than lock late when coins were not available in time', async () => {
    const w = world({ coins: [50 * COIN] });
    const [record] = await w.post();
    w.accept(record);
    await w.engine.tick();
    expect((await w.one()).state).toBe(MakerState.ACCEPTED);
    w.mineBtc(14); // now under two hours remain on the buyer's side
    await w.engine.tick();
    const now = await w.one();
    expect(now.state).toBe(MakerState.DECLINED);
    expect(w.state.marsBroadcasts).toEqual([]);
  });

  it('pays more for the claim when fees rise before it confirms', async () => {
    const w = world();
    const [record] = await w.post([{ marsAmount: 100 * COIN, btcAmount: 90000 }]);
    w.accept(record);
    await w.engine.tick();
    w.payBtc(await w.one(), 90000);
    w.mineBtc(2);
    await w.engine.tick();
    expect(w.state.btcBroadcasts).toHaveLength(1);
    await w.engine.tick();
    expect(new Set(w.state.btcBroadcasts).size).toBe(1);
    w.state.feeRate = 10;
    await w.engine.tick();
    const fees = (await w.one()).btcClaims.map(claim => claim.fee);
    expect(fees).toEqual([1200, 3000]);
    w.mineBtc(1);
    await w.engine.tick();
    expect((await w.one()).state).toBe(MakerState.COMPLETED);
  });

  it('records a loss when the buyer’s refund overtakes the claim, and still tries to recover', async () => {
    const w = world();
    const [record] = await w.post();
    w.accept(record);
    await w.engine.tick();
    const payment = w.payBtc(await w.one());
    w.mineBtc(2);
    await w.engine.tick();
    let now = await w.one();
    expect(now.state).toBe(MakerState.CLAIMING);
    // Our claim never confirms; the buyer's refund does.
    const contracts = makerContracts(now);
    w.state.btcTxs.delete(now.btcClaims[0].txid);
    const back = buildRefundTx({
      script: contracts.btc,
      txid: payment.getId(),
      vout: 0,
      value: now.btcAmount,
      fee: 600,
      locktime: now.btcLocktime,
      privkey: takerKey,
      destination: TAKER_BTC,
      network: BTC_NETWORK,
    });
    w.state.btcTxs.set(back.getId(), { tx: back, height: w.state.btcHeight });
    await w.engine.tick();
    expect((await w.one()).error).toContain('took the Bitcoin back');
    // The buyer also collects the Marscoin with the public secret.
    const takerClaim = buildClaimTx({
      script: contracts.mars,
      txid: now.marsFunding.txid,
      vout: 0,
      value: 100 * COIN,
      fee: MARS_SPEND_FEE,
      preimage: extractPreimage(now.btcClaims[0].hex, contracts.hash160),
      privkey: takerKey,
      destination: TAKER_MARS,
      network: MARS_NETWORK,
    });
    await w.chain.broadcast(takerClaim.toHex());
    w.mineMars(234);
    await w.engine.tick();
    now = await w.one();
    expect(now.state).toBe(MakerState.LOST);
  });
});

describe('the lock transaction', () => {
  it('refuses a coin whose source transaction does not match', () => {
    const source = new bitcoin.Transaction();
    source.addInput(Buffer.alloc(32, 1), 0);
    source.addOutput(bitcoin.address.toOutputScript(WALLET_ADDRESS, MARS_NETWORK), 5 * COIN);
    const coin = { txid: source.getId(), vout: 0, value: 6 * COIN, rawTx: source.toHex() };
    expect(() => buildLockTx({ coins: [coin], amount: COIN, contractAddress: WALLET_ADDRESS, changeAddress: WALLET_ADDRESS, privateKey: walletKey })).toThrow(
      'could not be verified',
    );
  });

  it('returns nothing when the coins do not cover the amount and fee', () => {
    const source = new bitcoin.Transaction();
    source.addInput(Buffer.alloc(32, 1), 0);
    source.addOutput(bitcoin.address.toOutputScript(WALLET_ADDRESS, MARS_NETWORK), COIN);
    const coin = { txid: source.getId(), vout: 0, value: COIN, rawTx: source.toHex() };
    expect(buildLockTx({ coins: [coin], amount: COIN, contractAddress: WALLET_ADDRESS, changeAddress: WALLET_ADDRESS, privateKey: walletKey })).toBeNull();
  });
});
