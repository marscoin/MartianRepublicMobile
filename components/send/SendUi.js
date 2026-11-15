// The pieces the payment flow is built from (compose, review, sent). Same
// language as the scanner and the civic screens: near-black surfaces, warm
// off-white text, one orange accent, Chakra Petch for labels and figures.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { civicColors } from '../CivicUi';
import { addressParts } from './sendFormat';

export const sendColors = {
  ...civicColors,
  raised: '#0B0D0F',
  hairline: '#23272C',
  tile: '#1D2126',
  faint: '#8A9098',
  dim: '#6B7178',
  danger: '#F4A38A',
  good: '#8FCEAB',
};

export const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

// Whether the person has asked the phone for less movement.
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => mounted && setReduceMotion(Boolean(enabled)))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => setReduceMotion(Boolean(enabled)));
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);
  return reduceMotion;
}

// Content that rises a little into place when the screen opens. Still under
// Reduce Motion.
export function Rise({ children, delay = 0, still = false, style, onLayout }) {
  const value = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      value.setValue(1);
      return;
    }
    const animation = Animated.timing(value, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [value, delay, still]);
  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        style,
        {
          opacity: value,
          transform: [
            {
              translateY: value.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function SendOverline({ children, style }) {
  return (
    <View style={[styles.overlineRow, style]}>
      <View style={styles.tick} />
      <Text style={styles.overline}>{children}</Text>
    </View>
  );
}

// The top of each screen: a way out on the left, the overline and title, and
// room for one action on the right.
export function SendHeader({ overline, title, onBack, backIcon = 'arrow-left', backLabel = 'Go back', backTestID, right }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          style={styles.headerButton}
          hitSlop={HIT_SLOP}
          testID={backTestID}
        >
          <Icon name={backIcon} type="feather" size={20} color={sendColors.text} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.headerText}>
        <SendOverline>{overline}</SendOverline>
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title}
        </Text>
      </View>
      {right || null}
    </View>
  );
}

export function HeaderAction({ icon, label, title, onPress, testID, disabled = false }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label || title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.headerButton, title ? styles.headerButtonWide : null, disabled && styles.disabled]}
      hitSlop={HIT_SLOP}
      testID={testID}
    >
      {icon ? <Icon name={icon} type="feather" size={20} color={sendColors.text} /> : null}
      {title ? <Text style={styles.headerButtonText}>{title}</Text> : null}
    </TouchableOpacity>
  );
}

// The Marscoin sign: an M under a bar.
export function MarsUnit({ size = 24, color = sendColors.muted }) {
  const bar = Math.max(2, Math.round(size / 11));
  return (
    <View accessible accessibilityLabel="MARS" style={styles.unit}>
      <View
        style={{ height: bar, backgroundColor: color, borderRadius: bar / 2, marginHorizontal: size * 0.06, marginBottom: size * 0.04 }}
      />
      <Text style={[styles.unitLetter, { fontSize: size, lineHeight: Math.round(size * 1.08), color }]}>M</Text>
    </View>
  );
}

// An amount as the hero of a screen: a large figure with the Marscoin sign,
// and its value in dollars underneath when there is one.
export function HeroAmount({ amount, fiat, size = 52, testID, fiatTestID }) {
  const length = String(amount || '').length;
  const fontSize =
    length > 14 ? Math.round(size * 0.55) : length > 10 ? Math.round(size * 0.7) : length > 7 ? Math.round(size * 0.85) : size;
  return (
    <View style={styles.hero}>
      <View style={styles.heroRow}>
        <Text
          style={[styles.heroFigure, { fontSize, lineHeight: Math.round(fontSize * 1.15) }]}
          testID={testID}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {amount}
        </Text>
        <MarsUnit size={Math.round(fontSize * 0.5)} />
      </View>
      {fiat ? (
        <Text style={styles.heroFiat} testID={fiatTestID}>
          {fiat}
        </Text>
      ) : null}
    </View>
  );
}

export function SendCard({ children, style, testID }) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export function CardLabel({ children, style }) {
  return <Text style={[styles.cardLabel, style]}>{children}</Text>;
}

export function IconTile({ icon, tint = sendColors.orange }) {
  return (
    <View style={styles.tile}>
      <Icon name={icon} type="feather" size={18} color={tint} />
    </View>
  );
}

// An address shown whole, with the characters people check (the first and the
// last) standing out from the middle.
export function AddressText({ address, style, testID, lead = 6, tail = 6 }) {
  const parts = addressParts(address, lead, tail);
  return (
    <Text style={[styles.address, style]} selectable testID={testID} accessibilityLabel={`Address ${address}`}>
      <Text style={styles.addressStrong}>{parts.head}</Text>
      {parts.middle}
      <Text style={styles.addressStrong}>{parts.tail}</Text>
    </Text>
  );
}

