// Maker side of an atomic swap: offering Marscoin for Bitcoin.
//
//   1. We publish an offer carrying the hash of a secret only we know.
//   2. A taker accepts and names the Bitcoin contract they will pay into.
//   3. We lock the Marscoin so that the taker can collect it with the secret,
//      and we can take it back after `marsLocktime`.
//   4. The taker pays Bitcoin into a contract we can collect from with the
//      secret, and they can take back after `btcLocktime`.
//   5. We collect the Bitcoin. That publishes the secret, and the taker uses it
//      to collect the Marscoin.
//
// What keeps this safe for us: we lock Marscoin only against a Bitcoin refund
// time that leaves room to finish; we reveal the secret only once the Bitcoin
// is confirmed in the contract we computed ourselves; and we never reveal it
// so late that the taker's refund could overtake our claim.
//
// A record plus the recovery phrase is enough to finish or unwind any swap:
// keys and the secret are derived from the phrase, never stored.
import * as bitcoin from 'bitcoinjs-lib';
import {
  BTC_NETWORK,
  MARS_NETWORK,
  buildClaimTx,
  buildHtlcScript,
  buildRefundTx,
  htlcAddress,
  htlcOutputScript,
  outputsPaying,
} from './htlc';
import {
  BTC_SPEND_VBYTES,
  DUST,
  MAKER_BTC_CONFIRMATIONS,
  MARS_SPEND_FEE,
  MARS_TIMELOCK_BLOCKS,
  btcFeeProblem,
  btcWindowProblem,
  makerClaimProblem,
  refundOrderProblem,
} from './safety';

export const MakerState = {
  OFFERED: 'offered', // published, nobody has accepted
  ACCEPTED: 'accepted', // a taker's acceptance passed our checks; Marscoin not yet locked
  LOCKING: 'locking', // lock transaction signed and saved, being broadcast
  MARS_LOCKED: 'mars_locked', // waiting for the taker's Bitcoin
  CLAIMING: 'claiming', // Bitcoin claim broadcast; the secret is public
  COMPLETED: 'completed',
  REFUNDING: 'refunding', // taking the Marscoin back after the timelock
  REFUNDED: 'refunded',
  DECLINED: 'declined', // an acceptance we refused; nothing was locked
  LOST: 'lost', // the secret was revealed, the Marscoin collected, and our Bitcoin claim overtaken
};

const FINISHED = [MakerState.COMPLETED, MakerState.REFUNDED, MakerState.DECLINED, MakerState.LOST];
export const isMakerFinished = record => FINISHED.includes(record.state);
// Marscoin promised or in flight but not yet out of the confirmed balance.
const COMMITTED = [MakerState.OFFERED, MakerState.ACCEPTED];
const DAY = 24 * 3600;
// Zubrins per byte for the lock transaction. Generous: it must confirm promptly.
const MARS_FEE_PER_BYTE = 1000;
// The Bitcoin claim pays above the going rate: it races the taker's refund.
const CLAIM_FEE_MULTIPLE = 2;
const CLAIM_BUMP = 1.5;
// The claim never pays more than this share of the payment in fees.
const MAX_CLAIM_FEE_SHARE = 0.25;
// Offers are posted only while collecting would cost at most this share.
const MAX_OFFER_FEE_SHARE = 0.1;
// Longer than this between checks and we were not watching.
const AWAY_SECONDS = 30 * 60;
const PREIMAGE_TAG = Buffer.from('martian-republic/swap-secret/v1');

const buffer = value => Buffer.from(value, 'hex');
const pubkeyPattern = /^0[23][0-9a-f]{64}$/;

export function makerContracts(record) {
  const hash160 = buffer(record.paymentHash);
  const mine = buffer(record.pubkey);
  const taker = buffer(record.takerPubkey);
  const mars = buildHtlcScript({ hash160, recipientPubkey: taker, senderPubkey: mine, locktime: record.marsLocktime });
  const btc = buildHtlcScript({ hash160, recipientPubkey: mine, senderPubkey: taker, locktime: record.btcLocktime });
  return { hash160, mars, btc, marsOutput: htlcOutputScript(mars), btcOutput: htlcOutputScript(btc) };
}

// The secret for a contract key. Derived, so it is never written to storage.
export const secretFor = privateKey => bitcoin.crypto.sha256(Buffer.concat([PREIMAGE_TAG, privateKey]));

