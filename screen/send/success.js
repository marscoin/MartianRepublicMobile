import { celebrate } from '../../blue_modules/app-review';
import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Animated, Easing, Linking, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BigNumber from 'bignumber.js';
import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import loc from '../../loc';
import {
  CardLabel,
  Chip,
  Divider,
  FigureRow,
  HeroAmount,
  MONO,
  Rise,
  SendButton,
  SendCard,
  SendOverline,
  sendColors,
  styles as shared,
  useReduceMotion,
} from '../../components/send/SendUi';
import SuccessMark from '../../components/send/SuccessMark';
import { explorerTxUrl, fiatOfZubrins, marsText, shortAddress } from '../../components/send/sendFormat';

// A small dot that breathes while the payment waits for its block.
function WaitingDot({ still }) {
  const beat = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) {
      beat.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 0.25, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat, still]);
  return <Animated.View style={[styles.dot, { opacity: beat }]} />;
}

const Success = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [copied, setCopied] = useState('');
  const copiedTimer = useRef(null);

  // Back to where sending started. Opened from a wallet, the send screens sit
  // in a sheet that is closed as a whole; in the Scan tab there is no sheet to
  // close, so the tab goes back to its first screen.
  const pop = () => {
    const parent = navigation.getParent?.();
    if (typeof parent?.pop === 'function') parent.pop();
    else if (typeof navigation.popToTop === 'function') navigation.popToTop();
    else navigation.goBack?.();
  };

  const { amount, fee, invoiceDescription = '', onDonePressed = pop, txid, recipients, marsRate } = useRoute().params;

  useEffect(() => {
    console.log('send/success - useEffect');
    celebrate();
    return () => clearTimeout(copiedTimer.current);
  }, []);

  const list = Array.isArray(recipients) ? recipients.filter(recipient => recipient?.address) : [];
  const sentSats = list.reduce((sum, recipient) => sum + (Number.isSafeInteger(recipient.value) ? recipient.value : 0), 0);
  const feeSats = Number(fee) > 0 ? new BigNumber(fee).multipliedBy(100000000).integerValue().toNumber() : 0;
  const shownAmount = sentSats > 0 ? marsText(sentSats) : amount !== undefined && amount !== null && amount !== '' ? String(amount) : '';
  const fiat = sentSats > 0 ? fiatOfZubrins(sentSats, marsRate) : null;
  const feeFiat = feeSats > 0 ? fiatOfZubrins(feeSats, marsRate) : null;
  const hasReceipt = list.length > 0 || feeSats > 0 || !!txid;

  const copy = (what, value) => {
    Clipboard.setString(value);
    setCopied(what);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(''), 1600);
  };

  return (
    <View style={shared.screen} testID="SuccessScreen">
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 36 }]}
      >
        <View style={styles.mark}>
          <SuccessMark animate={!reduceMotion} label="Sent" />
        </View>

        <Rise still={reduceMotion} delay={420} style={styles.head}>
          <SendOverline>MCR / SENT</SendOverline>
          <Text accessibilityRole="header" style={styles.title}>
            {shownAmount ? 'Payment sent' : 'Sent'}
          </Text>
          {shownAmount ? (
            <HeroAmount amount={shownAmount} fiat={fiat ? `≈ ${fiat}` : null} size={46} testID="SuccessAmount" fiatTestID="SuccessFiat" />
          ) : null}
          {invoiceDescription ? <Text style={styles.description}>{invoiceDescription}</Text> : null}
        </Rise>

        {hasReceipt ? (
          <Rise still={reduceMotion} delay={520}>
            <SendCard style={styles.receipt} testID="SuccessReceipt">
              {list.length === 1 ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`To ${list[0].address}. Copy the address.`}
                  onPress={() => copy('address', list[0].address)}
                  activeOpacity={0.8}
                  testID="SuccessRecipient"
                >
                  <FigureRow label="To" value={copied === 'address' ? 'Copied' : shortAddress(list[0].address)} />
                </TouchableOpacity>
              ) : list.length > 1 ? (
                <FigureRow label="To" value={`${list.length} recipients`} testID="SuccessRecipient" />
              ) : null}
              {feeSats > 0 ? (
                <FigureRow
                  label="Network fee"
                  value={`${new BigNumber(fee).toFixed(8)} MARS`}
                  note={feeFiat || undefined}
                  testID="SuccessFee"
                />
              ) : null}
              {txid ? (
                <>
                  <Divider />
                  <CardLabel style={styles.txLabel}>TRANSACTION ID</CardLabel>
                  <Text style={styles.txid} selectable testID="SuccessTxid">
                    {txid}
                  </Text>
                  <View style={styles.txActions}>
                    <Chip
                      title={copied === 'txid' ? 'Copied' : 'Copy ID'}
                      icon={copied === 'txid' ? 'check' : 'copy'}
                      onPress={() => copy('txid', txid)}
                      accessibilityLabel="Copy the transaction ID"
                      testID="SuccessCopyTxid"
                      style={styles.txAction}
                    />
                    <Chip
                      title="View on explorer"
                      icon="external-link"
                      onPress={() => Linking.openURL(explorerTxUrl(txid)).catch(() => {})}
                      testID="SuccessExplorer"
                      style={styles.txAction}
                    />
                  </View>
                </>
              ) : null}
            </SendCard>

            <View style={styles.waiting} testID="SuccessNext">
              <View style={styles.dotSlot}>
                <WaitingDot still={reduceMotion} />
              </View>
              <Text style={styles.waitingText}>
                It confirms in the next block, usually within a few minutes; blocks sometimes take longer. You can close this screen: the
                payment is on its way.
              </Text>
            </View>
          </Rise>
        ) : null}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <SendButton onPress={onDonePressed} title={loc.send.success_done} testID="SuccessDone" />
      </View>
    </View>
  );
};