// One line of a column of figures: a label on the left, the figure on the
// right, set so that digits line up from row to row.
export function FigureRow({ label, value, note, strong = false, testID }) {
  return (
    <View style={styles.figureRow}>
      <Text style={[styles.figureLabel, strong && styles.figureLabelStrong]}>{label}</Text>
      <View style={styles.figureValues}>
        <Text style={[styles.figure, strong && styles.figureStrong]} testID={testID}>
          {value}
        </Text>
        {note ? <Text style={styles.figureNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

// The line about timing, with a small clock.
export function TimingLine({ children, style }) {
  return (
    <View style={[styles.timing, style]}>
      <Icon name="clock" type="feather" size={14} color={sendColors.faint} />
      <Text style={styles.timingText}>{children}</Text>
    </View>
  );
}

// The main action: an orange pill. When it cannot be used yet it goes quiet
// and its words say why.
export function SendButton({ title, onPress, disabled = false, busy = false, secondary = false, icon, iconRight, testID, style }) {
  const quiet = secondary || disabled;
  const tint = secondary ? sendColors.text : disabled ? sendColors.faint : sendColors.background;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      activeOpacity={0.85}
      testID={testID}
      style={[styles.button, quiet && styles.buttonQuiet, style]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? sendColors.orange : sendColors.background} />
      ) : (
        <>
          {icon ? <Icon name={icon} type="feather" size={18} color={tint} /> : null}
          <Text style={[styles.buttonText, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {title}
          </Text>
          {iconRight ? <Icon name={iconRight} type="feather" size={18} color={tint} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

// A small rounded action inside a card ("Paste", "Scan", "Max").
export function Chip({ title, icon, onPress, active = false, disabled = false, testID, accessibilityLabel, style }) {
  const tint = active ? sendColors.background : sendColors.orange;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={HIT_SLOP}
      testID={testID}
      style={[styles.chip, active && styles.chipActive, disabled && styles.disabled, style]}
    >
      {icon ? <Icon name={icon} type="feather" size={15} color={tint} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{title}</Text>
    </TouchableOpacity>
  );
}

// A quiet, bordered message with an optional action, for things that went
// wrong and can be tried again.
export function SendNotice({ children, detail, action, onPress, testID, danger = true }) {
  const body = (
    <>
      <Icon name={danger ? 'alert-triangle' : 'info'} type="feather" size={16} color={danger ? sendColors.danger : sendColors.muted} />
      <View style={styles.noticeText}>
        <Text style={[styles.noticeBody, danger && styles.noticeDanger]}>{children}</Text>
        {detail ? <Text style={styles.noticeDetail}>{detail}</Text> : null}
        {action ? <Text style={styles.noticeAction}>{action}</Text> : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.notice, danger && styles.noticeBorderDanger]} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.notice, danger && styles.noticeBorderDanger]}
      testID={testID}
    >
      {body}
    </TouchableOpacity>
  );
}

/* eslint-disable react-native/no-unused-styles */
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sendColors.background },
  overlineRow: { flexDirection: 'row', alignItems: 'center' },
  tick: { width: 3, height: 12, backgroundColor: sendColors.orange, marginRight: 8 },
  overline: { color: sendColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  headerText: { flex: 1 },
  title: { color: sendColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 24, lineHeight: 30, marginTop: 2 },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: sendColors.panel,
    borderWidth: 1,
    borderColor: sendColors.hairline,
  },
  headerButtonWide: { width: undefined, paddingHorizontal: 16 },
  headerButtonText: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 14, letterSpacing: 0.3 },
  unit: { alignSelf: 'center' },
  unitLetter: { fontFamily: 'ChakraPetch-Bold', includeFontPadding: false },
  hero: { alignItems: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, maxWidth: '100%' },
  heroFigure: { color: sendColors.text, fontFamily: 'ChakraPetch-Bold', flexShrink: 1, fontVariant: ['tabular-nums'] },
  heroFiat: { color: sendColors.muted, fontFamily: 'ChakraPetch-Medium', fontSize: 16, marginTop: 2, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: sendColors.panel, borderRadius: 18, borderWidth: 1, borderColor: sendColors.hairline, padding: 16 },
  cardLabel: { color: sendColors.faint, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 1.6 },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: sendColors.tile, alignItems: 'center', justifyContent: 'center' },
  address: { color: sendColors.faint, fontFamily: MONO, fontSize: 14, lineHeight: 21, letterSpacing: 0.4 },
  addressStrong: { color: sendColors.text, fontWeight: '700' },
  figureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingVertical: 6 },
  figureLabel: { color: sendColors.muted, fontSize: 15, lineHeight: 21 },
  figureLabelStrong: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  figureValues: { alignItems: 'flex-end', flexShrink: 1 },
  figure: {
    color: sendColors.text,
    fontFamily: 'ChakraPetch-Medium',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  figureStrong: { fontFamily: 'ChakraPetch-Bold', fontSize: 17 },
  figureNote: { color: sendColors.faint, fontSize: 12, lineHeight: 17, textAlign: 'right', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: sendColors.border, marginVertical: 8 },
  timing: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  timingText: { flex: 1, color: sendColors.faint, fontSize: 13, lineHeight: 18 },
  button: {
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 22,
    backgroundColor: sendColors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonQuiet: { backgroundColor: sendColors.panel, borderWidth: 1, borderColor: sendColors.border },
  buttonText: { fontFamily: 'ChakraPetch-Bold', fontSize: 17, flexShrink: 1, textAlign: 'center' },
  chip: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: sendColors.border,
    backgroundColor: 'rgba(255,129,45,0.08)',
  },
  chipActive: { backgroundColor: sendColors.orange, borderColor: sendColors.orange },
  chipText: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 13, letterSpacing: 0.4 },
  chipTextActive: { color: sendColors.background },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: sendColors.border,
    backgroundColor: sendColors.raised,
  },
  noticeBorderDanger: { borderColor: 'rgba(244,163,138,0.45)' },
  noticeText: { flex: 1, gap: 4 },
  noticeBody: { color: sendColors.muted, fontSize: 14, lineHeight: 20 },
  noticeDanger: { color: sendColors.danger },
  noticeDetail: { color: sendColors.faint, fontSize: 12, lineHeight: 17 },
  noticeAction: { color: sendColors.orange, fontFamily: 'ChakraPetch-SemiBold', fontSize: 14, marginTop: 2 },
  disabled: { opacity: 0.4 },
});