// Pays `amount` to the contract from ordinary (pay-to-address) coins, with
// change back to the same address. `coins` carry the raw transaction that
// created them, which is what the signature commits to.
export function buildLockTx({ coins, amount, contractAddress, changeAddress, privateKey }) {
  const key = bitcoin.ECPair.fromPrivateKey(privateKey, { network: MARS_NETWORK });
  const chosen = [];
  let total = 0;
  let fee = 0;
  for (const coin of [...coins].sort((a, b) => b.value - a.value)) {
    chosen.push(coin);
    total += coin.value;
    fee = (10 + 148 * chosen.length + 43 + 34) * MARS_FEE_PER_BYTE;
    if (total >= amount + fee) break;
  }
  if (total < amount + fee) return null;
  const psbt = new bitcoin.Psbt({ network: MARS_NETWORK });
  psbt.setMaximumFeeRate(MARS_FEE_PER_BYTE * 4);
  for (const coin of chosen) {
    const source = bitcoin.Transaction.fromHex(coin.rawTx);
    if (source.getId() !== coin.txid || source.outs[coin.vout]?.value !== coin.value)
      throw new Error('A wallet coin could not be verified.');
    psbt.addInput({ hash: coin.txid, index: coin.vout, nonWitnessUtxo: Buffer.from(coin.rawTx, 'hex'), sequence: 0xfffffffe });
  }
  psbt.addOutput({ address: contractAddress, value: amount });
  const change = total - amount - fee;
  if (change > DUST) psbt.addOutput({ address: changeAddress, value: change });
  psbt.signAllInputs(key);
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { txid: tx.getId(), hex: tx.toHex(), vout: 0, value: amount, inputs: chosen.map(coin => `${coin.txid}:${coin.vout}`) };
}

// Why a taker's acceptance cannot be acted on, or null. Nothing in it is trusted.
export function acceptanceProblem(record, acceptance, { marsHeight, btcHeight }) {
  const { taker_pubkey: takerPubkey, btc_htlc_address: address, btc_locktime: btcLocktime } = acceptance || {};
  if (typeof takerPubkey !== 'string' || !pubkeyPattern.test(takerPubkey) || takerPubkey === record.pubkey) {
    return 'The acceptance carries no valid key.';
  }
  if (!Number.isSafeInteger(btcLocktime) || btcLocktime <= 0 || btcLocktime >= 500000000)
    return 'The acceptance carries no valid refund time.';
  // Our own computation of the contract must match what the taker will pay into.
  const contracts = makerContracts({ ...record, takerPubkey, btcLocktime });
  if (htlcAddress(contracts.btc, BTC_NETWORK) !== address) return 'The acceptance names a different Bitcoin contract.';
  const heights = { marsHeight, marsLocktime: record.marsLocktime, btcHeight, btcLocktime };
  // Too little time to be paid, or a Bitcoin refund that opens too close to
  // ours: the taker could then take back the Bitcoin and still collect.
  return btcWindowProblem(heights) || refundOrderProblem(heights);
}

