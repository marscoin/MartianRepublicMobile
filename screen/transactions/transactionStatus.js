import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from 'react-native-elements';
import dayjs from 'dayjs';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { EXCHANGE_RATES_STORAGE_KEY } from '../../blue_modules/currency';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import {
  IPFS_GATEWAY,
  SETTLED_AT,
  chainFacts,
  direction,
  explorerUrl,
  formatMars,
  marsParts,
  previewText,
  route as routeOf,
  settlement,
  shortAddress,
  utcStamp,
} from '../../blue_modules/transaction-view';
import { transactionTimeToReadable } from '../../loc';
import HandoffComponent from '../../components/handoff';
import { CivicBrand, civicColors } from '../../components/CivicUi';
import MarsFrame, { FrameHead, MarsButton } from '../../components/MarsFrame';

// One page for a transaction: what it was, how settled it is, where the coins went, the Republic record it carries,
// the user's own note, and the facts on the chain. Everything shown is read from the transaction or asked of the
// network when the page opens; a transaction still waiting for a block is checked again every 30 seconds.

const POLL_MS = 30000;
const TIMEOUT_MS = 15000;

const within = (promise, ms = TIMEOUT_MS) =>
  Promise.race([promise, new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// The network, loaded on first use so that opening this file does not start any connection.
function liveNetwork() {
  const MARSConnection = require('../../blue_modules/MARSConnection');
  const { swapChain } = require('../../blue_modules/swap');
  return {
    history: async address => {
      await MARSConnection.waitTillConnected();
      return MARSConnection.getTransactionsByAddress(address);
    },
    tip: () => swapChain.tipHeight(),
    txHex: txid => MARSConnection.getTxHex(txid),
    fetchJson: async url => {
      const response = await fetch(url);
      return response.ok ? response.json() : null;
    },
    rate: async () => {
      const rates = JSON.parse((await AsyncStorage.getItem(EXCHANGE_RATES_STORAGE_KEY)) || '{}');
      const rate = Number(rates.MARS_USD);
      return Number.isFinite(rate) && rate > 0 ? rate : null;
    },
  };
}

const DIRECTION = {
  sent: { label: 'SENT', icon: 'arrow-up-right', color: civicColors.orange },
  received: { label: 'RECEIVED', icon: 'arrow-down-left', color: civicColors.ok },
  record: { label: 'REPUBLIC RECORD', icon: 'hexagon', color: civicColors.orange },
  moved: { label: 'MOVED', icon: 'repeat', color: civicColors.muted },
};

const dollars = value =>
  value < 0.01 ? 'less than a cent' : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

export function TransactionView({ tx, wallet, wallets = [], note = '', onNote, network, onBack, onConfirmed }) {
  const net = useMemo(() => network || liveNetwork(), [network]);
  const [facts, setFacts] = useState(null);
  const [size, setSize] = useState(null);
  const [rate, setRate] = useState(null);
  const [preview, setPreview] = useState(null);
  const [memo, setMemo] = useState(note);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const owner = useCallback(
    address => {
      if (wallet?.weOwnAddress?.(address)) return 'this';
      const other = wallets.find(w => w !== wallet && w.weOwnAddress?.(address));
      return other ? other.getLabel() : null;
    },
    [wallet, wallets],
  );
  const r = useMemo(() => routeOf(tx, owner), [tx, owner]);
  const kind = direction(r);
  const mineKnown = r.from.filter(g => g.owner === 'this').every(g => g.known);
  const amount = mineKnown ? r.net : Math.round(tx.value || 0);
  const ours = [...r.from, ...r.to].find(g => g.owner === 'this')?.address;

  // Fresh block height and depth, and the transaction's size.
  const check = useCallback(async () => {
    if (!ours) return null;
    try {
      const found = await within(chainFacts({ txid: tx.hash, address: ours, history: net.history, tip: net.tip }));
      if (alive.current) setFacts(found);
      return found;
    } catch {
      return null;
    }
  }, [net, ours, tx.hash]);

  useEffect(() => {
    check();
    if (tx.hex) setSize(tx.hex.length / 2);
    else
      within(net.txHex(tx.hash))
        .then(hex => alive.current && typeof hex === 'string' && setSize(hex.length / 2))
        .catch(() => {});
    net
      .rate()
      .then(value => alive.current && setRate(value))
      .catch(() => {});
  }, [check, net, tx.hash, tx.hex]);

  useEffect(() => {
    if (!r.record?.cid) return;
    within(net.fetchJson(IPFS_GATEWAY + r.record.cid))
      .then(json => alive.current && setPreview(previewText(json)))
      .catch(() => {});
  }, [net, r.record]);

  const confirmations = facts ? facts.confirmations : tx.confirmations || 0;
  // While it waits for a block, look again every 30 seconds, and say so when it lands.
  const waiting = confirmations === 0;
  useFocusEffect(
    useCallback(() => {
      if (!waiting) return undefined;
      const timer = setInterval(async () => {
        const found = await check();
        if (found?.confirmations > 0) onConfirmed?.();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [waiting, check, onConfirmed]),
  );

  const settle = settlement(confirmations);
  const look = DIRECTION[kind];
  const parts = marsParts(amount);
  const stayed = kind === 'record' && r.to.every(g => g.owner === 'this');
  const url = explorerUrl(tx.hash);
  const when = tx.received ? new Date(tx.received) : null;
  const openExplorer = () => Linking.openURL(url).catch(() => {});

  const saveNote = () => {
    if (memo === note) return;
    onNote?.(memo);
    setSaved(true);
  };
  const copyId = () => {
    Clipboard.setString(tx.hash);
    setCopied(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="TransactionPage">
      <View style={styles.top}>
        <Square icon="arrow-left" label="Go back" onPress={onBack} testID="TransactionBack" />
        <Text style={styles.topCode}>TX {tx.hash.slice(0, 8).toUpperCase()}</Text>
        <Square icon="external-link" label="Open in the explorer" onPress={openExplorer} testID="TransactionExplorerTop" />
      </View>
      <CivicBrand subtitle="MCR / WALLET / TRANSACTION" />

      <View style={styles.hero}>
        <View style={styles.dirRow}>
          <Icon name={look.icon} type="feather" size={15} color={look.color} />
          <Text style={styles.dir} testID="TransactionDirection">
            {look.label}
            {when ? ` · ${String(transactionTimeToReadable(tx.received)).toUpperCase()}` : ''}
          </Text>
        </View>
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit testID="TransactionAmount">
          {parts.sign}
          {parts.whole}.{parts.lead}
          <Text style={styles.dim}>{parts.tail}</Text>
          <Text style={styles.unit}> MARS</Text>
        </Text>
        {stayed ? (
          <Text style={styles.sub}>Network fee only. The coins stayed in your wallet.</Text>
        ) : rate && amount ? (
          <Text style={styles.sub}>
            <Text style={styles.subStrong}>≈ {dollars((Math.abs(amount) / 1e8) * rate)}</Text> at today's price
          </Text>
        ) : null}
      </View>

      {r.record ? (
        <MarsFrame accent style={styles.panel} testID="TransactionRecord">
          <FrameHead label={r.record.tag ? 'REPUBLIC RECORD' : 'DATA'} code={r.record.tag || undefined} />
          <Text style={styles.recordKind}>{r.record.kind}</Text>
          {preview || r.record.text ? (
            <View style={styles.quote}>
              <Text style={styles.quoteText}>{preview || r.record.text}</Text>
            </View>
          ) : null}
          <Text style={styles.body}>{r.record.about}</Text>
          {r.record.cid ? (
            <View style={styles.cidRow}>
              <Text style={styles.cid} numberOfLines={1}>
                <Text style={styles.cidLabel}>IPFS </Text>
                {shortAddress(r.record.cid)}
              </Text>
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel="Open the record on IPFS"
                onPress={() => Linking.openURL(IPFS_GATEWAY + r.record.cid).catch(() => {})}
                hitSlop={hit}
              >
                <Text style={styles.link}>Open</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </MarsFrame>
      ) : null}

      <MarsFrame tab style={styles.panel} testID="TransactionConfirmations">
        <FrameHead label="CONFIRMATIONS" code={facts?.height ? `BLK ${facts.height.toLocaleString('en-US')}` : undefined} />
        <View style={styles.segs}>
          {Array.from({ length: SETTLED_AT }, (_, i) => (
            <View key={i} style={[styles.seg, i < settle.lit && (settle.state === 'settled' ? styles.segOk : styles.segOn)]} />
          ))}
        </View>
        <View style={styles.rowBetween}>
          <Text style={[styles.state, settle.state === 'settled' ? styles.stateOk : styles.stateOn]} testID="TransactionState">
            {settle.label}
          </Text>
          <Text style={styles.muted}>{settle.detail}</Text>
        </View>
        {when ? (
          <View style={styles.rowBetween}>
            <Text style={styles.when}>{dayjs(when).format('ddd, MMM D, YYYY · h:mm A')}</Text>
            <Text style={styles.utc}>{utcStamp(tx.received)}</Text>
          </View>
        ) : null}
        {waiting ? <Text style={styles.live}>● Checking for the next block every 30 seconds.</Text> : null}
      </MarsFrame>

      <MarsFrame style={styles.panel} testID="TransactionRoute">
        <FrameHead label="ROUTE" right={<Text style={styles.headRight}>{`${r.inputs} in · ${r.outputs} out`}</Text>} />
        <Groups groups={r.from} wallet={wallet} side="from" />
        <View style={styles.wire}>
          {r.record ? <Branch label="The record, carrying no coins" value="0" /> : null}
          {r.fee !== null ? <Branch label="Network fee, to the miners" value={formatMars(r.fee, { signed: false })} /> : null}
          <View style={styles.arrow} />
        </View>
        <Groups
          groups={r.to}
          wallet={wallet}
          side="to"
          fromYou={r.from.some(g => g.owner === 'this')}
          senders={r.from.map(g => g.address)}
        />
      </MarsFrame>

      <MarsFrame style={styles.panel}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>YOUR NOTE · ONLY ON THIS PHONE</Text>
          {saved ? <Text style={styles.savedText}>SAVED</Text> : <Icon name="edit-2" type="feather" size={14} color={civicColors.muted} />}
        </View>
        <TextInput
          value={memo}
          onChangeText={text => {
            setMemo(text);
            setSaved(false);
          }}
          onEndEditing={saveNote}
          placeholder="What was this for?"
          placeholderTextColor="#6A7078"
          style={styles.noteInput}
          multiline
          testID="TransactionNote"
        />
      </MarsFrame>

      <MarsFrame style={styles.panel} testID="TransactionFacts">
        <FrameHead
          label="ON THE CHAIN"
          right={
            <TouchableOpacity accessibilityRole="button" onPress={copyId} hitSlop={hit} testID="TransactionCopyId">
              <Text style={styles.link}>{copied ? 'Copied' : 'Copy ID'}</Text>
            </TouchableOpacity>
          }
        />
        <Text style={styles.txid} selectable>
          {[0, 16, 32, 48].map(start => (
            <Text key={start} style={(start / 16) % 2 ? styles.txidDim : undefined}>
              {tx.hash.slice(start, start + 16)}
            </Text>
          ))}
        </Text>
        {facts?.height ? <Fact label="Block" value={facts.height.toLocaleString('en-US')} /> : null}
        {size ? <Fact label="Size" value={plural(size, 'byte')} /> : null}
        {r.fee !== null ? <Fact label="Fee" value={`${formatMars(r.fee, { signed: false })} MARS`} /> : null}
        {r.fee !== null && size ? <Fact label="Fee rate" value={`${(r.fee / size).toFixed(1)} zubrins/byte`} /> : null}
      </MarsFrame>

      <View style={styles.actions}>
        <View style={styles.actionMain}>
          <MarsButton title="Open in explorer" icon="external-link" onPress={openExplorer} testID="TransactionExplorer" />
        </View>
        <MarsFrame cut={10} style={styles.share} onPress={() => Share.share({ message: url }).catch(() => {})} accessibilityRole="button">
          <Text style={styles.shareText}>Share</Text>
        </MarsFrame>
      </View>
    </ScrollView>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function Square({ icon, label, onPress, testID }) {
  return (
    <MarsFrame cut={9} style={styles.square} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <Icon name={icon} type="feather" size={19} color={civicColors.text} />
    </MarsFrame>
  );
}

// The civic wallet is named by its role, other wallets by the name the user gave them.
function walletName(w) {
  if (!w) return 'Your wallet';
  return w.civic ? 'Your civic wallet' : w.getLabel();
}

// The addresses on one side of the route: up to three, then how many more.
function Groups({ groups, wallet, side, fromYou = false, senders = [] }) {
  const shown = groups.slice(0, 3);
  return (
    <>
      {shown.map(g => {
        const mine = g.owner === 'this';
        let title = g.owner || shortAddress(g.address);
        if (mine) title = walletName(wallet);
        if (mine && side === 'to' && fromYou) title = wallet?.civic ? 'Back to your civic wallet' : `Back to ${walletName(wallet)}`;
        let what = 'Received';
        if (side === 'from') what = `${plural(g.count, 'coin')} spent`;
        else if (mine && fromYou) what = g.count > 1 ? `Returned, ${g.count} outputs` : 'Returned';
        // Someone else's change: back to an address that paid in, not a second recipient.
        const change = side === 'to' && !mine && !g.owner && senders.includes(g.address);
        if (change) what = 'Change, back to the sender';
        return (
          <View key={`${side}-${g.address}`} style={styles.node}>
            <View style={[styles.pin, mine ? styles.pinMine : side === 'to' && styles.pinOut]} />
            <View style={styles.nodeText}>
              <View style={styles.rowBetween}>
                <Text style={styles.nodeTitle} numberOfLines={1}>
                  {title}
                </Text>
                {mine ? <Text style={styles.you}>YOU</Text> : null}
              </View>
              <Text style={styles.nodeAddress} numberOfLines={1}>
                {mine || g.owner ? shortAddress(g.address) : side === 'from' || change ? 'Sender' : 'Not one of your wallets'}
              </Text>
              <View style={styles.rowBetween}>
                <Text style={styles.nodeWhat}>{what}</Text>
                <Text style={styles.nodeValue}>{g.known ? formatMars(g.value, { signed: false }) : '—'}</Text>
              </View>
            </View>
          </View>
        );
      })}
      {groups.length > shown.length ? <Text style={styles.more}>and {plural(groups.length - shown.length, 'more address')}</Text> : null}
    </>
  );
}

function Branch({ label, value }) {
  return (
    <View style={styles.branch}>
      <View style={styles.branchLine} />
      <Text style={styles.branchLabel}>{label}</Text>
      <Text style={styles.branchValue}>{value}</Text>
    </View>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function TransactionStatus() {
  const { wallets, txMetadata, saveToDisk, fetchAndSaveWalletTransactions, setSelectedWalletID } = useContext(BlueStorageContext);
  const { hash, walletID } = useRoute().params;
  const navigation = useNavigation();
  const focused = useIsFocused();
  const wallet = useMemo(() => wallets.find(w => w.getID() === walletID), [wallets, walletID]);
  const tx = useMemo(() => wallet?.getTransactions().find(t => t.hash === hash), [wallet, hash]);

  useEffect(() => {
    if (wallet) setSelectedWalletID(wallet.getID());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const onNote = useCallback(
    memo => {
      txMetadata[hash] = { ...(txMetadata[hash] || {}), memo };
      saveToDisk();
    },
    [hash, txMetadata, saveToDisk],
  );
  const onConfirmed = useCallback(() => {
    triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
    if (wallet) fetchAndSaveWalletTransactions(wallet.getID());
  }, [wallet, fetchAndSaveWalletTransactions]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {focused && <StatusBar barStyle="light-content" backgroundColor={civicColors.background} />}
      {tx ? (
        <>
          <HandoffComponent title="Transaction" type={HandoffComponent.activityTypes.ViewInBlockExplorer} url={explorerUrl(tx.hash)} />
          <TransactionView
            tx={tx}
            wallet={wallet}
            wallets={wallets}
            note={txMetadata[hash]?.memo || ''}
            onNote={onNote}
            onBack={() => navigation.goBack()}
            onConfirmed={onConfirmed}
          />
        </>
      ) : (
        <View style={styles.content}>
          <View style={styles.top}>
            <Square icon="arrow-left" label="Go back" onPress={() => navigation.goBack()} />
          </View>
          <Text style={styles.body}>This transaction is not in your wallet yet. Pull down on the wallet to refresh it.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: civicColors.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, width: '100%', maxWidth: 560, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  topCode: { fontFamily: 'ChakraPetch-Medium', fontSize: 10, letterSpacing: 2, color: civicColors.muted },
  square: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { marginTop: 14, marginBottom: 18 },
  dirRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dir: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2.4, color: '#B9BEC4' },
  amount: {
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 40,
    lineHeight: 48,
    includeFontPadding: false,
    color: civicColors.text,
    fontVariant: ['tabular-nums'],
  },
  dim: { opacity: 0.45 },
  unit: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, letterSpacing: 1.5, color: civicColors.muted },
  sub: { fontFamily: 'ChakraPetch-Regular', fontSize: 14, color: civicColors.muted, marginTop: 6 },
  subStrong: { fontFamily: 'ChakraPetch-SemiBold', color: civicColors.text },
  panel: { padding: 16, gap: 10, marginBottom: 12 },
  recordKind: { fontFamily: 'ChakraPetch-Bold', fontSize: 19, color: civicColors.text },
  quote: { borderLeftWidth: 2, borderLeftColor: civicColors.orange, paddingLeft: 12, paddingVertical: 2 },
  quoteText: { fontFamily: 'ChakraPetch-Regular', fontSize: 14, lineHeight: 20, color: civicColors.text },
  body: { fontFamily: 'ChakraPetch-Regular', fontSize: 13.5, lineHeight: 19.5, color: '#B9BEC4' },
  cidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: civicColors.border,
    paddingTop: 10,
  },
  cid: { flex: 1, fontFamily: 'ChakraPetch-Medium', fontSize: 12.5, color: civicColors.text, marginRight: 12 },
  cidLabel: { fontSize: 10, letterSpacing: 1.5, color: civicColors.muted },
  link: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 13, color: civicColors.orange },
  segs: { flexDirection: 'row', gap: 5 },
  seg: { flex: 1, height: 6, backgroundColor: '#1E2227' },
  segOn: { backgroundColor: civicColors.orange },
  segOk: { backgroundColor: civicColors.ok },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  state: { fontFamily: 'ChakraPetch-Bold', fontSize: 17, letterSpacing: 0.3 },
  stateOk: { color: civicColors.ok },
  stateOn: { color: civicColors.orange },
  muted: { fontFamily: 'ChakraPetch-Medium', fontSize: 12, color: civicColors.muted, fontVariant: ['tabular-nums'] },
  when: { fontFamily: 'ChakraPetch-Regular', fontSize: 13, color: '#B9BEC4', fontVariant: ['tabular-nums'] },
  utc: { fontFamily: 'ChakraPetch-Regular', fontSize: 11.5, letterSpacing: 1, color: civicColors.muted },
  live: { fontFamily: 'ChakraPetch-Regular', fontSize: 12.5, color: civicColors.warn },
  headRight: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 1.5, color: civicColors.muted },
  node: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pin: { width: 13, height: 13, marginTop: 4, borderWidth: 2, borderColor: civicColors.orange, transform: [{ rotate: '45deg' }] },
  pinMine: { backgroundColor: civicColors.orange },
  pinOut: { borderColor: civicColors.text },
  nodeText: { flex: 1, minWidth: 0, gap: 2 },
  nodeTitle: { flexShrink: 1, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, color: civicColors.text },
  you: {
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: civicColors.background,
    backgroundColor: civicColors.orange,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  nodeAddress: { fontFamily: 'ChakraPetch-Regular', fontSize: 12.5, color: civicColors.muted },
  nodeWhat: { fontFamily: 'ChakraPetch-Regular', fontSize: 12.5, color: '#B9BEC4', marginTop: 4 },
  nodeValue: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 14, color: civicColors.text, fontVariant: ['tabular-nums'], marginTop: 4 },
  more: { fontFamily: 'ChakraPetch-Regular', fontSize: 12.5, color: civicColors.muted, marginLeft: 25 },
  wire: { marginLeft: 6, borderLeftWidth: 1, borderLeftColor: '#3A4048', paddingLeft: 18, paddingVertical: 6, gap: 8 },
  branch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  branchLine: { position: 'absolute', left: -18, top: 8, width: 12, borderTopWidth: 1, borderTopColor: '#3A4048' },
  branchLabel: { flex: 1, fontFamily: 'ChakraPetch-Regular', fontSize: 12.5, color: civicColors.muted, marginRight: 10 },
  branchValue: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 12.5, color: '#B9BEC4', fontVariant: ['tabular-nums'] },
  arrow: {
    position: 'absolute',
    left: -5,
    bottom: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#3A4048',
  },
  label: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2, color: civicColors.muted },
  savedText: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 10, letterSpacing: 1.5, color: civicColors.ok },
  noteInput: { fontFamily: 'ChakraPetch-Regular', fontSize: 15, color: civicColors.text, padding: 0, minHeight: 22 },
  txid: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 13, lineHeight: 20, letterSpacing: 0.6, color: civicColors.text },
  txidDim: { color: civicColors.muted },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: civicColors.border,
    paddingTop: 9,
  },
  factLabel: { fontFamily: 'ChakraPetch-Regular', fontSize: 13, color: '#B9BEC4' },
  factValue: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 13.5, color: civicColors.text, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  actionMain: { flex: 1.4 },
  share: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  shareText: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, color: civicColors.text },
});
