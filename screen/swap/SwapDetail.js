import { marsAlert } from '../../components/MarsDialog';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { celebrate } from '../../blue_modules/app-review';
import { advanceSwaps, esplora, getSwapServices, swapChain, useSwaps } from '../../blue_modules/swap';
import { SwapState, isSwapFinished } from '../../blue_modules/swap/engine';
import { describeSwap, formatBtc, formatMars, formatSats, timeUntil, swapSubsteps } from '../../blue_modules/swap/present';
import { BTC_BLOCK_SECONDS, MARS_BLOCK_SECONDS, MARS_SPEND_FEE } from '../../blue_modules/swap/safety';
import { CivicButton } from '../../components/CivicUi';
import QRCodeComponent from '../../components/QRCodeComponent';
import { SectionHeading, SmallAction, WorkspaceNotice, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';
import { Copyable, Receipt, Row, Steps, swapStyles, useSwapWallet } from './SwapUi';

export default function SwapDetail() {
  const { swapId } = useRoute().params;
  const wallet = useSwapWallet();
  const swaps = useSwaps(wallet);
  const swap = swaps.find(item => item.id === swapId);
  const [busy, setBusy] = useState('');
  const working = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [heights, setHeights] = useState(null);
  const [external, setExternal] = useState(false);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([esplora.tipHeight(), swapChain.tipHeight()])
      .then(([btc, mars]) => current && setHeights({ btc, mars }))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [swap?.state, swap?.updatedAt]);

  // A swap seen through to the end is a good moment to ask for a review.
  const completed = swap?.state === SwapState.COMPLETED;
  const seenUnfinished = useRef(false);
  useEffect(() => {
    if (swap && !completed) seenUnfinished.current = true;
    if (completed && seenUnfinished.current) {
      seenUnfinished.current = false;
      celebrate();
    }
  }, [swap, completed]);

  if (!wallet || !swap) {
    return (
      <WorkspaceScreen title="Swap" eyebrow="MARTIAN REPUBLIC / EXCHANGE">
        <Text style={styles.secondaryText}>This swap is not on this phone.</Text>
      </WorkspaceScreen>
    );
  }

  const view = describeSwap(swap);
  const { engine, btcWallet } = getSwapServices(wallet);
  // Engine methods work on the stored record, not on the rendered copy.
  const record = () => engine.get(swapId);

  const refresh = async () => {
    setRefreshing(true);
    await advanceSwaps(wallet);
    setRefreshing(false);
  };

  const run = async (name, action, failureTitle) => {
    // Checked through a ref: an alert button captured before the first tap
    // would otherwise see a stale "not busy".
    if (working.current) return;
    working.current = true;
    setBusy(name);
    try {
      await action(await record());
    } catch (error) {
      if (error.shortfall) {
        marsAlert('Not enough Bitcoin', `Add at least ${formatSats(error.shortfall)} to your Bitcoin wallet, or pay from another wallet.`);
      } else {
        marsAlert(failureTitle, error.message);
      }
    } finally {
      working.current = false;
      setBusy('');
      advanceSwaps(wallet);
    }
  };

  const pay = async () => {
    // Show what the network will charge before asking.
    const feeRate = await esplora.feeRate().catch(() => null);
    const fee = feeRate ? `\n\nBitcoin network fee: about ${formatSats(Math.ceil(feeRate * 155))} (${feeRate} sat/vB).` : '';
    marsAlert(
      `Pay ${formatSats(swap.btcAmount)}?`,
      `Your Bitcoin is locked for the seller and returns to you automatically if the swap does not complete.${fee}`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Pay', onPress: () => run('pay', current => engine.pay(current, btcWallet), 'Payment not sent') },
      ],
    );
  };

  const cancel = () =>
    marsAlert(
      'Cancel this swap?',
      'Nothing has been paid. After cancelling, never send Bitcoin to this swap’s address.\n\nThe maker may already have locked Marscoin for you. Cancelling repeatedly can get you blocked from swapping for a day.',
      [
        { text: 'Keep swap', style: 'cancel' },
        {
          text: 'Cancel swap',
          style: 'destructive',
          onPress: () => run('cancel', current => engine.cancel(current), 'Swap not cancelled'),
        },
      ],
    );

  const btcBlocksLeft = heights ? swap.btcLocktime - heights.btc : null;
  const marsBlocksLeft = heights ? swap.marsLocktime - heights.mars : null;
  const waitingOnMaker = swap.state === SwapState.BTC_SENT;
  // Refunds are signed ahead of time for the watchtower; only one that was needed belongs on the receipt.
  const refunding = swap.state === SwapState.REFUNDING || swap.state === SwapState.REFUNDED;
  const payUri = `bitcoin:${swap.btcHtlcAddress}?amount=${(swap.btcAmount / 100000000).toFixed(8)}`;

  return (
    <WorkspaceScreen title={view.title} eyebrow="MARTIAN REPUBLIC / EXCHANGE" refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.card}>
        <Row label="You pay" value={formatSats(swap.btcAmount)} strong />
        <Row label="You receive" value={formatMars(swap.marsAmount - MARS_SPEND_FEE)} strong />
        <Text style={styles.caption}>After the fixed 0.001 MARS claim fee. Bitcoin network fees are additional.</Text>
      </View>

      {view.tone === 'error' ? <WorkspaceNotice error>{view.body}</WorkspaceNotice> : <Text style={styles.body}>{view.body}</Text>}
      {swap.watch && !isSwapFinished(swap) ? (
        <View style={styles.card}>
          <Text style={styles.caption}>WATCHTOWER</Text>
          <Text style={styles.secondaryText}>
            This swap is protected while your phone is off. The Marscoin network’s watchtower holds transactions you have already signed,
            which can only pay your own wallet: it claims your Marscoin when the seller collects, or returns your Bitcoin after the time
            lock.
          </Text>
        </View>
      ) : null}
      {swap.lastProblem && !isSwapFinished(swap) ? (
        <Text style={styles.caption}>Last check could not finish: {swap.lastProblem}</Text>
      ) : null}

      <Steps steps={view.steps} current={view.step} tone={view.tone} substeps={swapSubsteps(swap)} />

      {view.payNext ? (
        <>
          <CivicButton title={`Pay ${formatSats(swap.btcAmount)} · waiting for the lock`} disabled onPress={() => {}} testID="PayWaiting" />
          <Text style={styles.caption}>
            This button unlocks as soon as the Marscoin lock has two confirmations. Marscoin blocks usually take a couple of minutes,
            sometimes much longer. You do not need to keep this screen open.
          </Text>
        </>
      ) : null}
      {view.canPay ? (
        <>
          <CivicButton
            title={busy === 'pay' ? 'Sending…' : `Pay ${formatSats(swap.btcAmount)} from this wallet`}
            disabled={!!busy}
            onPress={pay}
          />
          <SmallAction
            title={external ? 'Hide outside-wallet payment' : 'Pay from another Bitcoin wallet'}
            icon="external-link"
            onPress={() => setExternal(!external)}
          />
          {external ? (
            <View style={styles.card}>
              <Text style={styles.secondaryText}>
                Send exactly {formatBtc(swap.btcAmount)} in a single payment. A different amount cannot complete the swap and would only
                come back after the time lock.
              </Text>
              <View style={swapStyles.qr}>
                <QRCodeComponent value={payUri} size={200} isLogoRendered={false} isMenuAvailable={false} ecl="M" />
              </View>
              <Copyable label="Bitcoin address for this swap" value={swap.btcHtlcAddress} />
              <Copyable label="Exact amount (BTC)" value={(swap.btcAmount / 100000000).toFixed(8)} />
            </View>
          ) : null}
        </>
      ) : null}

      {!isSwapFinished(swap) && heights ? (
        <View style={styles.card}>
          <Text style={styles.caption}>TIME LOCKS</Text>
          {swap.state === SwapState.READY_TO_PAY || swap.state === SwapState.WAITING_MARS ? (
            <Row label="Pay within" value={timeUntil(btcBlocksLeft - 12, BTC_BLOCK_SECONDS)} />
          ) : null}
          {waitingOnMaker ? <Row label="Bitcoin returns if unclaimed" value={timeUntil(btcBlocksLeft, BTC_BLOCK_SECONDS)} /> : null}
          {swap.state === SwapState.CLAIMING ? (
            <Row label="Marscoin must be claimed within" value={timeUntil(marsBlocksLeft, MARS_BLOCK_SECONDS)} />
          ) : null}
          {waitingOnMaker || swap.state === SwapState.CLAIMING ? (
            <Text style={styles.caption}>
              {swap.watch
                ? 'You can close the app. Opening it now and then shows progress and adds a second safeguard.'
                : 'Open the app now and then until the swap completes. It claims your Marscoin, or recovers your Bitcoin, while it is open.'}
            </Text>
          ) : null}
        </View>
      ) : null}

      {view.canCancel ? (
        <SmallAction title={busy === 'cancel' ? 'Cancelling…' : 'Cancel swap'} icon="x" danger disabled={!!busy} onPress={cancel} />
      ) : null}

      <SectionHeading title={isSwapFinished(swap) ? 'Receipt' : 'Record'} />
      <View style={styles.card}>
        {swap.btcPayment ? <Receipt label="Bitcoin payment" value={swap.btcPayment.txid} /> : null}
        {swap.marsClaim ? <Receipt label="Marscoin claim" value={swap.marsClaim.txid} /> : null}
        {refunding
          ? swap.btcRefunds.slice(-1).map(refund => <Receipt key={refund.txid} label="Bitcoin refund" value={refund.txid} />)
          : null}
        {!swap.btcPayment && !swap.marsClaim ? <Text style={styles.secondaryText}>Nothing has been sent yet.</Text> : null}
        <Text style={styles.caption}>Started {new Date(swap.createdAt * 1000).toLocaleString()}. Tap a line to copy it.</Text>
      </View>
      <SmallAction
        title={details ? 'Hide technical details' : 'Technical details'}
        icon={details ? 'chevron-up' : 'chevron-down'}
        onPress={() => setDetails(!details)}
      />
      {details ? (
        <>
          <Copyable label="Marscoin contract" value={swap.marsHtlcAddress} />
          <Copyable label="Bitcoin contract" value={swap.btcHtlcAddress} />
          {swap.btcRefunds.length && !refunding ? (
            <Text style={styles.caption}>
              {swap.btcRefunds.length} Bitcoin refund{swap.btcRefunds.length === 1 ? ' was' : 's were'} signed in advance as a safeguard and
              {isSwapFinished(swap) ? ' never needed.' : ' not sent.'}
            </Text>
          ) : null}
          <Text style={styles.caption}>
            Bitcoin unlocks at block {swap.btcLocktime} · Marscoin at block {swap.marsLocktime}
          </Text>
        </>
      ) : null}
    </WorkspaceScreen>
  );
}
