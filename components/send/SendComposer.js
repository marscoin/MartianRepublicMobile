// The send screen as people see it. Both ways into sending (the wallet's Send
// button and the centre Scan tab) draw this; each keeps its own logic and
// hands the state and the handlers in.
//
// Top to bottom: where the money comes from, how much, to whom, an optional
// note, what the network charges, and the one button, which stays above the
// keyboard and says what is still missing.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BlueClipboard from '../../blue_modules/clipboard';
import { normalizeAmountText } from '../../blue_modules/mars-amount';
import { COINS_UNREACHABLE } from '../../blue_modules/mars-coins';
import { feeRateText, networkFeeText, NEXT_BLOCK_TEXT } from '../../blue_modules/mars-fee-text';
import { scanQrHelper } from '../../helpers/scan-qr';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import {
  AddressText,
  CardLabel,
  Chip,
  HeaderAction,
  HIT_SLOP,
  IconTile,
  MarsUnit,
  MONO,
  Rise,
  SendButton,
  SendCard,
  SendHeader,
  SendNotice,
  TimingLine,
  sendColors,
  styles as shared,
  useReduceMotion,
} from './SendUi';
import { FeeSheet, OptionsSheet } from './SendSheets';
import { amountFontSize, fiatOfZubrins, marsText, ownWalletLabel, sendBlocker } from './sendFormat';

const NARROW = 360;

// How far the keyboard covers this view, measured against where the view
// really is on the screen. The send screen lives both in a sheet (which starts
// below the top of the window) and above the tab bar (which ends above the
// bottom), so the system's own estimate is wrong in both.
function useKeyboardOverlap(ref) {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const animate = event => {
      const duration = event?.duration;
      if (duration > 0) LayoutAnimation.configureNext({ duration, update: { type: LayoutAnimation.Types.keyboard } });
    };
    const frame = Keyboard.addListener('keyboardWillChangeFrame', event => {
      const top = event?.endCoordinates?.screenY;
      const node = ref.current;
      if (typeof top !== 'number' || !node?.measureInWindow) return;
      node.measureInWindow((x, y, width, height) => {
        animate(event);
        setOverlap(Math.max(0, Math.round(y + height - top)));
      });
    });
    const hide = Keyboard.addListener('keyboardWillHide', event => {
      animate(event);
      setOverlap(0);
    });
    return () => {
      frame.remove();
      hide.remove();
    };
  }, [ref]);
  return overlap;
}