export function createMakerEngine({ chain, btc, store, keyFor, funds, now, random }) {
  const seconds = () => Math.floor(now() / 1000);
  // `random` may be asynchronous (the platform's secure generator is).
  const hardened = async () => (await random(4)).readUInt32BE(0) >>> 1; // eslint-disable-line no-bitwise

  // What is in memory never runs ahead of what is stored: a step that could
  // not be saved did not happen.
  async function save(record, patch) {
    const before = { ...record };
    Object.assign(record, patch, { updatedAt: seconds() });
    try {
      await store.save(record);
    } catch (error) {
      for (const key of Object.keys(record)) delete record[key];
      Object.assign(record, before);
      throw error;
    }
    return record;
  }

  // One operation at a time: posting, withdrawing and the periodic pass all
  // read and then write the same records and spend the same coins.
  let queue = Promise.resolve();
  function exclusive(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  const keyOf = record => keyFor(record.keyPath);

  // ---- Funds -----------------------------------------------------------------

  // Confirmed coins not already spent by one of our own lock transactions.
  async function spendable(records) {
    const used = new Set(records.flatMap(record => record.marsFunding?.inputs || []));
    return (await funds.coins()).filter(coin => coin.height > 0 && !used.has(`${coin.txid}:${coin.vout}`));
  }

  // What the automatic maker may plan with.
  async function position() {
    const records = await store.all();
    const coins = await spendable(records);
    const since = seconds() - DAY;
    return {
      confirmed: coins.reduce((sum, coin) => sum + coin.value, 0),
      committed: records.filter(record => COMMITTED.includes(record.state)).reduce((sum, record) => sum + record.marsAmount, 0),
      soldToday: records
        .filter(record => record.acceptedAt > since && record.state !== MakerState.DECLINED && !COMMITTED.includes(record.state))
        .reduce((sum, record) => sum + record.marsAmount, 0),
    };
  }

  // ---- Offers ----------------------------------------------------------------

  // Publish offers: [{ marsAmount, btcAmount }]. Returns the records created.
  async function post(plan, { lifetime, btcDestination }) {
    bitcoin.address.toOutputScript(btcDestination, BTC_NETWORK);
    const [marsHeight, feeRate] = await Promise.all([chain.agreedTipHeight(), btc.feeRate({ highest: true })]);
    const created = [];
    for (const { marsAmount, btcAmount } of plan) {
      if (!Number.isSafeInteger(marsAmount) || !Number.isSafeInteger(btcAmount) || marsAmount <= MARS_SPEND_FEE + DUST) continue;
      // An offer we could not afford to collect on is not worth making.
      if (btcFeeProblem({ btcAmount, feeRate: feeRate * CLAIM_FEE_MULTIPLE })) continue;
      if (feeRate * CLAIM_FEE_MULTIPLE * BTC_SPEND_VBYTES > btcAmount * MAX_OFFER_FEE_SHARE) continue;
      const keyPath = [await hardened(), await hardened()];
      const privateKey = keyFor(keyPath);
      const record = {
        id: (await random(16)).toString('hex'),
        createdAt: seconds(),
        updatedAt: seconds(),
        state: MakerState.OFFERED,
        error: null,
        marsAmount,
        btcAmount,
        keyPath,
        pubkey: bitcoin.ECPair.fromPrivateKey(privateKey).publicKey.toString('hex'),
        paymentHash: bitcoin.crypto.hash160(secretFor(privateKey)).toString('hex'),
        marsLocktime: marsHeight + MARS_TIMELOCK_BLOCKS,
        expiresAt: seconds() + lifetime,
        btcDestination,
        acceptedAt: 0,
        takerPubkey: null,
        btcLocktime: null,
        btcHtlcAddress: null,
        marsHtlcAddress: null,
        marsFunding: null,
        btcFunding: null,
        btcClaims: [],
        claimSeen: false,
        marsRefund: null,
        reported: false,
        away: false,
        checkedAt: 0,
      };
      // Durable before it is public: an acceptance must always find its record.
      await store.save(record);
      try {
        await chain.postOffer({
          offer_id: record.id,
          mars_amount_sat: marsAmount,
          btc_amount_sat: btcAmount,
          rate: btcAmount / marsAmount,
          maker_pubkey: record.pubkey,
          payment_hash160: record.paymentHash,
          mars_htlc_address: '',
          mars_htlc_script: '',
          mars_locktime: record.marsLocktime,
          expires_at: record.expiresAt,
          maker_address: '',
          last_seen: record.createdAt,
          signature: '',
        });
        created.push(record);
      } catch {
        // The relay may have stored it all the same. The record stays until
        // the offer would have expired, so an acceptance still finds it.
      }
    }
    return created;
  }

  // Take back offers nobody has accepted. An offer the relay will not let us
  // cancel stays live until it expires, so its record is kept until then.
  async function withdraw() {
    for (const record of (await store.all()).filter(item => item.state === MakerState.OFFERED)) {
      let acceptance;
      try {
        acceptance = await chain.acceptance(record.id);
      } catch {
        continue; // unknown; leave it for the next pass
      }
      if (acceptance) continue; // taken: the next pass deals with it
      if ((await chain.cancelOffer(record.id)) || record.expiresAt <= seconds()) await store.remove(record.id);
    }
  }

  // ---- Progress --------------------------------------------------------------

  async function offered(record) {
    const acceptance = await chain.acceptance(record.id);
    if (!acceptance) {
      // A minute's grace for an acceptance made at the last moment.
      if (record.expiresAt + 60 <= seconds()) await store.remove(record.id);
      return;
    }
    const [marsHeight, btcHeight] = await Promise.all([chain.agreedTipHeight(), btc.agreedTipHeight()]);
    const problem = acceptanceProblem(record, acceptance, { marsHeight, btcHeight });
    if (problem) {
      await chain.reportAbandoned(record.id);
      return save(record, { state: MakerState.DECLINED, error: problem, acceptedAt: seconds() });
    }
    const patch = { takerPubkey: acceptance.taker_pubkey, btcLocktime: acceptance.btc_locktime };
    const contracts = makerContracts({ ...record, ...patch });
    await save(record, {
      ...patch,
      btcHtlcAddress: htlcAddress(contracts.btc, BTC_NETWORK),
      marsHtlcAddress: htlcAddress(contracts.mars, MARS_NETWORK),
      acceptedAt: seconds(),
      state: MakerState.ACCEPTED,
      error: null,
    });
    return lock(record);
  }

  async function lock(record) {
    // Time has passed since the acceptance was checked; check again before
    // committing coins.
    const [marsHeight, btcHeight] = await Promise.all([chain.agreedTipHeight(), btc.agreedTipHeight()]);
    const heights = { marsHeight, marsLocktime: record.marsLocktime, btcHeight, btcLocktime: record.btcLocktime };
    const late = btcWindowProblem(heights) || refundOrderProblem(heights);
    if (late) return save(record, { state: MakerState.DECLINED, error: 'The Marscoin could not be locked in time. Nothing was sent.' });

    const coins = await spendable((await store.all()).filter(item => item.id !== record.id));
    const withSource = [];
    let gathered = 0;
    for (const coin of coins.sort((a, b) => b.value - a.value)) {
      withSource.push({ ...coin, rawTx: await funds.rawTx(coin.txid) });
      gathered += coin.value;
      if (gathered >= record.marsAmount + MARS_FEE_PER_BYTE * 2000) break;
    }
    const funding = buildLockTx({
      coins: withSource,
      amount: record.marsAmount,
      contractAddress: record.marsHtlcAddress,
      changeAddress: funds.address,
      privateKey: funds.privateKey(),
    });
    if (!funding) return save(record, { error: 'Waiting for enough confirmed Marscoin to lock.' });
    // Saved before it is sent: from here the coins are spoken for.
    await save(record, { marsFunding: funding, state: MakerState.LOCKING, error: null });
    return locking(record);
  }

  async function locking(record) {
    const contracts = makerContracts(record);
    let sent = true;
    try {
      await chain.broadcast(record.marsFunding.hex);
    } catch {
      sent = false;
    }
    if (!sent) {
      const seen = (await chain.unspent(contracts.marsOutput)).some(utxo => utxo.txid === record.marsFunding.txid);
      if (!seen) return save(record, { error: 'Locking Marscoin. The transaction will be sent again shortly.' });
    }
    return save(record, { state: MakerState.MARS_LOCKED, lockedAt: seconds(), error: null });
  }

  // The taker's payment: an unspent output of the contract we computed,
  // holding at least the agreed amount. Amounts come from the raw transaction,
  // which must hash to its ID. Its block, and that it is unspent, must be
  // confirmed by every Bitcoin service: one alone could otherwise describe a
  // payment that was never broadcast and so draw the secret out of us.
  async function findBtcPayment(record, contracts, btcHeight) {
    let best = null;
    for (const tx of await btc.transactions(record.btcHtlcAddress)) {
      let hex;
      try {
        hex = await btc.transactionHex(tx.txid);
      } catch {
        continue;
      }
      for (const output of outputsPaying(hex, contracts.btcOutput)) {
        if (output.value < record.btcAmount) continue;
        const height = await btc.confirmedHeight(output.txid).catch(() => 0);
        const confirmations = height > 0 ? Math.max(0, btcHeight - height + 1) : 0;
        const unspent = await btc.unspentEverywhere(output.txid, output.vout).catch(() => false);
        // An unconfirmed payment is worth reporting; a confirmed one counts only while unspent.
        if (confirmations > 0 && !unspent) continue;
        if (!best || confirmations > best.confirmations)
          best = { txid: output.txid, vout: output.vout, value: output.value, confirmations };
      }
    }
    return best;
  }

  // What to pay for the claim. It races the buyer's refund, so the highest
  // rate any service reports is doubled; a service cannot talk it down. It is
  // capped at a share of the payment, so a service cannot burn it either.
  async function claimFee(value) {
    const feeRate = await btc.feeRate({ highest: true });
    return Math.min(Math.ceil(feeRate * CLAIM_FEE_MULTIPLE * BTC_SPEND_VBYTES), Math.floor(value * MAX_CLAIM_FEE_SHARE), value - DUST);
  }

  // Deterministic: the same payment and fee always give the same transaction,
  // so only the fee is stored and the secret never sits in storage.
  function claimFor(record, contracts, payment, fee) {
    const privateKey = keyOf(record);
    const tx = buildClaimTx({
      script: contracts.btc,
      txid: payment.txid,
      vout: payment.vout,
      value: payment.value,
      fee,
      preimage: secretFor(privateKey),
      privkey: privateKey,
      destination: record.btcDestination,
      network: BTC_NETWORK,
    });
    return { txid: tx.getId(), hex: tx.toHex(), fee };
  }
  const stored = claim => ({ txid: claim.txid, fee: claim.fee });

  async function marsLocked(record) {
    const contracts = makerContracts(record);
    // The refund depends on the Marscoin chain alone; an unreachable Bitcoin
    // service must never hold it up.
    const marsHeight = await chain.agreedTipHeight();
    if (marsHeight >= record.marsLocktime) return refund(record, contracts);
    // Whether we were present for the buyer's whole payment window. If not,
    // a buyer who gave up is not at fault.
    const gap = seconds() - (record.checkedAt || record.lockedAt || seconds());
    const away = record.away || gap > AWAY_SECONDS;
    // Judged from the highest tip any service reports: time may only run short.
    const btcHeight = await btc.tipHeight();
    const payment = await findBtcPayment(record, contracts, btcHeight);
    const seen = { checkedAt: seconds(), away, error: null };
    if (!payment) return save(record, { ...seen, note: 'Marscoin locked. Waiting for the buyer to pay Bitcoin.' });
    if (payment.confirmations < MAKER_BTC_CONFIRMATIONS) {
      return save(record, {
        ...seen,
        btcSeen: true,
        note: `Bitcoin payment seen. Waiting for confirmation (${payment.confirmations} of ${MAKER_BTC_CONFIRMATIONS}).`,
      });
    }
    if (makerClaimProblem({ btcHeight, btcLocktime: record.btcLocktime })) {
      // Revealing the secret now could lose both coins. Let the swap unwind:
      // the buyer takes back the Bitcoin, we take back the Marscoin.
      return save(record, { ...seen, btcSeen: true, note: 'The Bitcoin arrived too late to collect safely. Your Marscoin will return.' });
    }
    const fee = await claimFee(payment.value);
    if (fee <= 0) return save(record, { ...seen, error: 'The Bitcoin payment is too small to collect.' });
    const claim = claimFor(record, contracts, payment, fee);
    // Saved before the secret leaves the phone.
    await save(record, {
      ...seen,
      btcFunding: { txid: payment.txid, vout: payment.vout, value: payment.value },
      btcClaims: [stored(claim)],
      claimSeen: false,
      btcSeen: true,
      state: MakerState.CLAIMING,
      note: null,
    });
    return claiming(record);
  }

  async function claiming(record) {
    const contracts = makerContracts(record);
    const { btcFunding } = record;
    const ours = txid => record.btcClaims.some(claim => claim.txid === txid);
    const outspend = await btc.outspend(btcFunding.txid, btcFunding.vout);
    if (outspend.spent) {
      // Believed only when every service shows that transaction in a block.
      const settled = (await btc.confirmedHeight(outspend.txid).catch(() => 0)) > 0;
      if (ours(outspend.txid)) {
        if (settled) return save(record, { state: MakerState.COMPLETED, completedAt: seconds(), claimSeen: true, error: null, note: null });
        if (!record.claimSeen) await save(record, { claimSeen: true });
      } else if (settled) {
        // The buyer's refund confirmed first. The secret is public, so the
        // Marscoin may be collected too; take it back the moment that is allowed.
        if ((await chain.agreedTipHeight()) >= record.marsLocktime) return refund(record, contracts);
        return save(record, { claimSeen: true, error: 'The buyer took the Bitcoin back before your claim confirmed.' });
      }
    }
    if (!record.claimSeen) {
      // No service has seen our claim, so the secret is still ours. Past the
      // safe margin it must stay that way: the swap unwinds instead.
      const btcHeight = await btc.tipHeight();
      if (makerClaimProblem({ btcHeight, btcLocktime: record.btcLocktime })) {
        if ((await chain.agreedTipHeight()) >= record.marsLocktime) return refund(record, contracts);
        return save(record, { error: null, note: 'The Bitcoin could not be collected in time. Your Marscoin will return.' });
      }
    }
    // Send it again, paying more if fees have risen.
    const latest = record.btcClaims[record.btcClaims.length - 1];
    const wanted = await claimFee(btcFunding.value).catch(() => 0);
    let fee = latest.fee;
    if (wanted > latest.fee * CLAIM_BUMP) {
      fee = wanted;
      await save(record, { btcClaims: [...record.btcClaims, stored(claimFor(record, contracts, btcFunding, fee))] });
    }
    let sent = true;
    try {
      await btc.broadcast(claimFor(record, contracts, btcFunding, fee).hex);
    } catch {
      sent = false;
    }
    return save(record, {
      claimSeen: record.claimSeen || sent,
      error: sent ? null : 'Collecting Bitcoin. The transaction will be sent again shortly.',
    });
  }

  // Take the Marscoin back after the timelock. Nothing here is final until a
  // second node shows what became of the locked Marscoin.
  async function refund(record, contracts) {
    if (!record.reported && !record.btcSeen && !record.away) {
      // The buyer accepted and never paid, though we were here. Tell the relay, once.
      await chain.reportAbandoned(record.id);
      await save(record, { reported: true });
    }
    const funding = record.marsFunding;
    if (!record.marsRefund) {
      const tx = buildRefundTx({
        script: contracts.mars,
        txid: funding.txid,
        vout: funding.vout,
        value: funding.value,
        fee: MARS_SPEND_FEE,
        locktime: record.marsLocktime,
        privkey: keyOf(record),
        destination: funds.address,
        network: MARS_NETWORK,
      });
      await save(record, { marsRefund: { txid: tx.getId(), hex: tx.toHex() }, state: MakerState.REFUNDING, error: null, note: null });
    } else if (record.state !== MakerState.REFUNDING) {
      await save(record, { state: MakerState.REFUNDING, error: null, note: null });
    }
    let spender;
    try {
      spender = await chain.explorerSpender(funding.txid, funding.vout);
    } catch {
      spender = undefined; // the second node cannot say yet
    }
    if (spender === record.marsRefund.txid) {
      const paid = await chain.explorerOutput(spender, 0).catch(() => null);
      if (paid && paid.confirmations >= 1) return save(record, { state: MakerState.REFUNDED, error: null });
      return record; // ours, awaiting a block
    }
    if (spender) {
      // Collected by someone else, which takes the secret. If we revealed it,
      // the buyer has both coins unless our Bitcoin claim still confirms.
      if (record.btcClaims.length) return save(record, { state: MakerState.LOST, error: null });
      return save(record, { error: 'The locked Marscoin was spent unexpectedly. Contact the Republic with this record.' });
    }
    await chain.broadcast(record.marsRefund.hex).catch(() => {});
    return record;
  }

  async function advance(record) {
    switch (record.state) {
      case MakerState.OFFERED:
        return offered(record);
      case MakerState.ACCEPTED:
        return lock(record);
      case MakerState.LOCKING:
        return locking(record);
      case MakerState.MARS_LOCKED:
        return marsLocked(record);
      case MakerState.CLAIMING:
        return claiming(record);
      case MakerState.REFUNDING:
        return refund(record, makerContracts(record));
      default:
        return record;
    }
  }

  // One pass over every unfinished record. A failure on one never stops the rest.
  async function tick() {
    for (const record of await store.all()) {
      if (isMakerFinished(record)) continue;
      try {
        await advance(record);
      } catch (error) {
        await save(record, { error: error?.message || 'This swap could not be advanced. It will be tried again.' }).catch(() => {});
      }
    }
  }

  return {
    position: () => exclusive(position),
    post: (plan, options) => exclusive(() => post(plan, options)),
    withdraw: () => exclusive(withdraw),
    tick: () => exclusive(tick),
    all: () => store.all(),
  };
}
