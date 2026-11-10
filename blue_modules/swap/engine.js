// Taker state machine for a Bitcoin -> Marscoin atomic swap.
//
// The maker locks Marscoin first. We verify that lock ourselves, pay Bitcoin
// into our own contract, learn the secret when the maker claims the Bitcoin,
// and use it to claim the Marscoin. If the maker never claims, the Bitcoin
// returns to us after its timelock.
//
// Every step is persisted before it is announced or broadcast, and every pass
// starts from the chains rather than from remembered state, so a swap resumes
// correctly after the app was closed at any point.
//
// No single service is believed where money depends on it: block heights used
// for timelocks need two sources to agree, raw transactions must hash to their
// IDs, the Marscoin lock and the final claim are confirmed by a second node,
// and a state is final only when our own transaction is what settled it.
import * as bitcoin from 'bitcoinjs-lib';
import {
  BTC_NETWORK,
  MARS_NETWORK,
  buildClaimTx,
  buildHtlcScript,
  buildRefundTx,
  extractPreimage,
  htlcAddress,
  htlcOutputScript,
  merkleRoot,
  outputsPaying,
  spendsOutpoint,
} from './htlc';
import { verifyHeaderChain } from './mars-headers';
import {
  BTC_SPEND_VBYTES,
  BTC_TIMELOCK_BLOCKS,
  DUST,
  MARS_MIN_CONFIRMATIONS,
  MARS_SPEND_FEE,
  btcFeeProblem,
  btcWindowProblem,
  rankOffers,
  refundOrderProblem,
} from './safety';

export const SwapState = {
  ACCEPTING: 'accepting', // saved locally, acceptance not yet confirmed by the relay
  WAITING_MARS: 'waiting_mars', // accepted; the maker must lock Marscoin
  READY_TO_PAY: 'ready_to_pay', // Marscoin lock verified; Bitcoin may be sent
  BTC_SENT: 'btc_sent', // Bitcoin is in the contract
  CLAIMING: 'claiming', // secret known; Marscoin claim in progress
  COMPLETED: 'completed',
  REFUNDING: 'refunding', // Bitcoin refund broadcast
  REFUNDED: 'refunded',
  FAILED: 'failed', // ended with nothing at risk
  UNCLAIMED: 'unclaimed', // Bitcoin was claimed but the Marscoin could not be
};

// Nothing more will happen to these. An unclaimed swap is shown as ended but
// is still retried, in case the Marscoin turns out to be claimable after all.
const SETTLED = [SwapState.COMPLETED, SwapState.REFUNDED, SwapState.FAILED];
export const isSwapFinished = swap => SETTLED.includes(swap.state) || swap.state === SwapState.UNCLAIMED;
// States in which the relay still counts this swap as our one open acceptance.
const UNPAID = [SwapState.ACCEPTING, SwapState.WAITING_MARS, SwapState.READY_TO_PAY];
// Settled swaps are still checked for stray Bitcoin for this long.
const WATCH_SECONDS = 14 * 24 * 3600;
const WATCH_INTERVAL_SECONDS = 600;
// A refund still unconfirmed is re-priced once fees have risen this much.
const REFUND_BUMP = 1.5;
// Fee levels of the refunds given to the watchtower, as multiples of the going rate.
const WATCH_FEE_STEPS = [1, 2, 4];

const buffer = value => Buffer.from(value, 'hex');
const UNCLAIMED_MESSAGE = 'The Marscoin could not be claimed before its deadline. Contact the Republic with this swap record.';

export function swapContracts(swap) {
  const hash160 = buffer(swap.paymentHash);
  const mine = buffer(swap.pubkey);
  const maker = buffer(swap.makerPubkey);
  const mars = buildHtlcScript({ hash160, recipientPubkey: mine, senderPubkey: maker, locktime: swap.marsLocktime });
  const btc = buildHtlcScript({ hash160, recipientPubkey: maker, senderPubkey: mine, locktime: swap.btcLocktime });
  return { hash160, mars, btc, marsOutput: htlcOutputScript(mars), btcOutput: htlcOutputScript(btc) };
}

