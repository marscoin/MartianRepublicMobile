import * as bitcoin from 'bitcoinjs-lib';
import { createSwapEngine, SwapState, swapContracts } from '../../blue_modules/swap/engine';
import { BTC_NETWORK, MARS_NETWORK, buildClaimTx, extractPreimage, headerMerkleRoot, htlcOutputScript } from '../../blue_modules/swap/htlc';
import { createBtcWallet } from '../../blue_modules/swap/btc-wallet';

// A simulated pair of chains, relay and maker. All keys are synthetic.
const preimage = Buffer.alloc(32, 9);
const paymentHash = bitcoin.crypto.hash160(preimage);
const makerKey = Buffer.alloc(32, 5);
const maker = bitcoin.ECPair.fromPrivateKey(makerKey);
const seed = Buffer.alloc(64, 3);
const MARS_DESTINATION = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
const MAKER_BTC = 'bc1qxtts9kqcd22ck5upvrhz9zs3geaufp66my95e6';

const txHexPaying = (script, value, salt = 1) => {
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, salt), 0);
  tx.addOutput(script, value);
  return tx;
};

function world() {
  const state = {
    time: 1794000000000,
    marsHeight: 3598300,
    btcHeight: 975000,
    feeRate: 4,
    offers: [],
    acceptances: [],
    acceptError: null,
    mars: { txs: new Map(), heights: new Map(), broadcasts: [] },
    btcTxs: new Map(), // txid -> { tx, confirmed }
    btcBroadcasts: [],
    explorerLag: false,
    explorerHeightOffset: 0,
    watchtower: true,
    watches: [],
    swallowMarsBroadcasts: false,
    saved: [],
  };
  const records = new Map();
  const store = {
    all: async () => [...records.values()],
    save: async swap => {
      records.set(swap.id, swap);
      state.saved.push(JSON.parse(JSON.stringify(swap)));
    },
  };

  const marsUnspent = script =>
    [...state.mars.txs.values()].flatMap(tx =>
      tx.outs
        .map((out, vout) => ({ out, vout }))
        .filter(({ out, vout }) => out.script.equals(script) && !marsSpent(tx.getId(), vout))
        .map(({ out, vout }) => ({ txid: tx.getId(), vout, value: out.value, height: state.mars.heights.get(tx.getId()) || 0 })),
    );
  const marsSpent = (txid, vout) =>
    [...state.mars.txs.values()].some(tx =>
      tx.ins.some(input => input.index === vout && Buffer.from(input.hash).reverse().toString('hex') === txid),
    );

  const chain = {
    watchtowerAvailable: async () => state.watchtower,
    watchRegister: jest.fn(async pack => {
      state.watches.push(pack);
      return { id: 'f'.repeat(64), expiresAt: 0 };
    }),
    tipHeight: async () => state.marsHeight,
    agreedTipHeight: async () => {
      const node = state.marsHeight + state.explorerHeightOffset;
      if (Math.abs(node - state.marsHeight) > 3)
        throw new Error('Marscoin services disagree about the current block. Try again in a few minutes.');
      return Math.max(node, state.marsHeight);
    },
    offers: async () => state.offers,
    accept: jest.fn(async (offerId, acceptance) => {
      if (state.acceptError) throw state.acceptError;
      state.acceptances.push({ offerId, ...acceptance });
      return true;
    }),
    unspent: async script => marsUnspent(script),
    history: async script =>
      [...state.mars.txs.values()]
        .filter(
          tx =>
            tx.outs.some(out => out.script.equals(script)) ||
            tx.ins.some(input => {
              const previous = state.mars.txs.get(Buffer.from(input.hash).reverse().toString('hex'));
              return previous?.outs[input.index]?.script.equals(script);
            }),
        )
        .map(tx => ({ txid: tx.getId(), height: state.mars.heights.get(tx.getId()) || 0 })),
    transactionHex: async txid => state.mars.txs.get(txid).toHex(),
    // A single-transaction block: the merkle root is the txid itself.
    merkle: async () => ({ branch: [], position: 0 }),
    header: async height => {
      const txid = ([...state.mars.heights.entries()].find(([, h]) => h === height) || ['00'.repeat(32)])[0];
      return Buffer.concat([Buffer.alloc(36), Buffer.from(txid, 'hex').reverse(), Buffer.alloc(12)]).toString('hex');
    },
    broadcast: jest.fn(async hex => {
      const tx = bitcoin.Transaction.fromHex(hex);
      state.mars.broadcasts.push(hex);
      if (state.swallowMarsBroadcasts) return tx.getId();
      if (!state.mars.txs.has(tx.getId())) {
        // A node refuses to spend an output twice.
        for (const input of tx.ins) {
          if (marsSpent(Buffer.from(input.hash).reverse().toString('hex'), input.index)) throw new Error('txn-mempool-conflict');
        }
        state.mars.txs.set(tx.getId(), tx);
      }
      return tx.getId();
    }),
    explorerOutput: async (txid, vout) => {
      const tx = state.mars.txs.get(txid);
      const height = state.mars.heights.get(txid) || 0;
      return {
        confirmations: state.explorerLag || !height ? 0 : state.marsHeight - height + 1,
        value: tx.outs[vout].value,
        scriptHex: tx.outs[vout].script.toString('hex'),
      };
    },
  };

  const addressOf = script => {
    try {
      return bitcoin.address.fromOutputScript(script, BTC_NETWORK);
    } catch {
      return null;
    }
  };
  const esploraTx = ({ tx, confirmed }) => ({
    txid: tx.getId(),
    status: { confirmed },
    vout: tx.outs.map(out => ({ scriptpubkey_address: addressOf(out.script), value: out.value })),
    vin: tx.ins.map(input => {
      const previousId = Buffer.from(input.hash).reverse().toString('hex');
      const previous = state.btcTxs.get(previousId);
      return {
        txid: previousId,
        vout: input.index,
        prevout: previous ? { scriptpubkey_address: addressOf(previous.tx.outs[input.index].script) } : null,
      };
    }),
  });
  const btc = {
    tipHeight: async () => state.btcHeight,
    agreedTipHeight: async () => state.btcHeight,
    outspend: async (txid, vout) => {
      if (!state.btcTxs.has(txid)) throw new Error('Transaction not found');
      const spender = [...state.btcTxs.values()].find(entry =>
        entry.tx.ins.some(input => input.index === vout && Buffer.from(input.hash).reverse().toString('hex') === txid),
      );
      return spender ? { spent: true, txid: spender.tx.getId(), confirmed: spender.confirmed } : { spent: false };
    },
    feeRate: async () => state.feeRate,
    transactions: async address =>
      [...state.btcTxs.values()]
        .map(esploraTx)
        .filter(
          tx => tx.vout.some(o => o.scriptpubkey_address === address) || tx.vin.some(i => i.prevout?.scriptpubkey_address === address),
        ),
    transactionHex: async txid => state.btcTxs.get(txid).tx.toHex(),
    broadcast: jest.fn(async hex => {
      const tx = bitcoin.Transaction.fromHex(hex);
      if (tx.locktime > state.btcHeight)
        throw Object.assign(new Error('Bitcoin network rejected the transaction: non-final'), { rejected: true });
      if (!state.btcTxs.has(tx.getId())) {
        // Replace-by-fee: an unconfirmed transaction spending the same coins gives way.
        for (const [id, entry] of [...state.btcTxs]) {
          const conflict = entry.tx.ins.some(a => tx.ins.some(b => a.index === b.index && Buffer.from(a.hash).equals(Buffer.from(b.hash))));
          if (!conflict) continue;
          if (entry.confirmed)
            throw Object.assign(new Error('Bitcoin network rejected the transaction: bad-txns-inputs-missingorspent'), { rejected: true });
          state.btcTxs.delete(id);
        }
        state.btcTxs.set(tx.getId(), { tx, confirmed: false });
      }
      state.btcBroadcasts.push(hex);
      return true;
    }),
    addressStats: async address => {
      const txs = await btc.transactions(address);
      const utxos = await btc.utxos(address);
      return { transactions: txs.length, confirmed: utxos.reduce((s, u) => s + u.value, 0), unconfirmed: 0 };
    },
    utxos: async address =>
      [...state.btcTxs.values()].flatMap(({ tx }) =>
        tx.outs
          .map((out, vout) => ({ out, vout }))
          .filter(
            ({ out, vout }) =>
              addressOf(out.script) === address &&
              ![...state.btcTxs.values()].some(other =>
                other.tx.ins.some(i => i.index === vout && Buffer.from(i.hash).reverse().toString('hex') === tx.getId()),
              ),
          )
          .map(({ out, vout }) => ({ txid: tx.getId(), vout, value: out.value, confirmed: true, height: 1 })),
      ),
  };

  const root = bitcoin.bip32.fromSeed(seed);
  const swapKey = index => root.derivePath(`m/1017'/0'/${index}'`).privateKey;
  let ids = 0;
  const wallet = createBtcWallet({ seed, esplora: btc });
  // The simulated chain has no mining; proof of work is covered by mars-headers.test.js.
  const verifyHeaders = jest.fn(hexes => hexes.map(hex => ({ merkleRoot: headerMerkleRoot(hex) })));
  const engine = createSwapEngine({
    chain,
    btc,
    store,
    swapKey,
    wallet,
    verifyHeaders,
    now: () => state.time,
    randomId: () => `swap-${++ids}`,
  });

  const offer = (overrides = {}) => ({
    id: 'aa'.repeat(16),
    marsAmount: 7050000000,
    btcAmount: 6244,
    makerPubkey: maker.publicKey.toString('hex'),
    paymentHash: paymentHash.toString('hex'),
    marsLocktime: state.marsHeight + 480,
    expiresAt: state.time / 1000 + 900,
    ...overrides,
  });

  // Maker behaviour.
  const makerLocksMars = (swap, { value = swap.marsAmount, height = state.marsHeight } = {}) => {
    const tx = txHexPaying(swapContracts(swap).marsOutput, value, 7);
    state.mars.txs.set(tx.getId(), tx);
    if (height) state.mars.heights.set(tx.getId(), height);
    return tx;
  };
  const makerClaimsBtc = swap => {
    const contracts = swapContracts(swap);
    const funding = [...state.btcTxs.values()].map(({ tx }) => tx).find(tx => tx.outs.some(out => out.script.equals(contracts.btcOutput)));
    const vout = funding.outs.findIndex(out => out.script.equals(contracts.btcOutput));
    const tx = buildClaimTx({
      script: contracts.btc,
      txid: funding.getId(),
      vout,
      value: funding.outs[vout].value,
      fee: 600,
      preimage,
      privkey: makerKey,
      destination: MAKER_BTC,
      network: BTC_NETWORK,
    });
    state.btcTxs.set(tx.getId(), { tx, confirmed: true });
    return tx;
  };
  const fundWallet = value => {
    const tx = txHexPaying(bitcoin.address.toOutputScript(wallet.address(0, 0), BTC_NETWORK), value, 2);
    state.btcTxs.set(tx.getId(), { tx, confirmed: true });
  };
  const confirmAll = () => {
    for (const entry of state.btcTxs.values()) entry.confirmed = true;
    for (const txid of state.mars.txs.keys()) if (!state.mars.heights.get(txid)) state.mars.heights.set(txid, state.marsHeight);
  };
  const start = async (overrides = {}) =>
    engine.accept(offer(overrides), { marsDestination: MARS_DESTINATION, btcRefundAddress: wallet.address(0, 1) });

  return {
    state,
    engine,
    wallet,
    chain,
    btc,
    store,
    offer,
    start,
    makerLocksMars,
    makerClaimsBtc,
    fundWallet,
    confirmAll,
    swapKey,
    verifyHeaders,
  };
}

