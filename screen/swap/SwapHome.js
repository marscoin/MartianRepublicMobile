import { marsAlert } from '../../components/MarsDialog';
import React, { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { advanceSwaps, getSwapServices, useSwaps } from '../../blue_modules/swap';
import { isSwapFinished } from '../../blue_modules/swap/engine';
import { describeSwap, formatBtc, formatMars, formatSats, satsPerMars } from '../../blue_modules/swap/present';
import { CivicButton } from '../../components/CivicUi';
import { SectionHeading, SmallAction, WorkspaceNotice, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';
import { Row, swapStyles, useSwapWallet } from './SwapUi';

// Get Marscoin with Bitcoin: the Bitcoin balance, open offers, and swaps.
export default function SwapHome() {
  const navigation = useNavigation();
  const wallet = useSwapWallet();
  const swaps = useSwaps(wallet);
  const [book, setBook] = useState(null);
  const [funds, setFunds] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState('');
  const reserving = useRef(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError('');
    const { engine, btcWallet } = getSwapServices(wallet);
    const [offers, balance] = await Promise.allSettled([engine.listOffers(), btcWallet.sync()]);
    if (offers.status === 'fulfilled') setBook(offers.value);
    if (balance.status === 'fulfilled') setFunds(balance.value);
    const failed = [offers, balance].find(result => result.status === 'rejected');
    if (failed) setError(failed.reason?.message || 'Unable to load swap offers.');
    advanceSwaps(wallet);
    setLoading(false);
  }, [wallet]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // Show incoming Bitcoin as soon as the network has seen it.
      const timer = setInterval(() => {
        if (!wallet) return;
        getSwapServices(wallet)
          .btcWallet.sync()
          .then(setFunds)
          .catch(() => {});
      }, 15000);
      return () => clearInterval(timer);
    }, [refresh, wallet]),
  );

  const active = swaps.find(swap => !isSwapFinished(swap));
  const finished = swaps.filter(isSwapFinished).slice(0, 5);

  const take = offer => {
    marsAlert(
      `Swap ${formatSats(offer.btcAmount)} for ${formatMars(offer.marsAmount)}?`,
      'The seller locks the Marscoin first. You pay Bitcoin only after this app has verified that lock, and your Bitcoin returns automatically if the swap does not complete.\n\nOnce you have paid, the swap is handed to the network’s watchtower and completes even if your phone is off.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Reserve offer',
          onPress: async () => {
            // A second confirmation queued behind this one must not start another swap.
            if (reserving.current) return;
            reserving.current = true;
            setAccepting(offer.id);
            try {
              const { engine, btcWallet } = getSwapServices(wallet);
              const [marsDestination, balance] = await Promise.all([wallet.getAddressAsync(), funds || btcWallet.sync()]);
              const swap = await engine.accept(offer, { marsDestination, btcRefundAddress: balance.receiveAddress });
              navigation.navigate('SwapDetail', { swapId: swap.id });
            } catch (failure) {
              marsAlert('Offer not reserved', failure.message);
            } finally {
              reserving.current = false;
              setAccepting('');
            }
          },
        },
      ],
    );
  };

  if (!wallet) {
    return (
      <WorkspaceScreen title="Get Marscoin" eyebrow="MARTIAN REPUBLIC / EXCHANGE">
        <WorkspaceNotice>
          Create or restore a Marscoin wallet first. Your Bitcoin wallet and swaps are secured by its recovery phrase.
        </WorkspaceNotice>
      </WorkspaceScreen>
    );
  }

  return (
    <WorkspaceScreen title="Get Marscoin" eyebrow="MARTIAN REPUBLIC / EXCHANGE" refreshing={loading} onRefresh={refresh}>
      <Text style={styles.secondaryText}>
        Swap Bitcoin for Marscoin directly with another person. No exchange holds your coins: both sides are locked on their own chains and
        released together.
      </Text>

      {error ? (
        <WorkspaceNotice error action="Try again" onPress={refresh}>
          {error}
        </WorkspaceNotice>
      ) : null}

      <TouchableOpacity accessibilityRole="button" style={styles.card} onPress={() => navigation.navigate('BtcWallet')}>
        <Text style={styles.caption}>BITCOIN WALLET</Text>
        <Text style={swapStyles.amount}>{funds ? formatSats(funds.balance) : loading ? 'Checking…' : '—'}</Text>
        {funds ? <Text style={styles.secondaryText}>{formatBtc(funds.balance)}</Text> : null}
        {funds && funds.incoming > 0 ? (
          <Text style={styles.caption}>Includes {formatSats(funds.incoming)} incoming, seen on the network and awaiting confirmation.</Text>
        ) : null}
        <Text style={styles.actionText}>{funds && funds.balance > 0 ? 'Receive or withdraw' : 'Add Bitcoin to begin'}</Text>
      </TouchableOpacity>

      {active ? (
        <>
          <SectionHeading title="Swap in progress" />
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.card}
            onPress={() => navigation.navigate('SwapDetail', { swapId: active.id })}
          >
            <Text style={styles.cardTitle}>{describeSwap(active).title}</Text>
            <Text style={styles.secondaryText}>
              {formatSats(active.btcAmount)} for {formatMars(active.marsAmount)}
            </Text>
            <Text style={styles.actionText}>Open</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <SectionHeading title="Offers" />
      {book && !book.offers.length ? (
        <Text style={styles.secondaryText}>No offers are open right now. Pull down to check again.</Text>
      ) : null}
      {!book && loading ? <Text style={styles.secondaryText}>Reading the order book…</Text> : null}
      {(book?.offers || []).map(offer => {
        const short = funds && funds.balance < offer.btcAmount;
        return (
          <View key={offer.id} style={[styles.card, swapStyles.offer, offer.problem && swapStyles.dim]}>
            <View style={swapStyles.offerHead}>
              <Text style={swapStyles.offerMars}>{formatMars(offer.marsAmount)}</Text>
              <Text style={swapStyles.offerPrice}>{formatSats(offer.btcAmount)}</Text>
            </View>
            <Row label="Price per MARS" value={`${satsPerMars(offer)} sats`} />
            {offer.problem ? (
              <Text style={styles.caption}>{offer.problem}</Text>
            ) : (
              <CivicButton
                title={accepting === offer.id ? 'Reserving…' : active ? 'Finish your current swap first' : 'Swap'}
                disabled={!!accepting || !!active}
                secondary={!!short}
                onPress={() => take(offer)}
              />
            )}
            {!offer.problem && short ? (
              <Text style={styles.caption}>You can reserve now and pay from another Bitcoin wallet, or add Bitcoin here first.</Text>
            ) : null}
          </View>
        );
      })}
      {book ? (
        <Text style={styles.caption}>
          Bitcoin block {book.btcHeight} · Marscoin block {book.marsHeight} · network fee {book.feeRate} sat/vB
        </Text>
      ) : null}

      {finished.length ? (
        <>
          <SectionHeading title="Earlier swaps" />
          {finished.map(swap => (
            <TouchableOpacity
              key={swap.id}
              accessibilityRole="button"
              style={styles.card}
              onPress={() => navigation.navigate('SwapDetail', { swapId: swap.id })}
            >
              <Text style={styles.cardTitle}>{describeSwap(swap).title}</Text>
              <Text style={styles.secondaryText}>
                {formatSats(swap.btcAmount)} for {formatMars(swap.marsAmount)} · {new Date(swap.createdAt * 1000).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}
      <SectionHeading title="Have Marscoin to sell?" />
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.card}
        onPress={() => navigation.navigate('SwapMaker')}
        testID="OpenSwapMaker"
      >
        <Text style={styles.cardTitle}>Offer Marscoin for Bitcoin</Text>
        <Text style={styles.secondaryText}>
          Set your price and limits. The app keeps your offers on the market and completes each sale.
        </Text>
        <Text style={styles.actionText}>Set up</Text>
      </TouchableOpacity>
      <SmallAction title="How swaps keep both sides safe" icon="info" onPress={() => marsAlert('How a swap works', HOW)} />
    </WorkspaceScreen>
  );
}

const HOW =
  '1. You reserve an offer. The seller locks the Marscoin on the Marscoin chain so that only you can collect it, using a secret only the seller knows.\n\n' +
  '2. This app verifies that lock with two independent Marscoin nodes.\n\n' +
  '3. You lock Bitcoin so that only the seller can collect it, and only by revealing that same secret.\n\n' +
  '4. When the seller collects the Bitcoin, the secret appears on the Bitcoin chain and this app uses it to collect your Marscoin.\n\n' +
  'If the seller never collects, your Bitcoin unlocks back to you after about four hours. The only cost beyond the offer price is network fees.';