// Where the payment comes from: the wallet and what it can spend. Tapping it
// changes the wallet.
function FromStrip({ label, balance, usdRate, editable, onPress, coinsLoading, chosenCoins, onCoinControl, onClearCoins }) {
  const fiat = fiatOfZubrins(balance, usdRate);
  const available = marsText(balance);
  return (
    <SendCard style={styles.from}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`From ${label}. ${available} MARS available.${editable ? ' Change wallet.' : ''}`}
        disabled={!editable}
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.fromRow}
        testID="SendFromWallet"
      >
        <IconTile icon="credit-card" />
        <View style={styles.fromText}>
          <CardLabel>FROM</CardLabel>
          <Text style={styles.fromLabel} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={styles.fromBalance}>
          <View style={styles.fromFigureRow}>
            <Text style={styles.fromFigure} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="SendBalance">
              {available || '0'}
            </Text>
            <MarsUnit size={13} color={sendColors.faint} />
          </View>
          <Text style={styles.fromNote} numberOfLines={1}>
            {coinsLoading ? 'Checking coins…' : fiat ? `${fiat} available` : 'available'}
          </Text>
        </View>
        {editable ? <Icon name="chevron-down" type="feather" size={18} color={sendColors.dim} /> : null}
      </TouchableOpacity>
      {chosenCoins !== null ? (
        <View style={styles.coinsRow} testID="SendChosenCoins">
          <TouchableOpacity accessibilityRole="button" onPress={onCoinControl} style={styles.coinsText} hitSlop={HIT_SLOP}>
            <Icon name="sliders" type="feather" size={14} color={sendColors.orange} />
            <Text style={styles.coinsLabel}>
              Spending only {chosenCoins} chosen {chosenCoins === 1 ? 'coin' : 'coins'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Use all coins again"
            onPress={onClearCoins}
            hitSlop={HIT_SLOP}
            testID="SendChosenCoinsClear"
          >
            <Text style={styles.coinsClear}>Use all</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SendCard>
  );
}

// The amount: the largest thing on the screen. `focus()` puts the cursor in
// it, so a scan or a paste can hand over to the keyboard.
const AmountField = forwardRef(function AmountField(
  { amount, amountSats, unit, usdRate, editable, onChangeText, onUseMax, canUseMax, problem, width, reduceMotion, onHeight },
  ref,
) {
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  const line = useRef(new Animated.Value(0)).current;
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus?.() }), []);

  useEffect(() => {
    if (reduceMotion) {
      line.setValue(focused ? 1 : 0);
      return;
    }
    const animation = Animated.timing(line, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [focused, line, reduceMotion]);

  const isMax = amount === BitcoinUnit.MAX;
  const text = amount && !isMax ? String(amount) : '';
  const inFiat = unit === BitcoinUnit.LOCAL_CURRENCY;
  const inZubrins = unit === BitcoinUnit.ZUBRINS || unit === BitcoinUnit.SATS;
  const fontSize = amountFontSize(text || '0', width);
  const known = Number.isSafeInteger(Number(amountSats)) && Number(amountSats) > 0;

  let under = ' ';
  if (isMax) under = 'Everything in this wallet, less the network fee.';
  else if (problem) under = problem;
  else if (inFiat) under = known ? `≈ ${marsText(Number(amountSats))} MARS` : 'in US dollars';
  else if (!text) under = fiatOfZubrins(0, usdRate) || ' ';
  else if (known) under = fiatOfZubrins(Number(amountSats), usdRate) ? `≈ ${fiatOfZubrins(Number(amountSats), usdRate)}` : ' ';

  return (
    <View style={styles.amount} onLayout={event => onHeight?.(event.nativeEvent.layout.height)}>
      <Pressable
        // Not one element to a screen reader: the field inside it is what is read and edited.
        accessible={false}
        disabled={!editable || isMax}
        onPress={() => input.current?.focus?.()}
        style={styles.amountPress}
      >
        <View style={styles.amountRow}>
          {isMax ? (
            <Text style={[styles.amountInput, styles.amountMax, { fontSize }]} testID="SendAmountMax">
              MAX
            </Text>
          ) : (
            <>
              {inFiat ? <Text style={[styles.amountPrefix, { fontSize: Math.round(fontSize * 0.6) }]}>$</Text> : null}
              <TextInput
                ref={input}
                testID="MarsAmountInput"
                accessibilityLabel="Amount to send"
                value={text}
                onChangeText={value => {
                  // Digits and one decimal point; no zero left in front of other digits.
                  const next = normalizeAmountText(value);
                  if (next !== null) onChangeText(next);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={editable}
                keyboardType={inZubrins ? 'number-pad' : 'decimal-pad'}
                placeholder="0"
                placeholderTextColor={sendColors.dim}
                selectionColor={sendColors.orange}
                maxLength={18}
                style={[styles.amountInput, { fontSize, height: Math.round(fontSize * 1.25) }, !editable && styles.dim]}
              />
            </>
          )}
          {inZubrins ? <Text style={styles.amountUnitWord}>zubrins</Text> : inFiat ? null : <MarsUnit size={Math.round(fontSize * 0.5)} />}
        </View>
        <View style={styles.amountTrack}>
          <Animated.View style={[styles.amountLine, { opacity: line, transform: [{ scaleX: line }] }]} />
        </View>
      </Pressable>
      <Text style={[styles.amountUnder, problem && !isMax ? styles.danger : null]} testID="SendAmountNote" numberOfLines={1}>
        {under}
      </Text>
      {editable ? (
        <Chip
          title="Max"
          icon={isMax ? 'x' : 'maximize-2'}
          active={isMax}
          disabled={!isMax && !canUseMax}
          onPress={isMax ? () => onChangeText('') : onUseMax}
          accessibilityLabel={isMax ? 'Stop sending the full balance' : 'Send the full balance'}
          testID="SendMaxChip"
          style={styles.maxChip}
        />
      ) : null}
    </View>
  );
});

// Who is being paid. Empty, it invites a paste or a scan; holding a valid
// address, it shows the address so it can be checked, and says so when the
// address is one of the person's own.
function RecipientCard({ address, valid, ownLabel, editable, onChangeText, onScanned, scanName, triggerScan, onFocus, reduceMotion }) {
  const { navigate } = useNavigation();
  const [focused, setFocused] = useState(false);
  const [notice, setNotice] = useState('');
  const pop = useRef(new Animated.Value(1)).current;
  const timer = useRef(null);
  const handlers = useRef({});
  handlers.current = { navigate, scanName, onScanned };

  useEffect(() => () => clearTimeout(timer.current), []);

  // The Scan tab opens the camera by itself the first time it is shown.
  useEffect(() => {
    if (!triggerScan) return;
    let current = true;
    Keyboard.dismiss();
    scanQrHelper(handlers.current.navigate, handlers.current.scanName).then(data => {
      if (current) handlers.current.onScanned({ data });
    });
    return () => {
      current = false;
    };
  }, [triggerScan]);

  useEffect(() => {
    if (!valid || reduceMotion) return;
    pop.setValue(0);
    const animation = Animated.timing(pop, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [valid, pop, reduceMotion]);

  const say = message => {
    clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(''), 4000);
  };

  const paste = async () => {
    let pasted = '';
    try {
      pasted = String((await BlueClipboard().getClipboardContent()) || '').trim();
    } catch (_) {}
    if (!pasted) {
      say('Nothing to paste. Copy a Marscoin address first.');
      return;
    }
    setNotice('');
    onChangeText(pasted);
  };

  const scan = () => {
    Keyboard.dismiss();
    scanQrHelper(navigate, scanName).then(onScanned);
  };

  if (valid) {
    return (
      <Animated.View
        style={{
          opacity: pop,
          transform: [
            {
              scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }),
            },
          ],
        }}
        testID="SendRecipientCard"
      >
        <SendCard style={styles.recipientValid}>
          <View style={styles.recipientHead}>
            <CardLabel>TO</CardLabel>
            {editable ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Remove this address"
                onPress={() => onChangeText('')}
                hitSlop={HIT_SLOP}
                style={styles.clear}
                testID="SendRecipientClear"
              >
                <Icon name="x" type="feather" size={15} color={sendColors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.recipientBody}>
            <IconTile icon="check" />
            <AddressText address={address} style={styles.recipientAddress} testID="SendRecipientAddress" />
          </View>
          {ownLabel ? (
            <View style={styles.own} testID="SendRecipientOwn">
              <Icon name="repeat" type="feather" size={13} color={sendColors.good} />
              <Text style={styles.ownText} numberOfLines={1}>
                One of your own addresses · {ownLabel}
              </Text>
            </View>
          ) : null}
        </SendCard>
      </Animated.View>
    );
  }

  const invalid = !!address && (!focused || address.length >= 34);
  return (
    <SendCard style={[styles.recipient, focused && styles.cardFocused, invalid && styles.cardInvalid]} testID="SendRecipientEmpty">
      <CardLabel>TO</CardLabel>
      <TextInput
        testID="AddressInput"
        accessibilityLabel="Marscoin address"
        value={address}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        editable={editable}
        placeholder="Marscoin address"
        placeholderTextColor={sendColors.dim}
        selectionColor={sendColors.orange}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="done"
        clearButtonMode="while-editing"
        style={styles.addressInput}
      />
      {invalid ? (
        <Text style={styles.fieldError} testID="SendAddressInvalid" accessibilityLiveRegion="polite">
          This is not a valid Marscoin address. Check it, or paste or scan it again.
        </Text>
      ) : null}
      {notice ? (
        <Text style={styles.fieldNote} testID="SendPasteNotice" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {editable ? (
        <View style={styles.recipientActions}>
          <Chip title="Paste" icon="clipboard" onPress={paste} testID="SendPasteAddress" style={styles.recipientAction} />
          <Chip
            title="Scan"
            icon="maximize"
            onPress={scan}
            accessibilityLabel="Scan a code"
            testID="BlueAddressInputScanQrButton"
            style={styles.recipientAction}
          />
        </View>
      ) : null}
    </SendCard>
  );
}

// A note for the person's own records. One small row until it is used.
function NoteRow({ memo, onChangeText, editable, onFocus }) {
  const [open, setOpen] = useState(false);
  const input = useRef(null);
  if (!open && !memo) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        disabled={!editable}
        onPress={() => {
          setOpen(true);
          setTimeout(() => input.current?.focus?.(), 50);
        }}
        activeOpacity={0.8}
        style={styles.noteClosed}
        testID="SendAddNote"
      >
        <Icon name="edit-3" type="feather" size={15} color={sendColors.orange} />
        <Text style={styles.noteAdd}>Add a note</Text>
        <Text style={styles.noteHint}>Only you see it</Text>
      </TouchableOpacity>
    );
  }
  return (
    <SendCard style={styles.note}>
      <CardLabel>NOTE · ONLY YOU SEE IT</CardLabel>
      <TextInput
        ref={input}
        testID="SendNoteInput"
        accessibilityLabel="Note for your own records"
        value={memo}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={() => {
          if (!memo) setOpen(false);
        }}
        editable={editable}
        placeholder="What is this payment for?"
        placeholderTextColor={sendColors.dim}
        selectionColor={sendColors.orange}
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
        maxLength={200}
        style={styles.noteInput}
      />
    </SendCard>
  );
}

// What the network charges: one fee, said plainly, and what is true about
// how long it takes. "Advanced" opens the sheet for a custom rate.
function FeeCard({ fee, feeRate, custom, usdRate, loading, coinsStatus, onAdvanced, disabled }) {
  const amount = networkFeeText(fee, usdRate);
  return (
    <SendCard style={styles.fee}>
      <View style={styles.feeHead}>
        <CardLabel>NETWORK FEE</CardLabel>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Advanced fee settings"
          disabled={disabled}
          onPress={onAdvanced}
          hitSlop={HIT_SLOP}
          style={styles.feeAdvanced}
          testID="chooseFee"
        >
          <Text style={styles.feeAdvancedText}>Advanced</Text>
          <Icon name="chevron-right" type="feather" size={14} color={sendColors.faint} />
        </TouchableOpacity>
      </View>
      {loading && !amount ? (
        <ActivityIndicator color={sendColors.orange} style={styles.feeSpinner} />
      ) : (
        <Text style={styles.feeValue} testID="SendFeeValue" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {amount || feeRateText(feeRate)}
        </Text>
      )}
      {custom ? (
        <Text style={styles.feeNote} testID="SendFeeCustom">
          Custom rate · {feeRateText(feeRate)}
        </Text>
      ) : !amount && coinsStatus === 'loading' ? (
        <Text style={styles.feeNote}>The exact fee appears once your coins have loaded.</Text>
      ) : null}
      <TimingLine style={styles.feeTiming}>{NEXT_BLOCK_TEXT}</TimingLine>
    </SendCard>
  );
}

export default function SendComposer({
  // Where the screen sits: 'sheet' (opened from a wallet) or 'tab' (the Scan tab).
  placement = 'sheet',
  title = 'Send Marscoin',
  onClose,
  // From
  wallet,
  wallets,
  balance,
  usdRate,
  editable = true,
  busy = false,
  onSelectWallet,
  chosenCoins = null,
  onCoinControl,
  onClearCoins,
  coins = { status: 'ready' },
  onRetryCoins,
  // Recipients: the screen's list of { key, address, amount, amountSats }
  recipients = [],
  units = [],
  defaultUnit,
  listRef,
  onPageScrollEnd,
  onPageScroll,
  amountRef,
  onChangeAmount,
  onChangeAddress,
  onScanned,
  scanName,
  triggerScan = false,
  onUseMax,
  // Note
  memo = '',
  onChangeMemo,
  // Fee
  fee,
  feeRate,
  standardRate,
  customFee = false,
  feesLoading = false,
  feeSheetVisible = false,
  onShowFee,
  onHideFee,
  onChooseFeeRate,
  // Options
  options = [],
  optionsVisible = false,
  onShowOptions,
  onHideOptions,
  // Next
  onNext,
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const root = useRef(null);
  const scroll = useRef(null);
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const [page, setPage] = useState(0);
  const keyboard = useKeyboardOverlap(root);

  const pageWidth = Math.min(width, 560);
  const pad = pageWidth < NARROW ? 16 : 20;
  const isAddressValid = address => !!wallet?.isAddressValid?.(address);
  const blocker = sendBlocker({ recipients, balance, isAddressValid, fee });
  const many = recipients.length > 1;

  // Which of the person's wallets each address belongs to, if any. Worked out
  // from the wallets on the phone; nothing is asked of the network.
  const addressList = recipients.map(recipient => recipient.address || '').join('|');
  const ownLabels = useMemo(
    () => recipients.map(recipient => (wallet?.isAddressValid?.(recipient.address) ? ownWalletLabel(recipient.address, wallets) : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addressList, wallet, wallets],
  );

  const pageOf = event => {
    const offset = event?.nativeEvent?.contentOffset?.x;
    const size = event?.nativeEvent?.layoutMeasurement?.width;
    if (typeof offset === 'number' && size > 0) setPage(Math.max(0, Math.min(recipients.length - 1, Math.round(offset / size))));
  };

  // Bring a field that has just taken the keyboard into view, once the
  // keyboard has finished rising.
  const pagesTop = useRef(0);
  const amountHeight = useRef(200);
  const revealRecipient = () =>
    setTimeout(() => scroll.current?.scrollTo?.({ y: Math.max(0, pagesTop.current + amountHeight.current - 16), animated: true }), 280);
  const revealEnd = () => setTimeout(() => scroll.current?.scrollToEnd?.({ animated: true }), 280);

  const renderPage = ({ item, index }) => {
    const unit = units[index] || defaultUnit || BitcoinUnit.MARS;
    const amountProblem = blocker && blocker.field === 'amount' && blocker.index === index && !/^Enter an amount/.test(blocker.reason);
    return (
      <View style={{ width: pageWidth, paddingHorizontal: pad }} testID={'Transaction' + index}>
        <AmountField
          ref={input => amountRef?.(index, input)}
          onHeight={height => {
            amountHeight.current = height;
          }}
          amount={item.amount}
          amountSats={item.amountSats}
          unit={unit}
          usdRate={usdRate}
          editable={editable && !busy}
          onChangeText={text => onChangeAmount(index, text)}
          onUseMax={onUseMax}
          canUseMax={balance > 0}
          problem={amountProblem ? blocker.reason.replace(/ \(recipient \d+\)$/, '') : null}
          width={pageWidth}
          reduceMotion={reduceMotion}
        />
        <RecipientCard
          address={item.address || ''}
          valid={isAddressValid(item.address)}
          ownLabel={ownLabels[index]}
          editable={editable && !busy}
          onChangeText={text => onChangeAddress(index, text)}
          onScanned={onScanned}
          scanName={scanName}
          triggerScan={index === 0 && triggerScan}
          onFocus={revealRecipient}
          reduceMotion={reduceMotion}
        />
      </View>
    );
  };

  const keyboardUp = keyboard > 0;
  const barBottom = keyboardUp ? 10 : placement === 'tab' ? 30 : Math.max(insets.bottom, 12) + 8;

  return (
    <View
      ref={root}
      style={[shared.screen, { paddingBottom: keyboard }]}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      testID="SendComposer"
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + (placement === 'tab' ? 8 : 18),
            width: pageWidth,
          },
        ]}
      >
        <View style={{ paddingHorizontal: pad }}>
          <SendHeader
            overline="MCR / SEND"
            title={title}
            onBack={onClose}
            backIcon="x"
            backLabel="Close"
            backTestID="SendClose"
            right={
              onShowOptions ? (
                <HeaderAction
                  icon="more-horizontal"
                  label="More options"
                  onPress={() => {
                    Keyboard.dismiss();
                    onShowOptions();
                  }}
                  disabled={busy}
                  testID="advancedOptionsMenuButton"
                />
              ) : null
            }
          />
          <Rise still={reduceMotion}>
            <FromStrip
              label={wallet?.getLabel?.() || 'Wallet'}
              balance={balance}
              usdRate={usdRate}
              editable={editable && !busy}
              onPress={onSelectWallet}
              coinsLoading={coins.status === 'loading'}
              chosenCoins={chosenCoins}
              onCoinControl={onCoinControl}
              onClearCoins={onClearCoins}
            />
            {coins.status === 'failed' ? (
              <View style={styles.coinsNotice}>
                <SendNotice onPress={onRetryCoins} action="Try again" detail={coins.detail || undefined} testID="RetryCoins">
                  {COINS_UNREACHABLE}
                </SendNotice>
              </View>
            ) : null}
          </Rise>
        </View>

        <Rise
          still={reduceMotion}
          delay={60}
          onLayout={event => {
            pagesTop.current = event.nativeEvent.layout.y;
          }}
        >
          <FlatList
            ref={listRef}
            data={recipients}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            scrollEnabled={many}
            keyboardShouldPersistTaps="always"
            removeClippedSubviews={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollBegin={Keyboard.dismiss}
            onMomentumScrollEnd={event => {
              pageOf(event);
              onPageScrollEnd?.(event);
            }}
            onScroll={event => {
              if (Platform.OS !== 'ios') pageOf(event);
              onPageScroll?.(event);
            }}
            scrollEventThrottle={200}
            style={{ width: pageWidth }}
            testID="SendRecipients"
          />
          {many ? (
            <View style={styles.pager} testID="SendRecipientPager">
              {recipients.map((recipient, index) => (
                <View key={recipient.key || index} style={[styles.pagerDot, index === page && styles.pagerDotOn]} />
              ))}
              <Text style={styles.pagerText}>
                Recipient {Math.min(page, recipients.length - 1) + 1} of {recipients.length} · swipe for the others
              </Text>
            </View>
          ) : null}
        </Rise>

        <Rise still={reduceMotion} delay={120} style={{ paddingHorizontal: pad }}>
          <NoteRow memo={memo} onChangeText={onChangeMemo} editable={!busy} onFocus={revealEnd} />
          <FeeCard
            fee={fee}
            feeRate={feeRate}
            custom={customFee}
            usdRate={usdRate}
            loading={feesLoading}
            coinsStatus={coins.status}
            onAdvanced={() => {
              Keyboard.dismiss();
              onShowFee?.();
            }}
            disabled={busy}
          />
        </Rise>
      </ScrollView>

      <View style={[styles.bar, { paddingHorizontal: pad, paddingBottom: barBottom }]}>
        <View style={[styles.barRow, { maxWidth: 560 - pad * 2 }]}>
          <SendButton
            title={blocker ? blocker.reason : 'Review payment'}
            iconRight={blocker ? undefined : 'arrow-right'}
            disabled={!!blocker}
            busy={busy}
            onPress={onNext}
            testID="CreateTransactionButton"
            style={styles.barButton}
          />
          {keyboardUp ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Hide the keyboard"
              onPress={Keyboard.dismiss}
              style={styles.barKeyboard}
              testID="SendDismissKeyboard"
            >
              <Icon name="chevron-down" type="feather" size={22} color={sendColors.text} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FeeSheet
        visible={feeSheetVisible}
        onClose={onHideFee}
        fee={fee}
        rate={feeRate}
        standardRate={standardRate}
        custom={customFee}
        usdRate={usdRate}
        onChoose={onChooseFeeRate}
      />
      <OptionsSheet visible={optionsVisible} onClose={onHideOptions} options={options} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', paddingBottom: 20 },
  dim: { opacity: 0.5 },
  danger: { color: sendColors.danger },

  from: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 12 },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fromText: { flex: 1, gap: 3 },
  fromLabel: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  fromBalance: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '50%' },
  fromFigureRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fromFigure: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16, flexShrink: 1, fontVariant: ['tabular-nums'] },
  fromNote: { color: sendColors.faint, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sendColors.border,
  },
  coinsText: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  coinsLabel: { color: sendColors.muted, fontSize: 13 },
  coinsClear: { color: sendColors.orange, fontFamily: 'ChakraPetch-SemiBold', fontSize: 13 },
  coinsNotice: { marginTop: 10 },

  amount: { alignItems: 'center', paddingTop: 26, paddingBottom: 22 },
  amountPress: { alignItems: 'center', alignSelf: 'stretch' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, maxWidth: '100%' },
  amountInput: {
    color: sendColors.text,
    fontFamily: 'ChakraPetch-Bold',
    padding: 0,
    minWidth: 44,
    flexShrink: 1,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  amountMax: { color: sendColors.orange, letterSpacing: 2 },
  amountPrefix: { color: sendColors.muted, fontFamily: 'ChakraPetch-Bold' },
  amountUnitWord: { color: sendColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16, alignSelf: 'flex-end', marginBottom: 10 },
  amountTrack: { width: 120, height: 2, borderRadius: 1, backgroundColor: sendColors.hairline, marginTop: 6, overflow: 'hidden' },
  amountLine: { flex: 1, backgroundColor: sendColors.orange },
  amountUnder: {
    color: sendColors.muted,
    fontFamily: 'ChakraPetch-Medium',
    fontSize: 15,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  maxChip: { marginTop: 12 },

  recipient: { gap: 10 },
  recipientValid: { gap: 12, borderColor: 'rgba(255,129,45,0.45)' },
  cardFocused: { borderColor: sendColors.border },
  cardInvalid: { borderColor: 'rgba(244,163,138,0.55)' },
  recipientHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: sendColors.tile },
  recipientBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recipientAddress: { flex: 1 },
  own: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ownText: { color: sendColors.good, fontSize: 13, flexShrink: 1 },
  addressInput: { color: sendColors.text, fontFamily: MONO, fontSize: 15, minHeight: 40, paddingVertical: 6, paddingHorizontal: 0 },
  fieldError: { color: sendColors.danger, fontSize: 13, lineHeight: 18 },
  fieldNote: { color: sendColors.muted, fontSize: 13, lineHeight: 18 },
  recipientActions: { flexDirection: 'row', gap: 10 },
  recipientAction: { flex: 1, minHeight: 46, borderRadius: 23 },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sendColors.border },
  pagerDotOn: { backgroundColor: sendColors.orange, width: 16 },
  pagerText: { color: sendColors.faint, fontSize: 12, marginLeft: 6 },

  noteClosed: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 6, paddingHorizontal: 4 },
  noteAdd: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 14, flex: 1 },
  noteHint: { color: sendColors.dim, fontSize: 12 },
  note: { marginTop: 12, gap: 6 },
  noteInput: { color: sendColors.text, fontSize: 16, minHeight: 36, paddingVertical: 4, paddingHorizontal: 0 },

  fee: { marginTop: 8, backgroundColor: sendColors.raised },
  feeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feeAdvanced: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  feeAdvancedText: { color: sendColors.faint, fontFamily: 'ChakraPetch-Medium', fontSize: 13 },
  feeValue: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16, marginTop: 8, fontVariant: ['tabular-nums'] },
  feeSpinner: { alignSelf: 'flex-start', marginTop: 8 },
  feeNote: { color: sendColors.faint, fontSize: 13, lineHeight: 18, marginTop: 2 },
  feeTiming: { marginTop: 10 },

  bar: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sendColors.hairline,
    backgroundColor: sendColors.background,
    alignItems: 'center',
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', width: '100%' },
  barButton: { flex: 1 },
  barKeyboard: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: sendColors.panel,
    borderWidth: 1,
    borderColor: sendColors.border,
  },
});