async function toReadyToPay(w) {
  const swap = await w.start();
  w.makerLocksMars(swap);
  w.state.marsHeight += 1;
  await w.engine.advance(swap);
  return swap;
}

describe('Atomic swap engine (Bitcoin to Marscoin)', () => {
  it('completes a swap: verify the Marscoin lock, pay Bitcoin, learn the secret, claim Marscoin', async () => {
    const w = world();
    const swap = await w.start();
    expect(swap.state).toBe(SwapState.WAITING_MARS);
    expect(w.state.acceptances[0]).toMatchObject({
      offerId: 'aa'.repeat(16),
      taker_pubkey: swap.pubkey,
      btc_htlc_address: swap.btcHtlcAddress,
      btc_locktime: w.state.btcHeight + 24,
    });
    expect(swap.btcHtlcAddress).toMatch(/^bc1q[a-z0-9]{58}$/);
    expect(swap.marsHtlcAddress).toMatch(/^mars1q[a-z0-9]{58}$/);

    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.WAITING_MARS);
    expect(swap.error).toMatch(/Waiting for the seller/);

    w.makerLocksMars(swap);
    await w.engine.advance(swap);
    expect(swap.error).toMatch(/1 of 2/);
    w.state.marsHeight += 1;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.READY_TO_PAY);

    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    expect(swap.state).toBe(SwapState.BTC_SENT);
    const payment = bitcoin.Transaction.fromHex(swap.btcPayment.hex);
    expect(payment.outs[0].value).toBe(6244);
    expect(payment.outs[0].script.equals(swapContracts(swap).btcOutput)).toBe(true);

    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.BTC_SENT);

    w.makerClaimsBtc(swap);
    await w.engine.advance(swap);
    expect(swap.preimage).toBe(preimage.toString('hex'));
    expect(swap.state).toBe(SwapState.CLAIMING);
    const claim = bitcoin.Transaction.fromHex(w.state.mars.broadcasts[0]);
    expect(claim.outs[0].value).toBe(7050000000 - 100000);
    expect(bitcoin.address.fromOutputScript(claim.outs[0].script, MARS_NETWORK)).toBe(MARS_DESTINATION);
    expect(extractPreimage(claim.toHex(), paymentHash)).toEqual(preimage);

    w.confirmAll();
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.COMPLETED);
    expect(new Set(w.state.mars.broadcasts).size).toBe(1);
  });

  it('saves the swap before announcing it and never stores a private key', async () => {
    const w = world();
    w.chain.accept.mockImplementationOnce(async () => {
      expect(w.state.saved).toHaveLength(1);
      expect(w.state.saved[0].state).toBe(SwapState.ACCEPTING);
      return true;
    });
    const swap = await w.start();
    const key = w.swapKey(swap.keyIndex).toString('hex');
    expect(JSON.stringify(w.state.saved)).not.toContain(key);
    expect(JSON.stringify(w.state.saved)).not.toContain(seed.toString('hex'));
  });

  it('claims Marscoin when the seller claimed while the app was closed', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    // The app is closed. The maker claims, and much time passes on Bitcoin.
    w.makerClaimsBtc(swap);
    w.state.btcHeight += 30;
    w.state.marsHeight += 100;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.CLAIMING);
    expect(w.state.mars.broadcasts).toHaveLength(1);
    expect(w.state.btcBroadcasts).toHaveLength(1); // only the payment; no refund attempt
  });

  it('finds the secret even for a swap paid from another wallet and never seen as funded', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    const external = txHexPaying(swapContracts(swap).btcOutput, swap.btcAmount, 4);
    w.state.btcTxs.set(external.getId(), { tx: external, confirmed: true });
    w.makerClaimsBtc(swap);
    w.state.btcHeight += 23; // the payment window has closed
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.CLAIMING);
    expect(swap.error).toBeNull();
  });

  it('refunds Bitcoin after the timelock when the seller never claims', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    w.confirmAll(); // the payment is mined
    w.state.btcHeight = swap.btcLocktime - 1;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.BTC_SENT);
    expect(w.state.btcBroadcasts).toHaveLength(1);

    w.state.btcHeight = swap.btcLocktime;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.REFUNDING);
    const refund = bitcoin.Transaction.fromHex(swap.btcRefunds[0].hex);
    expect(refund.locktime).toBe(swap.btcLocktime);
    expect(refund.outs[0].value).toBe(6244 - 600);
    expect(bitcoin.address.fromOutputScript(refund.outs[0].script, BTC_NETWORK)).toBe(w.wallet.address(0, 1));

    await w.engine.advance(swap);
    // Nothing new is signed on later passes: the three refunds prepared for the watchtower.
    expect(swap.btcRefunds.map(item => item.fee)).toEqual([600, 1200, 2400]);
    expect(swap.state).toBe(SwapState.REFUNDING);
    w.confirmAll();
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.REFUNDED);
  });

  it('still claims Marscoin if the seller claims at the last moment instead of our refund', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    w.makerClaimsBtc(swap);
    w.state.btcHeight = swap.btcLocktime + 1;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.CLAIMING);
    expect(swap.btcRefunds).toHaveLength(0);
  });

  it('does not accept a Marscoin lock that is too small, unconfirmed, or unknown to the second node', async () => {
    const w = world();
    const swap = await w.start();
    w.makerLocksMars(swap, { value: swap.marsAmount - 1 });
    w.state.marsHeight += 5;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.WAITING_MARS);

    const second = world();
    const other = await second.start();
    second.makerLocksMars(other, { height: 0 });
    second.state.marsHeight += 5;
    await second.engine.advance(other);
    expect(other.state).toBe(SwapState.WAITING_MARS);

    const third = world();
    const lagging = await third.start();
    third.makerLocksMars(lagging);
    third.state.marsHeight += 5;
    third.state.explorerLag = true;
    await third.engine.advance(lagging);
    expect(lagging.state).toBe(SwapState.WAITING_MARS);
    expect(lagging.error).toMatch(/second Marscoin node/);
    third.state.explorerLag = false;
    await third.engine.advance(lagging);
    expect(lagging.state).toBe(SwapState.READY_TO_PAY);
  });

  it('rejects a Marscoin lock whose inclusion proof does not match the block header', async () => {
    const w = world();
    const swap = await w.start();
    w.makerLocksMars(swap);
    w.state.marsHeight += 1;
    w.chain.merkle = async () => ({ branch: ['ab'.repeat(32)], position: 0 });
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.WAITING_MARS);
    expect(swap.error).toMatch(/could not be verified/);
  });

  it('rejects a Marscoin lock in blocks without valid proof of work', async () => {
    const w = world();
    const swap = await w.start();
    w.makerLocksMars(swap);
    w.state.marsHeight += 1;
    w.verifyHeaders.mockImplementation(() => {
      throw new Error('The block lacks proof of work.');
    });
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.WAITING_MARS);
    // The lock block and the block confirming it were both examined.
    expect(w.verifyHeaders.mock.calls[0][0]).toHaveLength(2);
  });

  it('fails harmlessly when the seller never locks Marscoin', async () => {
    const w = world();
    const swap = await w.start();
    w.state.btcHeight += 13; // under two hours of window remain
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.FAILED);
    expect(swap.error).toMatch(/No Bitcoin was sent/);
    expect(w.state.btcBroadcasts).toHaveLength(0);
  });

  it('refuses to pay once the safe window has closed or the lock has gone', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    w.state.btcHeight += 13;
    await expect(w.engine.pay(swap, w.wallet)).rejects.toThrow('No Bitcoin was sent');
    expect(w.state.btcBroadcasts).toHaveLength(0);

    const second = world();
    const other = await toReadyToPay(second);
    second.fundWallet(50000);
    second.state.mars.txs.clear();
    await expect(second.engine.pay(other, second.wallet)).rejects.toThrow('could not be confirmed just now');
    expect(second.state.btcBroadcasts).toHaveLength(0);
  });

  it('never signs a second payment after an interrupted broadcast', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    w.btc.broadcast.mockRejectedValueOnce(new Error('Bitcoin network services are unreachable.'));
    await w.engine.pay(swap, w.wallet);
    const saved = swap.btcPayment.hex;
    expect(w.state.btcBroadcasts).toHaveLength(0);
    await expect(w.engine.pay(swap, w.wallet)).rejects.toThrow('not waiting for payment');
    await w.engine.advance(swap);
    expect(w.state.btcBroadcasts).toEqual([saved]);
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.BTC_SENT);
  });

  it('releases a payment the network rejected so nothing is left half-sent', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    w.btc.broadcast.mockRejectedValueOnce(
      Object.assign(new Error('Bitcoin network rejected the transaction: bad-txns'), { rejected: true }),
    );
    await expect(w.engine.pay(swap, w.wallet)).rejects.toThrow('rejected');
    expect(swap.btcPayment).toBeNull();
    expect(swap.state).toBe(SwapState.READY_TO_PAY);
  });

  it('reports an insufficient Bitcoin balance without changing the swap', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(3000);
    await expect(w.engine.pay(swap, w.wallet)).rejects.toThrow('Not enough Bitcoin');
    expect(swap.btcPayment).toBeNull();
    expect(swap.state).toBe(SwapState.READY_TO_PAY);
  });

  it('rejects unsafe offers before contacting the relay', async () => {
    const w = world();
    await expect(w.start({ marsLocktime: w.state.marsHeight + 150 })).rejects.toThrow('too close');
    await expect(w.start({ expiresAt: w.state.time / 1000 - 1 })).rejects.toThrow('expired');
    w.state.feeRate = 60;
    await expect(w.start()).rejects.toThrow('too small to refund');
    expect(w.chain.accept).not.toHaveBeenCalled();
    expect(w.state.saved).toHaveLength(0);
  });

  it('ends the swap when the relay refuses, and retries when the relay is unreachable', async () => {
    const w = world();
    w.state.acceptError = Object.assign(new Error('offer already taken'), { final: true });
    const refused = await w.start();
    expect(refused.state).toBe(SwapState.FAILED);
    expect(refused.error).toBe('Offer already taken. No Bitcoin was sent.');

    const second = world();
    second.state.acceptError = new Error('socket closed');
    const pending = await second.start();
    expect(pending.state).toBe(SwapState.ACCEPTING);
    second.state.acceptError = null;
    await second.engine.advance(pending);
    expect(pending.state).toBe(SwapState.WAITING_MARS);
    expect(second.state.acceptances).toHaveLength(1);
    expect(second.state.acceptances[0].taker_pubkey).toBe(pending.pubkey);
  });

  it('allows one unpaid swap at a time and uses a fresh key for each swap', async () => {
    const w = world();
    const first = await w.start();
    await expect(w.start({ id: 'bb'.repeat(16) })).rejects.toThrow('current swap');
    await w.engine.cancel(first);
    expect(first.state).toBe(SwapState.FAILED);
    const second = await w.start({ id: 'bb'.repeat(16) });
    expect(second.keyIndex).toBe(first.keyIndex + 1);
    expect(second.pubkey).not.toBe(first.pubkey);
  });

  it('will not cancel a swap that has been paid', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    await expect(w.engine.cancel(swap)).rejects.toThrow('no longer be cancelled');
  });

  it('marks the swap unclaimed only when the Marscoin is gone after its deadline', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    w.makerClaimsBtc(swap);
    // The maker reclaims the Marscoin after its timelock while we were away.
    const contracts = swapContracts(swap);
    const lock = [...w.state.mars.txs.values()][0];
    const reclaim = new bitcoin.Transaction();
    reclaim.addInput(Buffer.from(lock.getId(), 'hex').reverse(), 0);
    reclaim.addOutput(htlcOutputScript(contracts.btc), 1);
    w.state.mars.txs.set(reclaim.getId(), reclaim);
    w.state.marsHeight = swap.marsLocktime + 1;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.UNCLAIMED);
    expect(swap.preimage).toBe(preimage.toString('hex'));
  });

  it('stops re-sending a claim once the seller has reclaimed the Marscoin after its deadline', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    w.makerClaimsBtc(swap);
    // Our claim is signed and saved, but never reaches the network.
    w.chain.broadcast.mockRejectedValue(new Error('offline'));
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.CLAIMING);
    expect(swap.marsClaim).not.toBeNull();
    // Before the deadline we keep trying.
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.CLAIMING);
    const lock = [...w.state.mars.txs.values()][0];
    const reclaim = new bitcoin.Transaction();
    reclaim.addInput(Buffer.from(lock.getId(), 'hex').reverse(), 0);
    reclaim.addOutput(htlcOutputScript(swapContracts(swap).btc), 1);
    w.state.mars.txs.set(reclaim.getId(), reclaim);
    w.state.marsHeight = swap.marsLocktime;
    await w.engine.advance(swap);
    expect(swap.state).toBe(SwapState.UNCLAIMED);
  });

  describe('against misbehaving services', () => {
    const paidSwap = async w => {
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      await w.engine.pay(swap, w.wallet);
      w.confirmAll(); // the payment is mined
      return swap;
    };

    it('refuses an offer when the relay and the second node disagree about the Marscoin height', async () => {
      // A relay reporting an old block would make a nearly expired lock look safe.
      const w = world();
      w.state.explorerHeightOffset = 229;
      await expect(w.start()).rejects.toThrow('disagree about the current block');
      expect(w.chain.accept).not.toHaveBeenCalled();
    });

    it('judges the lock by the higher of two agreeing heights, and re-checks before paying', async () => {
      const w = world();
      w.state.explorerHeightOffset = 3;
      // 206 blocks remain by the relay, 203 by the second node: one block short of the safe gap.
      await expect(w.start({ marsLocktime: w.state.marsHeight + 209 })).rejects.toThrow('too close');
      const ok = world();
      const swap = await toReadyToPay(ok);
      ok.fundWallet(50000);
      ok.state.explorerHeightOffset = 40;
      await expect(ok.engine.pay(swap, ok.wallet)).rejects.toThrow('disagree about the current block');
      expect(ok.state.btcBroadcasts).toHaveLength(0);
    });

    it('builds the claim from the verified lock even if the relay misreports it afterwards', async () => {
      const w = world();
      const swap = await paidSwap(w);
      w.makerClaimsBtc(swap);
      const honest = w.chain.unspent;
      w.chain.unspent = async script => (await honest(script)).map(utxo => ({ ...utxo, value: utxo.value + 1, txid: 'ee'.repeat(32) }));
      await w.engine.advance(swap);
      const claim = bitcoin.Transaction.fromHex(swap.marsClaim.hex);
      expect(Buffer.from(claim.ins[0].hash).reverse().toString('hex')).toBe(swap.marsFunding.txid);
      expect(claim.outs[0].value).toBe(7050000000 - 100000);
      w.confirmAll();
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.COMPLETED);
    });

    it('does not call the swap complete on the relay’s word alone', async () => {
      const w = world();
      const swap = await paidSwap(w);
      w.makerClaimsBtc(swap);
      // The relay accepts the claim, never relays it, and reports it confirmed.
      w.state.swallowMarsBroadcasts = true;
      w.chain.history = async () => [{ txid: swap.marsClaim?.txid, height: w.state.marsHeight }];
      await w.engine.advance(swap);
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.CLAIMING);
      w.state.swallowMarsBroadcasts = false;
      await w.engine.advance(swap);
      w.confirmAll();
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.COMPLETED);
    });

    it('keeps trying after the deadline while the lock is still there', async () => {
      const w = world();
      const swap = await paidSwap(w);
      w.makerClaimsBtc(swap);
      w.state.swallowMarsBroadcasts = true;
      w.state.marsHeight = swap.marsLocktime + 5;
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.CLAIMING);
    });

    it('finds the seller’s claim when the address history is flooded and omits it', async () => {
      const w = world();
      const swap = await paidSwap(w);
      await w.engine.advance(swap);
      const claim = w.makerClaimsBtc(swap);
      const full = w.btc.transactions;
      w.btc.transactions = async address => (await full(address)).filter(tx => tx.txid !== claim.getId());
      await w.engine.advance(swap);
      expect(swap.preimage).toBe(preimage.toString('hex'));
      expect(swap.state).toBe(SwapState.CLAIMING);
    });

    it('does not treat an invented spend as a refund', async () => {
      const w = world();
      const swap = await paidSwap(w);
      await w.engine.advance(swap);
      // One service claims the contract was spent by an unrelated, confirmed transaction.
      const unrelated = txHexPaying(Buffer.from('6a', 'hex'), 0, 9);
      w.state.btcTxs.set(unrelated.getId(), { tx: unrelated, confirmed: true });
      w.btc.outspend = async () => ({ spent: true, txid: unrelated.getId(), confirmed: true });
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.BTC_SENT);
      w.state.btcHeight = swap.btcLocktime;
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.REFUNDING);
      expect(w.state.btcBroadcasts).toContain(swap.btcRefunds[0].hex);
    });

    it('is refunded only by its own refund transaction', async () => {
      const w = world();
      const swap = await paidSwap(w);
      w.state.btcHeight = swap.btcLocktime;
      await w.engine.advance(swap);
      // Someone else spends the contract with a transaction that is not ours and carries no secret we can read.
      const funding = bitcoin.Transaction.fromHex(swap.btcPayment.hex);
      const other = new bitcoin.Transaction();
      other.addInput(funding.getHash(), 0);
      other.addOutput(Buffer.from('6a', 'hex'), 0);
      w.state.btcTxs.delete(swap.btcRefunds[0].txid);
      w.state.btcTxs.set(other.getId(), { tx: other, confirmed: true });
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.BTC_SENT);
      expect(swap.error).toMatch(/Reading the secret/);
    });

    it('ignores dust sent to the contract by someone else', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      const dust = txHexPaying(swapContracts(swap).btcOutput, 330, 6);
      w.state.btcTxs.set(dust.getId(), { tx: dust, confirmed: true });
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.READY_TO_PAY);
      w.fundWallet(50000);
      await w.engine.pay(swap, w.wallet);
      expect(swap.state).toBe(SwapState.BTC_SENT);
    });

    it('returns a second payment left in the contract after the swap completed', async () => {
      const w = world();
      const swap = await paidSwap(w);
      w.makerClaimsBtc(swap);
      const second = txHexPaying(swapContracts(swap).btcOutput, swap.btcAmount, 8);
      w.state.btcTxs.set(second.getId(), { tx: second, confirmed: true });
      await w.engine.advance(swap);
      w.confirmAll();
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.COMPLETED);
      expect(swap.btcRefunds).toHaveLength(0);
      w.state.btcHeight = swap.btcLocktime;
      w.state.time += 700000;
      await w.engine.advance(swap);
      expect(swap.btcRefunds).toHaveLength(1);
      expect(swap.btcRefunds[0].funding).toBe(`${second.getId()}:0`);
      expect(swap.state).toBe(SwapState.COMPLETED);
    });

    it('returns a payment that arrived after the swap was cancelled', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      await w.engine.cancel(swap);
      expect(swap.state).toBe(SwapState.FAILED);
      const late = txHexPaying(swapContracts(swap).btcOutput, swap.btcAmount, 8);
      w.state.btcTxs.set(late.getId(), { tx: late, confirmed: true });
      w.state.btcHeight = swap.btcLocktime;
      w.state.time += 700000;
      await w.engine.tick();
      expect(swap.btcRefunds).toHaveLength(1);
      expect(w.state.btcBroadcasts).toContain(swap.btcRefunds[0].hex);
    });

    it('cannot cancel a swap while it is being paid', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      const [paid, cancelled] = await Promise.allSettled([w.engine.pay(swap, w.wallet), w.engine.cancel(swap)]);
      expect(paid.status).toBe('fulfilled');
      expect(cancelled.status).toBe('rejected');
      expect(swap.state).toBe(SwapState.BTC_SENT);
    });

    it('re-prices an unconfirmed refund when fees rise, and not otherwise', async () => {
      const w = world();
      const swap = await paidSwap(w);
      w.state.btcHeight = swap.btcLocktime;
      await w.engine.advance(swap);
      expect(swap.btcRefunds.map(refund => refund.fee)).toEqual([600]);
      // The first refund never reached a miner.
      w.state.btcTxs.delete(swap.btcRefunds[0].txid);
      w.state.feeRate = 5;
      await w.engine.advance(swap);
      expect(swap.btcRefunds).toHaveLength(1);
      w.state.btcTxs.delete(swap.btcRefunds[0].txid);
      w.state.feeRate = 12;
      await w.engine.advance(swap);
      expect(swap.btcRefunds.map(refund => refund.fee)).toEqual([600, 1800]);
      w.confirmAll();
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.REFUNDED);
    });

    it('keeps an unsent payment when the services merely failed to answer', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      w.btc.broadcast.mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { status: 503 }));
      await w.engine.pay(swap, w.wallet);
      expect(swap.btcPayment).not.toBeNull();
      expect(swap.state).toBe(SwapState.BTC_SENT);
    });

    it('clears a reported problem once a pass succeeds', async () => {
      const w = world();
      const swap = await paidSwap(w);
      const tip = w.btc.tipHeight;
      w.btc.tipHeight = async () => {
        throw new Error('offline');
      };
      await w.engine.tick();
      expect(swap.lastProblem).toBe('offline');
      w.btc.tipHeight = tip;
      await w.engine.tick();
      expect(swap.lastProblem).toBeNull();
    });
  });

  describe('a payment that does not confirm', () => {
    it('is withdrawn to the wallet once the safe window closes', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      await w.engine.pay(swap, w.wallet);
      const payment = bitcoin.Transaction.fromHex(swap.btcPayment.hex);
      expect(swap.btcPayment.inputs).toHaveLength(1);

      // Still in the mempool with under two hours left.
      w.state.btcHeight = swap.btcLocktime - 11;
      await w.engine.advance(swap);
      expect(swap.error).toMatch(/Returning it to your wallet/);
      const cancel = bitcoin.Transaction.fromHex(swap.btcCancel.hex);
      expect(Buffer.from(cancel.ins[0].hash).equals(Buffer.from(payment.ins[0].hash))).toBe(true);
      expect(cancel.outs).toHaveLength(1);
      expect(bitcoin.address.fromOutputScript(cancel.outs[0].script, BTC_NETWORK)).toBe(w.wallet.address(0, 1));
      expect(swap.btcCancel.fee).toBeGreaterThan(swap.btcPayment.fee + payment.virtualSize());
      expect(w.state.btcTxs.has(payment.getId())).toBe(false);

      // Nothing new is signed while waiting; once it confirms the swap is over.
      await w.engine.advance(swap);
      expect(swap.btcCancel.txid).toBe(cancel.getId());
      expect(swap.state).toBe(SwapState.BTC_SENT);
      w.confirmAll();
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.FAILED);
      expect(swap.error).toMatch(/returned to your wallet/);
      expect(swap.btcRefunds).toHaveLength(0);
    });

    it('is left alone once it has confirmed, and then follows the normal refund path', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      await w.engine.pay(swap, w.wallet);
      w.confirmAll();
      w.state.btcHeight = swap.btcLocktime - 5;
      await w.engine.advance(swap);
      expect(swap.btcCancel).toBeUndefined();
      expect(swap.state).toBe(SwapState.BTC_SENT);
      w.state.btcHeight = swap.btcLocktime;
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.REFUNDING);
    });

    it('still completes the swap if the original payment confirms after all', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      await w.engine.pay(swap, w.wallet);
      const payment = swap.btcPayment.hex;
      w.state.btcHeight = swap.btcLocktime - 11;
      // The replacement never propagates; a miner confirms the original.
      w.btc.broadcast.mockImplementation(async () => true);
      await w.engine.advance(swap);
      expect(swap.btcCancel).toBeDefined();
      w.state.btcTxs.get(bitcoin.Transaction.fromHex(payment).getId()).confirmed = true;
      w.makerClaimsBtc(swap);
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.CLAIMING);
    });
  });

  describe('watchtower', () => {
    const paid = async w => {
      const swap = await toReadyToPay(w);
      w.fundWallet(50000);
      await w.engine.pay(swap, w.wallet);
      w.confirmAll(); // the payment is mined
      await w.engine.advance(swap);
      return swap;
    };

    it('hands over a claim that needs only the secret, and refunds valid only from the timelock', async () => {
      const w = world();
      const swap = await paid(w);
      expect(swap.watch).toMatchObject({ id: 'f'.repeat(64) });
      const [pack] = w.state.watches;
      const contracts = swapContracts(swap);
      const funding = bitcoin.Transaction.fromHex(swap.btcPayment.hex);
      expect(pack).toMatchObject({
        version: 1,
        payment_hash160: paymentHash.toString('hex'),
        btc: {
          htlc_script: contracts.btc.toString('hex'),
          funding_txid: funding.getId(),
          funding_vout: 0,
          funding_value: 6244,
          locktime: swap.btcLocktime,
        },
        mars: {
          htlc_script: contracts.mars.toString('hex'),
          funding_txid: swap.marsFunding.txid,
          funding_value: 7050000000,
          locktime: swap.marsLocktime,
        },
      });
      expect(Object.keys(pack).sort()).toEqual(['btc', 'mars', 'payment_hash160', 'version']);

      // Refunds: rising fees, each spending only the contract, each to our wallet, none valid early.
      const refunds = pack.btc.refund_txs.map(hex => bitcoin.Transaction.fromHex(hex));
      expect(refunds.map(tx => 6244 - tx.outs[0].value)).toEqual([600, 1200, 2400]);
      for (const tx of refunds) {
        expect(tx.locktime).toBe(swap.btcLocktime);
        expect(tx.ins).toHaveLength(1);
        expect(tx.ins[0].sequence).toBeLessThan(0xffffffff);
        expect(Buffer.from(tx.ins[0].hash).reverse().toString('hex')).toBe(funding.getId());
        expect(tx.ins[0].witness[1]).toHaveLength(0);
        expect(bitcoin.address.fromOutputScript(tx.outs[0].script, BTC_NETWORK)).toBe(w.wallet.address(0, 1));
        expect(tx.toBuffer().length).toBeLessThanOrEqual(1024);
      }
      // We recognise every one of them as our own.
      expect(swap.btcRefunds.map(refund => refund.txid)).toEqual(refunds.map(tx => tx.getId()));

      // Claim: a zero placeholder where the secret goes, paying our Marscoin address.
      const claim = bitcoin.Transaction.fromHex(pack.mars.claim_tx);
      expect(claim.ins[0].witness[1].equals(Buffer.alloc(32))).toBe(true);
      expect(bitcoin.address.fromOutputScript(claim.outs[0].script, MARS_NETWORK)).toBe(MARS_DESTINATION);
      expect(JSON.stringify(pack)).not.toContain(w.swapKey(swap.keyIndex).toString('hex'));

      // With the secret filled in it is exactly the claim the phone itself would send.
      w.makerClaimsBtc(swap);
      await w.engine.advance(swap);
      expect(pack.mars.claim_tx.replace(`20${'00'.repeat(32)}`, `20${preimage.toString('hex')}`)).toBe(swap.marsClaim.hex);

      require('fs').writeFileSync('/tmp/mw-watch-package.json', JSON.stringify(pack));
    });

    it('registers once, and recognises a refund sent by the watchtower as its own', async () => {
      const w = world();
      const swap = await paid(w);
      await w.engine.advance(swap);
      await w.engine.advance(swap);
      expect(w.chain.watchRegister).toHaveBeenCalledTimes(1);
      // The phone stays off; at the timelock the watchtower sends the middle refund.
      w.state.btcHeight = swap.btcLocktime;
      const sent = bitcoin.Transaction.fromHex(w.state.watches[0].btc.refund_txs[1]);
      w.state.btcTxs.set(sent.getId(), { tx: sent, confirmed: true });
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.REFUNDED);
    });

    it('uses the cheapest suitable refund it already signed rather than signing another', async () => {
      const w = world();
      const swap = await paid(w);
      w.state.btcHeight = swap.btcLocktime;
      await w.engine.advance(swap);
      expect(swap.btcRefunds).toHaveLength(3);
      expect(w.state.btcBroadcasts).toContain(swap.btcRefunds[0].hex);
      expect(w.state.btcBroadcasts).not.toContain(swap.btcRefunds[2].hex);
    });

    it('carries on without a watchtower, and tries again when registration fails', async () => {
      const w = world();
      w.state.watchtower = false;
      const swap = await paid(w);
      expect(swap.watch).toBeUndefined();
      expect(swap.state).toBe(SwapState.BTC_SENT);

      const second = world();
      second.chain.watchRegister.mockRejectedValueOnce(new Error('daily limit reached'));
      const other = await paid(second);
      expect(other.watch).toBeUndefined();
      expect(other.watchProblem).toBe('daily limit reached');
      expect(other.state).toBe(SwapState.BTC_SENT);
      await second.engine.advance(other);
      expect(other.watch).toMatchObject({ id: 'f'.repeat(64) });
    });

    it('does not register a swap that was paid the wrong amount', async () => {
      const w = world();
      const swap = await toReadyToPay(w);
      const overpaid = txHexPaying(swapContracts(swap).btcOutput, swap.btcAmount + 500, 4);
      w.state.btcTxs.set(overpaid.getId(), { tx: overpaid, confirmed: true });
      await w.engine.advance(swap);
      expect(swap.state).toBe(SwapState.BTC_SENT);
      expect(w.chain.watchRegister).not.toHaveBeenCalled();
    });
  });

  it('keeps advancing other swaps when one fails', async () => {
    const w = world();
    const swap = await toReadyToPay(w);
    w.fundWallet(50000);
    await w.engine.pay(swap, w.wallet);
    w.makerClaimsBtc(swap);
    w.chain.tipHeight = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(w.state.marsHeight);
    let swaps = await w.engine.tick();
    expect(swaps[0].lastProblem).toBe('offline');
    swaps = await w.engine.tick();
    expect(swaps[0].state).toBe(SwapState.CLAIMING);
  });
});