export default Success;

// The mark with an optional amount above it, for the other screens that show
// a "done" state (receiving, Lightning, hardware-wallet signing).
export const SuccessView = ({ amount, amountUnit, fee, invoiceDescription, shouldAnimate = true }) => {
  const reduceMotion = useReduceMotion();
  return (
    <View style={styles.viewRoot}>
      {amount || fee > 0 ? (
        <View style={styles.viewAmount}>
          {amount ? <HeroAmount amount={String(amount)} size={40} /> : null}
          {fee > 0 && (
            <Text style={styles.viewFee}>
              {loc.send.create_fee}: {new BigNumber(fee).toFixed()}
            </Text>
          )}
          {invoiceDescription ? (
            <Text numberOfLines={0} style={styles.viewFee}>
              {invoiceDescription}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.viewMark}>
        <SuccessMark size={120} animate={shouldAnimate && !reduceMotion} />
      </View>
    </View>
  );
};

SuccessView.propTypes = {
  amount: PropTypes.number,
  amountUnit: PropTypes.string,
  fee: PropTypes.number,
  invoiceDescription: PropTypes.string,
  shouldAnimate: PropTypes.bool,
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  mark: { alignItems: 'center', marginBottom: 22 },
  head: { alignItems: 'center', marginBottom: 22 },
  title: { color: sendColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 26, lineHeight: 32, marginTop: 6, marginBottom: 10 },
  description: { color: sendColors.muted, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  receipt: { paddingVertical: 10 },
  txLabel: { marginTop: 6 },
  txid: { color: sendColors.muted, fontFamily: MONO, fontSize: 12, lineHeight: 18, marginTop: 6 },
  txActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 6 },
  txAction: { flexGrow: 1, minHeight: 42, borderRadius: 21 },
  waiting: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingHorizontal: 4 },
  dotSlot: { width: 14, height: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: sendColors.orange },
  waitingText: { flex: 1, color: sendColors.faint, fontSize: 13, lineHeight: 18 },
  bar: {
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sendColors.hairline,
    backgroundColor: sendColors.background,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  viewRoot: { flex: 1, paddingTop: 19 },
  viewAmount: { alignItems: 'center', padding: 16 },
  viewFee: { color: sendColors.muted, fontFamily: 'ChakraPetch-Medium', fontSize: 14, paddingVertical: 6, textAlign: 'center' },
  viewMark: { alignSelf: 'center', alignItems: 'center', marginBottom: 53 },
});