export function createSwapEngine({ chain, btc, store, swapKey, now, randomId, wallet = null, verifyHeaders = verifyHeaderChain }) {
  const seconds = () => Math.floor(now() / 1000);

  async function save(swap, patch) {
    Object.assign(swap, patch, { updatedAt: seconds() });
    await store.save(swap);
    return swap;
  }

  // One operation at a time. Paying, cancelling and the periodic pass all read
  // and then write the same record; interleaving them could cancel a swap that
  // was just paid.
  let queue = Promise.resolve();
  function exclusive(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  // ---- Offers ------------------------------------------------------------

  async function listOffers() {
    const [offers, marsHeight, btcHeight, feeRate] = await Promise.all([chain.offers(), chain.tipHeight(), btc.tipHeight(), btc.feeRate()]);
    return { offers: rankOffers(offers, { marsHeight, btcHeight, feeRate, now: seconds() }), marsHeight, btcHeight, feeRate };
  }

  // ---- Accepting ---------------------------------------------------------

  async function accept(offer, { marsDestination, btcRefundAddress }) {
    bitcoin.address.toOutputScript(marsDestination, MARS_NETWORK);
    bitcoin.address.toOutputScript(btcRefundAddress, BTC_NETWORK);
    const swaps = await store.all();
    if (swaps.some(swap => UNPAID.includes(swap.state))) {
      throw new Error('Finish or cancel your current swap before starting another.');
    }
    // Timelocks are judged from heights that independent services agree on.
    const [marsHeight, btcHeight, feeRate] = await Promise.all([chain.agreedTipHeight(), btc.agreedTipHeight(), btc.feeRate()]);
    const btcLocktime = btcHeight + BTC_TIMELOCK_BLOCKS;
    const heights = { marsHeight, marsLocktime: offer.marsLocktime, btcHeight, btcLocktime };
    const problem =
      (offer.expiresAt <= seconds() ? 'This offer has expired.' : null) ||
      refundOrderProblem(heights) ||
      btcWindowProblem(heights) ||
      btcFeeProblem({ btcAmount: offer.btcAmount, feeRate });
    if (problem) throw new Error(problem);

    const keyIndex = swaps.reduce((highest, swap) => Math.max(highest, swap.keyIndex), -1) + 1;
    const pubkey = bitcoin.ECPair.fromPrivateKey(swapKey(keyIndex)).publicKey.toString('hex');
    const swap = {
      id: randomId(),
      offerId: offer.id,
      createdAt: seconds(),
      updatedAt: seconds(),
      state: SwapState.ACCEPTING,
      error: null,
      marsAmount: offer.marsAmount,
      btcAmount: offer.btcAmount,
      keyIndex,
      pubkey,
      makerPubkey: offer.makerPubkey,
      paymentHash: offer.paymentHash,
      marsLocktime: offer.marsLocktime,
      btcLocktime,
      offerExpiresAt: offer.expiresAt,
      marsDestination,
      btcRefundAddress,
      marsFunding: null,
      btcPayment: null,
      btcFundings: [],
      preimage: null,
      marsClaim: null,
      btcRefunds: [],
    };
    const contracts = swapContracts(swap);
    swap.marsHtlcAddress = htlcAddress(contracts.mars, MARS_NETWORK);
    swap.btcHtlcAddress = htlcAddress(contracts.btc, BTC_NETWORK);
    // Durable before anyone else learns of it: this record plus the recovery
    // phrase is everything needed to refund the Bitcoin contract.
    await store.save(swap);
    await announce(swap);
    return swap;
  }

  async function announce(swap) {
    try {
      await chain.accept(swap.offerId, {
        taker_pubkey: swap.pubkey,
        btc_htlc_address: swap.btcHtlcAddress,
        btc_locktime: swap.btcLocktime,
        timestamp: swap.createdAt,
      });
      await save(swap, { state: SwapState.WAITING_MARS, error: null });
    } catch (error) {
      if (error.final || swap.offerExpiresAt <= seconds()) {
        await save(swap, { state: SwapState.FAILED, error: `${relayMessage(error)} No Bitcoin was sent.` });
      } else {
        await save(swap, { error: 'Waiting for the swap relay to confirm. This will be retried.' });
      }
    }
  }

  const relayMessage = error => {
    const text = String(error.message || 'The swap relay refused this offer.').trim();
    const sentence = text.charAt(0).toUpperCase() + text.slice(1);
    return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  };

  // ---- Verifying the maker's Marscoin lock --------------------------------

  // The explorer's independent view of the lock: right script, right value,
  // enough confirmations.
  async function secondNodeConfirms(funding, contracts) {
    const second = await chain.explorerOutput(funding.txid, funding.vout);
    return (
      second.scriptHex === contracts.marsOutput.toString('hex') &&
      second.value === funding.value &&
      second.confirmations >= MARS_MIN_CONFIRMATIONS
    );
  }

  // Returns the funding outpoint once every check passes, otherwise a short
  // reason. Nothing from the relay is trusted: the contract address is rebuilt
  // locally, the transaction is parsed locally and must hash to its ID, its
  // inclusion is checked with a merkle branch against proof-of-work-verified
  // headers, and a separate full node must
  // show the same output with enough confirmations.
  async function verifyMarsLock(swap, contracts, marsHeight) {
    const candidates = (await chain.unspent(contracts.marsOutput)).filter(utxo => utxo.value >= swap.marsAmount);
    if (!candidates.length) return { waiting: 'Waiting for the maker to lock Marscoin.', lock: { seen: false, confirmations: 0 } };
    let waiting = 'The Marscoin lock could not be verified yet.';
    // How far the best candidate has come, for showing progress.
    let lock = { seen: true, confirmations: 0 };
    for (const utxo of candidates) {
      const confirmations = utxo.height > 0 ? marsHeight - utxo.height + 1 : 0;
      if (confirmations < MARS_MIN_CONFIRMATIONS) {
        waiting = `Marscoin lock seen. Waiting for confirmation (${Math.max(confirmations, 0)} of ${MARS_MIN_CONFIRMATIONS}).`;
        if (confirmations > lock.confirmations) lock = { seen: true, confirmations };
        continue;
      }
      const hex = await chain.transactionHex(utxo.txid);
      const output = outputsPaying(hex, contracts.marsOutput).find(out => out.txid === utxo.txid && out.vout === utxo.vout);
      if (!output || output.value !== utxo.value) continue;
      // The block holding the lock, and the blocks confirming it, must carry
      // real proof of work and build on one another. A server cannot invent
      // them; it would have to mine them.
      const hexes = [];
      for (let height = utxo.height; height < utxo.height + MARS_MIN_CONFIRMATIONS; height++) hexes.push(await chain.header(height));
      let headers;
      try {
        headers = verifyHeaders(hexes);
      } catch {
        continue;
      }
      const proof = await chain.merkle(utxo.txid, utxo.height);
      if (merkleRoot(utxo.txid, proof.branch, proof.position) !== headers[0].merkleRoot) continue;
      const funding = { txid: utxo.txid, vout: utxo.vout, value: output.value, height: utxo.height };
      let confirmed = false;
      try {
        confirmed = await secondNodeConfirms(funding, contracts);
      } catch {
        /* The second node does not know it yet, or is unreachable. */
      }
      if (!confirmed) {
        waiting = 'Waiting for a second Marscoin node to confirm the lock.';
        lock = { seen: true, confirmations: MARS_MIN_CONFIRMATIONS };
        continue;
      }
      return { funding };
    }
    return { waiting, lock };
  }

  // ---- Reading the Bitcoin contract ---------------------------------------

  // Every output that pays our Bitcoin contract, and what became of each.
  //
  // Outputs are remembered once seen and then followed individually, so a
  // claim cannot be pushed out of view by flooding the address with other
  // transactions. Amounts come from the raw funding transaction. A spend counts
  // only if the spending transaction really consumes that output; if it
  // carries the secret, we have it.
  async function readBtcContract(swap, contracts) {
    const known = new Map(
      swap.btcFundings.map(item => [`${item.txid}:${item.vout}`, { txid: item.txid, vout: item.vout, value: item.value }]),
    );
    const remember = hex => {
      for (const out of outputsPaying(hex, contracts.btcOutput)) {
        known.set(`${out.txid}:${out.vout}`, { txid: out.txid, vout: out.vout, value: out.value });
      }
    };
    if (swap.btcPayment) remember(swap.btcPayment.hex);
    const listed = await btc.transactions(swap.btcHtlcAddress);
    const confirmedIds = new Set(listed.filter(tx => tx.status?.confirmed).map(tx => tx.txid));
    const listedIds = new Set(listed.map(tx => tx.txid));
    const seen = new Set([...known.values()].map(item => item.txid));
    for (const tx of listed) {
      const pays = (tx.vout || []).some(out => out.scriptpubkey_address === swap.btcHtlcAddress);
      if (!pays || seen.has(tx.txid)) continue;
      try {
        remember(await btc.transactionHex(tx.txid));
      } catch {
        /* Not retrievable yet; it will be picked up on a later pass. */
      }
    }

    const fundings = [];
    let preimage = null;
    for (const funding of known.values()) {
      // `visible`: the funding transaction is on the network, not merely signed.
      const entry = { ...funding, visible: listedIds.has(funding.txid), confirmed: confirmedIds.has(funding.txid), spent: false };
      // An output the services do not know (our own unsent payment) has no answer.
      const outspend = await btc.outspend(funding.txid, funding.vout).catch(() => null);
      if (outspend) entry.visible = true;
      if (outspend?.spent) {
        let hex = null;
        try {
          hex = await btc.transactionHex(outspend.txid);
        } catch {
          /* The spender cannot be read yet. */
        }
        if (hex && spendsOutpoint(hex, funding.txid, funding.vout)) {
          entry.spent = true;
          entry.spentBy = outspend.txid;
          entry.spendConfirmed = outspend.confirmed;
          preimage = preimage || extractPreimage(hex, contracts.hash160);
        }
      }
      fundings.push(entry);
    }
    return { fundings, preimage };
  }

  const storedFundings = fundings => fundings.map(({ txid, vout, value }) => ({ txid, vout, value }));

  // ---- Claiming Marscoin ---------------------------------------------------

  // The output to claim: the one verified before payment, or, for a swap paid
  // without that step, one whose raw transaction proves its amount.
  async function marsFundingFor(swap, contracts) {
    if (swap.marsFunding) return swap.marsFunding;
    for (const utxo of await chain.unspent(contracts.marsOutput)) {
      const output = outputsPaying(await chain.transactionHex(utxo.txid), contracts.marsOutput).find(out => out.vout === utxo.vout);
      if (output) return { txid: utxo.txid, vout: utxo.vout, value: output.value, height: utxo.height };
    }
    return null;
  }

  async function claimMars(swap, contracts, marsHeight) {
    const funding = await marsFundingFor(swap, contracts);
    if (!funding) {
      if (marsHeight >= swap.marsLocktime) return save(swap, { state: SwapState.UNCLAIMED, error: UNCLAIMED_MESSAGE });
      return save(swap, { state: SwapState.CLAIMING, error: 'Waiting for the Marscoin contract to appear.' });
    }
    // Deterministic: the same verified output always yields the same claim, so
    // a wrong answer from a server can never be baked into a saved transaction.
    const tx = buildClaimTx({
      script: contracts.mars,
      txid: funding.txid,
      vout: funding.vout,
      value: funding.value,
      fee: MARS_SPEND_FEE,
      preimage: buffer(swap.preimage),
      privkey: swapKey(swap.keyIndex),
      destination: swap.marsDestination,
      network: MARS_NETWORK,
    });
    const claim = { txid: tx.getId(), hex: tx.toHex() };
    if (swap.marsClaim?.txid !== claim.txid || !swap.marsFunding) {
      await save(swap, { marsFunding: funding, marsClaim: claim, state: SwapState.CLAIMING, error: null });
    }
    // Complete only when the independent node shows our claim in a block.
    try {
      const paid = await chain.explorerOutput(claim.txid, 0);
      if (paid.confirmations >= 1 && paid.value === funding.value - MARS_SPEND_FEE) {
        return save(swap, { state: SwapState.COMPLETED, error: null });
      }
    } catch {
      /* Not known to the second node yet. */
    }
    let sent = true;
    try {
      await chain.broadcast(claim.hex);
    } catch {
      sent = false;
    }
    if (!sent && marsHeight >= swap.marsLocktime) {
      // Past the deadline and the network will not take our claim: the maker
      // has most likely reclaimed the Marscoin. Keep trying regardless.
      const stillThere = (await chain.unspent(contracts.marsOutput)).some(utxo => utxo.txid === funding.txid && utxo.vout === funding.vout);
      if (!stillThere) return save(swap, { state: SwapState.UNCLAIMED, error: UNCLAIMED_MESSAGE });
    }
    return save(swap, { state: SwapState.CLAIMING, error: sent ? null : 'Claiming Marscoin. The transaction will be sent again shortly.' });
  }

  // ---- Refunding Bitcoin ---------------------------------------------------

  // Send every unspent contract output back to the wallet. A refund that is
  // still unconfirmed after fees have risen is replaced with a better-paying one.
  async function refundBtc(swap, contracts, fundings) {
    const refunds = [...swap.btcRefunds];
    const feeRate = await btc.feeRate();
    for (const funding of fundings.filter(item => !item.spent)) {
      const key = `${funding.txid}:${funding.vout}`;
      const fee = Math.min(Math.ceil(feeRate * BTC_SPEND_VBYTES), funding.value - DUST);
      if (fee <= 0) continue; // too small to move at any fee
      // The cheapest refund already signed that still pays close to the going
      // rate (those handed to the watchtower included); otherwise a new one.
      let refund = refunds.filter(item => item.funding === key && item.fee * REFUND_BUMP > fee).sort((a, b) => a.fee - b.fee)[0];
      if (!refund) {
        const tx = buildRefundTx({
          script: contracts.btc,
          txid: funding.txid,
          vout: funding.vout,
          value: funding.value,
          fee,
          locktime: swap.btcLocktime,
          privkey: swapKey(swap.keyIndex),
          destination: swap.btcRefundAddress,
          network: BTC_NETWORK,
        });
        refund = { funding: key, txid: tx.getId(), hex: tx.toHex(), fee };
        refunds.push(refund);
        await save(swap, { btcRefunds: refunds });
      }
      await btc.broadcast(refund.hex).catch(() => {});
    }
  }

  const refundedByUs = (swap, funding) => swap.btcRefunds.some(refund => refund.txid === funding.spentBy);

  // ---- Watchtower -----------------------------------------------------------

  // Hand the relay everything it needs to finish this swap without us: the
  // Marscoin claim, signed and complete except for the secret, and Bitcoin
  // refunds at rising fees, valid only from the timelock. Each can pay only our
  // own address, so the watchtower can complete the swap but never divert it.
  // Failure here is not an error: the phone still does all of this itself.
  async function registerWatch(swap, contracts, funding) {
    if (swap.watch || !swap.marsFunding || !chain.watchRegister) return;
    try {
      if (!(await chain.watchtowerAvailable())) return;
      const feeRate = await btc.feeRate();
      const key = `${funding.txid}:${funding.vout}`;
      const refunds = [...swap.btcRefunds];
      const offered = [];
      for (const multiple of WATCH_FEE_STEPS) {
        const fee = Math.min(Math.ceil(feeRate * multiple * BTC_SPEND_VBYTES), funding.value - DUST);
        if (fee <= 0 || offered.some(item => item.fee >= fee)) continue;
        const tx = buildRefundTx({
          script: contracts.btc,
          txid: funding.txid,
          vout: funding.vout,
          value: funding.value,
          fee,
          locktime: swap.btcLocktime,
          privkey: swapKey(swap.keyIndex),
          destination: swap.btcRefundAddress,
          network: BTC_NETWORK,
        });
        const refund = { funding: key, txid: tx.getId(), hex: tx.toHex(), fee };
        offered.push(refund);
        if (!refunds.some(item => item.txid === refund.txid)) refunds.push(refund);
      }
      if (!offered.length) return;
      const claim = buildClaimTx({
        script: contracts.mars,
        txid: swap.marsFunding.txid,
        vout: swap.marsFunding.vout,
        value: swap.marsFunding.value,
        fee: MARS_SPEND_FEE,
        preimage: Buffer.alloc(32), // placeholder; the signature does not cover it
        privkey: swapKey(swap.keyIndex),
        destination: swap.marsDestination,
        network: MARS_NETWORK,
      });
      // Our own record of these refunds comes first: if the watchtower sends
      // one, we must recognise it as ours.
      await save(swap, { btcRefunds: refunds });
      const registered = await chain.watchRegister({
        version: 1,
        payment_hash160: swap.paymentHash,
        btc: {
          htlc_script: contracts.btc.toString('hex'),
          funding_txid: funding.txid,
          funding_vout: funding.vout,
          funding_value: funding.value,
          locktime: swap.btcLocktime,
          refund_txs: offered.map(item => item.hex),
        },
        mars: {
          htlc_script: contracts.mars.toString('hex'),
          funding_txid: swap.marsFunding.txid,
          funding_vout: swap.marsFunding.vout,
          funding_value: swap.marsFunding.value,
          locktime: swap.marsLocktime,
          claim_tx: claim.toHex(),
        },
      });
      await save(swap, { watch: { id: registered.id, registeredAt: seconds() }, watchProblem: null });
    } catch (error) {
      swap.watchProblem = String(error.message || error);
    }
  }

  // ---- Withdrawing a stuck payment ------------------------------------------

  // Our payment is still unconfirmed and the safe window has closed. Left
  // alone it could confirm so late that the maker's Marscoin refund is already
  // possible. Replace it with a higher-fee transaction that returns the same
  // coins to the wallet; whichever of the two confirms, the swap stays safe.
  // Returns true while a withdrawal is in progress or has completed.
  async function withdrawPayment(swap, contract) {
    const inputs = swap.btcPayment?.inputs;
    const own = contract.fundings.find(item => item.txid === swap.btcPayment?.txid);
    if (!wallet || !inputs?.length || own?.confirmed || own?.spent) return false;
    if (!swap.btcCancel) {
      const size = bitcoin.Transaction.fromHex(swap.btcPayment.hex).virtualSize();
      // A replacement must pay a higher rate and a higher total than the original.
      const feeRate = Math.max(await btc.feeRate(), Math.ceil(swap.btcPayment.fee / size) + 2);
      let cancel = wallet.createPayment({
        utxos: inputs,
        to: swap.btcRefundAddress,
        feeRate,
        changeAddress: swap.btcRefundAddress,
        sweep: true,
      });
      if (cancel.fee <= swap.btcPayment.fee + size) {
        cancel = wallet.createPayment({
          utxos: inputs,
          to: swap.btcRefundAddress,
          feeRate: feeRate + Math.ceil((swap.btcPayment.fee + size) / size),
          changeAddress: swap.btcRefundAddress,
          sweep: true,
        });
      }
      await save(swap, { btcCancel: { txid: cancel.txid, hex: cancel.hex, fee: cancel.fee } });
    }
    await btc.broadcast(swap.btcCancel.hex).catch(() => {});
    const spent = await btc.outspend(inputs[0].txid, inputs[0].vout).catch(() => null);
    if (spent?.spent && spent.confirmed && spent.txid === swap.btcCancel.txid) {
      await save(swap, { state: SwapState.FAILED, error: 'Your Bitcoin payment did not confirm in time and was returned to your wallet.' });
    } else {
      await save(swap, { error: 'Your Bitcoin payment did not confirm in time. Returning it to your wallet.' });
    }
    return true;
  }

  // ---- One pass over one swap ----------------------------------------------

  async function advance(swap) {
    if (SETTLED.includes(swap.state)) return watch(swap);
    if (swap.state === SwapState.ACCEPTING) {
      await announce(swap);
      if (swap.state !== SwapState.WAITING_MARS) return swap;
    }
    const contracts = swapContracts(swap);
    const [marsHeight, btcHeight] = await Promise.all([chain.tipHeight(), btc.tipHeight()]);

    // The Bitcoin contract is read first, in every state. A claim made while
    // the app was closed is found here before anything can mark the swap dead.
    const contract = await readBtcContract(swap, contracts);
    const fundings = storedFundings(contract.fundings);
    if (contract.preimage && !swap.preimage) {
      await save(swap, { preimage: contract.preimage.toString('hex'), btcFundings: fundings });
    } else if (JSON.stringify(fundings) !== JSON.stringify(swap.btcFundings)) {
      await save(swap, { btcFundings: fundings });
    }
    const pastLocktime = btcHeight >= swap.btcLocktime;

    if (swap.preimage) {
      await claimMars(swap, contracts, marsHeight);
      // Anything still sitting in the contract (a second payment, say) is ours
      // to take back once the timelock allows.
      if (pastLocktime) await refundBtc(swap, contracts, contract.fundings);
      return swap;
    }

    // Only a real payment counts: the agreed amount, or the one we sent. Dust
    // sent by someone else must not be able to change the swap's course.
    const paid = contract.fundings.filter(item => item.value >= swap.btcAmount || item.txid === swap.btcPayment?.txid);
    const window = btcWindowProblem({ btcHeight, btcLocktime: swap.btcLocktime });

    if (window && swap.btcPayment && (await withdrawPayment(swap, contract))) return swap;

    if (!paid.some(item => item.visible)) {
      if (swap.btcPayment) {
        // Our payment was signed but is not on the network: send the same one
        // again, but only while paying is still safe. The swap stays open and
        // watched either way, in case the payment did reach a miner.
        if (window) return save(swap, { error: 'Your Bitcoin payment did not reach the network in time and will not be sent again.' });
        await btc.broadcast(swap.btcPayment.hex).catch(() => {});
        return save(swap, { error: 'Sending your Bitcoin payment to the network.' });
      }
      if (window) {
        return save(swap, {
          state: SwapState.FAILED,
          error:
            swap.state === SwapState.READY_TO_PAY
              ? 'The time to pay safely ran out. No Bitcoin was sent.'
              : 'The maker did not lock Marscoin in time. No Bitcoin was sent.',
        });
      }
      if (swap.state === SwapState.WAITING_MARS) {
        let agreed;
        try {
          agreed = await chain.agreedTipHeight();
        } catch (error) {
          return save(swap, { error: error.message });
        }
        const result = await verifyMarsLock(swap, contracts, agreed);
        if (result.funding) return save(swap, { state: SwapState.READY_TO_PAY, marsFunding: result.funding, error: null });
        return save(swap, { error: result.waiting, lockProgress: result.lock });
      }
      return swap;
    }

    // Bitcoin is in the contract and the secret has not appeared.
    const unspent = contract.fundings.filter(item => !item.spent);
    if (!unspent.length) {
      // Final only if our own refunds are what spent it. Any other spender
      // must carry the secret; if we could not read it, look again.
      if (contract.fundings.every(item => refundedByUs(swap, item))) {
        const confirmed = contract.fundings.every(item => item.spendConfirmed);
        return save(swap, { state: confirmed ? SwapState.REFUNDED : SwapState.REFUNDING, error: null });
      }
      return save(swap, { state: SwapState.BTC_SENT, error: 'The Bitcoin contract was collected. Reading the secret from the network.' });
    }
    if (pastLocktime) {
      await refundBtc(swap, contracts, contract.fundings);
      return save(swap, { state: SwapState.REFUNDING, error: null });
    }
    // The agreed payment is in place: put the swap under the watchtower's care.
    const payment = unspent.find(item => item.value === swap.btcAmount && item.visible);
    if (payment) await registerWatch(swap, contracts, payment);
    return save(swap, { state: SwapState.BTC_SENT, error: null });
  }

  // A settled swap can still receive Bitcoin: a payment sent from another
  // wallet just before cancelling, or a second payment. For a while afterwards
  // the contract is checked, the secret used if it appears, and stray coins
  // returned once the timelock allows.
  const watched = new Map();
  async function watch(swap) {
    if (!swap.btcHtlcAddress || seconds() - swap.createdAt > WATCH_SECONDS) return swap;
    // Settled swaps need only an occasional look.
    if (seconds() - (watched.get(swap.id) || 0) < WATCH_INTERVAL_SECONDS) return swap;
    watched.set(swap.id, seconds());
    const contracts = swapContracts(swap);
    const contract = await readBtcContract(swap, contracts);
    const fundings = storedFundings(contract.fundings);
    if (JSON.stringify(fundings) !== JSON.stringify(swap.btcFundings)) await save(swap, { btcFundings: fundings });
    if (contract.preimage && !swap.preimage && swap.state !== SwapState.COMPLETED) {
      // The maker collected a late payment: the Marscoin is ours to claim.
      return save(swap, { preimage: contract.preimage.toString('hex'), state: SwapState.CLAIMING, error: null });
    }
    if (contract.fundings.some(item => !item.spent) && (await btc.tipHeight()) >= swap.btcLocktime) {
      await refundBtc(swap, contracts, contract.fundings);
    }
    return swap;
  }

  // ---- Paying Bitcoin from the built-in wallet ------------------------------

  // Final checks, then exactly the agreed amount. The signed payment is saved
  // before broadcast so an interrupted send repeats the same transaction.
  async function pay(swap, wallet) {
    if (swap.state !== SwapState.READY_TO_PAY || swap.btcPayment) throw new Error('This swap is not waiting for payment.');
    const contracts = swapContracts(swap);
    const [marsHeight, btcHeight, feeRate] = await Promise.all([chain.agreedTipHeight(), btc.agreedTipHeight(), btc.feeRate()]);
    const heights = { marsHeight, marsLocktime: swap.marsLocktime, btcHeight, btcLocktime: swap.btcLocktime };
    const problem = refundOrderProblem(heights) || btcWindowProblem(heights) || btcFeeProblem({ btcAmount: swap.btcAmount, feeRate });
    if (problem) throw new Error(`${problem} No Bitcoin was sent.`);
    // The lock must still be there according to the relay and the second node.
    const locked = (await chain.unspent(contracts.marsOutput)).some(
      utxo => utxo.txid === swap.marsFunding.txid && utxo.vout === swap.marsFunding.vout,
    );
    const confirmed = locked && (await secondNodeConfirms(swap.marsFunding, contracts).catch(() => false));
    if (!confirmed) throw new Error('The Marscoin lock could not be confirmed just now. No Bitcoin was sent.');
    const contract = await readBtcContract(swap, contracts);
    if (contract.fundings.some(item => item.value >= swap.btcAmount)) throw new Error('This swap has already been paid.');
    const funds = await wallet.sync();
    const request = { to: swap.btcHtlcAddress, amount: swap.btcAmount, feeRate, changeAddress: funds.changeAddress };
    let payment;
    try {
      // Confirmed coins first: an unconfirmed parent could delay the payment
      // past the point where it is safe.
      payment = wallet.createPayment({ ...request, utxos: funds.utxos.filter(utxo => utxo.confirmed) });
    } catch (error) {
      if (!error.shortfall) throw error;
      payment = wallet.createPayment({ ...request, utxos: funds.utxos });
    }
    await save(swap, { btcPayment: { txid: payment.txid, hex: payment.hex, fee: payment.fee, inputs: payment.inputs } });
    try {
      await btc.broadcast(payment.hex);
    } catch (error) {
      if (error.rejected) {
        // Every service refused the transaction itself, so it cannot confirm.
        await save(swap, { btcPayment: null });
        throw error;
      }
      // Outcome unknown: the saved payment is sent again on the next pass.
    }
    return save(swap, { state: SwapState.BTC_SENT, error: null });
  }

  // Abandon a swap before any Bitcoin was sent. The contract stays watched, so
  // a payment that was already on its way is still returned after the timelock.
  async function cancel(swap) {
    if (!UNPAID.includes(swap.state) || swap.btcPayment) throw new Error('This swap can no longer be cancelled.');
    const contract = await readBtcContract(swap, swapContracts(swap));
    if (contract.fundings.some(item => item.value >= swap.btcAmount)) throw new Error('Bitcoin has already been sent for this swap.');
    return save(swap, { state: SwapState.FAILED, error: 'Cancelled before payment. No Bitcoin was sent.' });
  }

  // Advance every swap. One failing swap does not stop the others.
  async function tick() {
    const swaps = await store.all();
    for (const swap of swaps) {
      try {
        await advance(swap);
        if (swap.lastProblem) await save(swap, { lastProblem: null });
      } catch (error) {
        swap.lastProblem = String(error.message || error);
      }
    }
    return swaps;
  }

  // The stored record, which the other methods update in place.
  const get = async id => (await store.all()).find(swap => swap.id === id);

  return {
    listOffers,
    get,
    verifyMarsLock,
    accept: (...args) => exclusive(() => accept(...args)),
    advance: swap => exclusive(() => advance(swap)),
    pay: (...args) => exclusive(() => pay(...args)),
    cancel: swap => exclusive(() => cancel(swap)),
    tick: () => exclusive(tick),
  };
}
