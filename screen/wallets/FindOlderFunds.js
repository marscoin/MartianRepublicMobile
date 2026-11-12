import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { feeAmountText } from '../../blue_modules/mars-fee-text';
import {
  broadcastSweep,
  buildSweepTransaction,
  isOlderFundsWallet,
  MAX_SWEEP_INPUTS,
  olderFundsVariations,
  planSweep,
  scanOlderFunds,
  selectSweepCoins,
} from '../../blue_modules/older-funds';
import { olderFundsNetwork, sweepFeeRate } from '../../blue_modules/older-funds-flow';
import { formatMars } from '../../blue_modules/swap/present';
import { CivicButton, civicColors } from '../../components/CivicUi';
import { Copyable, Row, swapStyles } from '../swap/SwapUi';
import { SectionHeading, WorkspaceNotice, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';

const INTRO =
  'Older versions of the Republic’s wallet sometimes kept coins on other addresses that belong to the same recovery words. This checks those places.';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`;

// What to tell the person, and the detail underneath when there is one.
function explain(error, fallback) {
  const known = error?.name === 'OlderFundsError';
  const message = known ? error.message : fallback;
  const detail = known ? error.detail : String(error?.message || '').slice(0, 160);
  return detail && detail !== message ? `${message}\n${detail}` : message;
}

// Lets the screen draw before the phone is kept busy with key work.
const breathe = () => new Promise(resolve => setTimeout(resolve, 50));

export default function FindOlderFunds() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const requested = params?.walletID;
  const { wallets } = useContext(BlueStorageContext);
  const eligible = useMemo(() => (wallets || []).filter(isOlderFundsWallet), [wallets]);
  const [chosen, setChosen] = useState(requested);
  const wallet = eligible.find(item => item.getID() === chosen) || (requested ? null : eligible[0]) || null;

  const [places, setPlaces] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [scanError, setScanError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [review, setReview] = useState(null);
  const [moving, setMoving] = useState('');
  const [moveError, setMoveError] = useState('');
  const [sent, setSent] = useState(null);
  const run = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!wallet) return;
    const mine = ++run.current;
    const current = () => mine === run.current;
    setScanning(true);
    setScan(null);
    setScanError('');
    setReview(null);
    setMoveError('');
    setSent(null);
    setPlaces(olderFundsVariations(wallet).map(variation => ({ variation, state: 'todo', total: 0 })));
    try {
      await breathe();
      const connection = await olderFundsNetwork();
      const result = await scanOlderFunds({
        wallet,
        connection,
        onProgress: step => {
          if (!current()) return;
          setPlaces(list =>
            list.map((place, index) => (index === step.index ? { ...place, state: step.state, total: step.total || 0 } : place)),
          );
        },
      });
      if (current()) setScan(result);
    } catch (error) {
      if (current()) setScanError(explain(error, 'Could not reach the Marscoin network. Check your connection and try again.'));
    } finally {
      if (current()) setScanning(false);
    }
  }, [wallet]);

  useEffect(() => {
    const runs = run;
    check();
    return () => {
      runs.current++; // whatever is still under way no longer reports here
    };
  }, [check]);

  const ready = useMemo(() => selectSweepCoins(scan?.coins), [scan]);

  // Work out the transaction and show it. Nothing is signed yet.
  const prepare = async () => {
    if (busy.current || !wallet || !scan) return;
    busy.current = true;
    setPreparing(true);
    setMoveError('');
    try {
      await olderFundsNetwork();
      const destinationAddress = await wallet.getAddressAsync();
      if (!wallet.weOwnAddress(destinationAddress)) throw new Error('Could not get a receive address for this wallet.');
      const feeRate = await sweepFeeRate();
      setReview({ plan: planSweep({ coins: ready.coins, destinationAddress, feeRate }), left: ready.left });
    } catch (error) {
      setMoveError(explain(error, 'Could not prepare the transaction. Check your connection and try again.'));
    } finally {
      busy.current = false;
      setPreparing(false);
    }
  };

  // Sign, check, and send once.
  const move = async () => {
    if (busy.current || !wallet || !review) return;
    busy.current = true;
    setMoveError('');
    const { plan, left } = review;
    try {
      setMoving('signing');
      await breathe();
      const connection = await olderFundsNetwork();
      const sweep = await buildSweepTransaction({
        wallet,
        coins: plan.coins,
        destinationAddress: plan.destinationAddress,
        feeRate: plan.feeRate,
        connection,
      });
      // What is sent must be exactly what was shown.
      if (sweep.fee !== plan.fee || sweep.amount !== plan.amount || sweep.destinationAddress !== plan.destinationAddress) {
        throw new Error('The transaction changed while it was being prepared. Nothing was sent.');
      }
      setMoving('sending');
      const txid = await broadcastSweep({ connection, txHex: sweep.txHex, txid: sweep.txid });
      setSent({ txid, amount: sweep.amount, left });
      setReview(null);
    } catch (error) {
      setReview(null);
      setMoveError(
        explain(
          error,
          error?.code === 'OLDER_FUNDS_BROADCAST'
            ? 'The network did not accept the transaction.'
            : 'Could not move the coins. Nothing was sent.',
        ),
      );
    } finally {
      busy.current = false;
      setMoving('');
    }
  };

  if (!wallet) {
    return (
      <WorkspaceScreen title="Find older funds" eyebrow="MARTIAN REPUBLIC / WALLET">
        <Text style={styles.secondaryText}>{INTRO}</Text>
        <WorkspaceNotice>
          This needs a Marscoin wallet made from recovery words. Create or restore one first; a watch-only wallet cannot be checked.
        </WorkspaceNotice>
      </WorkspaceScreen>
    );
  }

  const found = scan ? scan.variations.filter(result => result.total > 0) : [];
  const limited = scan ? scan.variations.some(result => result.reachedLimit) : false;

  return (
    <WorkspaceScreen
      title="Find older funds"
      eyebrow="MARTIAN REPUBLIC / WALLET"
      refreshing={false}
      onRefresh={scanning || moving ? undefined : check}
    >
      <Text style={styles.secondaryText}>{INTRO}</Text>

      {eligible.length > 1 && !requested ? (
        <View style={styles.row}>
          {eligible.map(item => {
            const selected = item === wallet;
            return (
              <TouchableOpacity
                key={item.getID()}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: scanning || !!moving }}
                disabled={scanning || !!moving}
                onPress={() => setChosen(item.getID())}
                style={[styles.choice, selected && styles.choiceSelected]}
              >
                <Text style={styles.choiceLabel}>{item.getLabel?.() || 'Marscoin wallet'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {scanError ? (
        <WorkspaceNotice error action="Try again" onPress={check}>
          {scanError}
        </WorkspaceNotice>
      ) : null}

      {moveError ? <WorkspaceNotice error>{moveError}</WorkspaceNotice> : null}

      {sent ? (
        <View style={styles.card} testID="OlderFundsSent">
          <Text style={styles.caption}>ON ITS WAY</Text>
          <Text style={swapStyles.amount}>{formatMars(sent.amount)}</Text>
          <Text style={styles.secondaryText}>Your coins are moving to this wallet. They appear in the wallet after the next block.</Text>
          <Copyable label="Transaction ID" value={sent.txid} />
          {sent.left > 0 ? (
            <Text style={styles.caption}>
              {plural(sent.left, 'coin')} did not fit in this transaction. Check again after the next block to move the rest.
            </Text>
          ) : null}
          <CivicButton title="Done" onPress={() => navigation.goBack()} testID="OlderFundsDone" />
        </View>
      ) : null}

      {review && !sent ? (
        <>
          <SectionHeading title="Confirm the move" />
          <View style={styles.card} testID="OlderFundsReview">
            <Row label="Amount found" value={formatMars(review.plan.total)} />
            <Row label="Network fee" value={feeAmountText(review.plan.fee) || '—'} />
            <Row label="Will arrive" value={formatMars(review.plan.amount)} strong />
            <Copyable label="To this wallet, at address" value={review.plan.destinationAddress} />
            <Text style={styles.caption}>
              One transaction moves {plural(review.plan.coins.length, 'coin')} from the older addresses to a receive address of this wallet.
              Nothing else is sent anywhere.
            </Text>
            <CivicButton
              title={moving === 'signing' ? 'Signing…' : moving === 'sending' ? 'Sending…' : 'Move now'}
              disabled={!!moving}
              onPress={move}
              testID="OlderFundsConfirm"
            />
            <CivicButton title="Not now" secondary disabled={!!moving} onPress={() => setReview(null)} testID="OlderFundsCancel" />
          </View>
        </>
      ) : null}

      {scan && !review && !sent && found.length > 0 ? (
        <>
          {found.map(result => (
            <View key={result.variation.id} style={styles.card} testID={`OlderFundsFound-${result.variation.id}`}>
              <Text style={styles.caption}>{result.variation.label.toUpperCase()}</Text>
              <Text style={swapStyles.amount}>{formatMars(result.total)}</Text>
              <Text style={styles.secondaryText}>
                On {plural(result.addresses.length, 'address')}. {result.variation.description}
              </Text>
              {result.unconfirmed > 0 ? (
                <Text style={styles.caption}>{formatMars(result.unconfirmed)} of this is awaiting confirmation.</Text>
              ) : null}
            </View>
          ))}
          <View style={styles.card}>
            <Row label="Total found" value={formatMars(scan.total)} strong />
            {scan.unconfirmed > 0 ? <Row label="Ready to move" value={formatMars(scan.confirmed)} /> : null}
            {scan.unconfirmed > 0 && ready.coins.length > 0 ? (
              <Text style={styles.caption}>
                {formatMars(scan.unconfirmed)} is still awaiting confirmation. Check again after the next block to move it too.
              </Text>
            ) : null}
            {ready.coins.length === 0 ? (
              <Text style={styles.secondaryText}>
                These coins are still awaiting confirmation and cannot be moved yet. Wait for the next block, then check again.
              </Text>
            ) : null}
            {ready.left > 0 ? (
              <Text style={styles.caption}>
                There are more coins than fit in one transaction. This moves the {MAX_SWEEP_INPUTS} largest; check again afterwards for the
                rest.
              </Text>
            ) : null}
            {ready.coins.length > 0 ? (
              <CivicButton
                title={preparing ? 'Preparing…' : 'Move to this wallet'}
                disabled={preparing}
                onPress={prepare}
                testID="OlderFundsMove"
              />
            ) : (
              <CivicButton title="Check again" secondary onPress={check} testID="OlderFundsRecheck" />
            )}
          </View>
        </>
      ) : null}

      {scan && !review && !sent && found.length === 0 ? (
        <View style={styles.card} testID="OlderFundsNone">
          <Text style={styles.cardTitle}>No older funds found</Text>
          <Text style={styles.secondaryText}>
            Every place the Republic’s earlier wallets used was checked for these recovery words. Nothing is waiting there.
          </Text>
        </View>
      ) : null}

      {places.length > 0 && !review && !sent ? (
        <View style={styles.card} testID="OlderFundsPlaces">
          <Text style={styles.caption}>{scanning ? 'CHECKING' : scan ? 'PLACES CHECKED' : 'PLACES TO CHECK'}</Text>
          {places.map(place => (
            <View
              key={place.variation.id}
              style={local.place}
              accessibilityLabel={`${place.variation.label}: ${
                place.state === 'done'
                  ? place.total > 0
                    ? formatMars(place.total)
                    : 'nothing found'
                  : place.state === 'checking'
                    ? 'checking'
                    : 'waiting'
              }`}
            >
              <View style={local.mark}>
                {place.state === 'done' ? (
                  <Icon name="check" type="feather" size={16} color={place.total > 0 ? civicColors.orange : '#8FCEAB'} />
                ) : place.state === 'checking' && scanning ? (
                  <ActivityIndicator size="small" color={civicColors.orange} />
                ) : (
                  <View style={local.dot} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={[local.placeLabel, place.state === 'todo' && local.placeLabelDim]}>{place.variation.label}</Text>
                <Text style={styles.caption}>{place.variation.description}</Text>
              </View>
              <Text style={[local.placeResult, place.total > 0 && local.placeResultFound]}>
                {place.state === 'done'
                  ? place.total > 0
                    ? formatMars(place.total)
                    : 'Nothing'
                  : place.state === 'checking' && scanning
                    ? 'Checking…'
                    : ''}
              </Text>
            </View>
          ))}
          {limited ? (
            <Text style={styles.caption}>One of these places has a very long history. The first 200 addresses of it were checked.</Text>
          ) : null}
        </View>
      ) : null}
    </WorkspaceScreen>
  );
}

const local = StyleSheet.create({
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  mark: { width: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: civicColors.border },
  placeLabel: { color: civicColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, lineHeight: 20 },
  placeLabelDim: { color: civicColors.muted },
  placeResult: { color: civicColors.muted, fontFamily: 'ChakraPetch-Medium', fontSize: 14, textAlign: 'right' },
  placeResultFound: { color: civicColors.orange },
});
