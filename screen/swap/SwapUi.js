import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { Icon } from 'react-native-elements';
import { noteAppOpened } from '../../blue_modules/app-review';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useMakerRunner, useSwapOwnerId, useSwapWatcher, useSwaps } from '../../blue_modules/swap';
import { isSwapFinished } from '../../blue_modules/swap/engine';
import { describeSwap } from '../../blue_modules/swap/present';
import { navigationRef } from '../../NavigationService';
import { civicColors } from '../../components/CivicUi';
import { styles as shared } from '../workspace/WorkspaceUi';

// The wallet whose recovery phrase backs Bitcoin and swaps: the one that
// already owns swaps, otherwise an everyday Marscoin wallet, otherwise the
// civic wallet.
export function useSwapWallet() {
  const { wallets } = useContext(BlueStorageContext);
  const owner = useSwapOwnerId();
  const mars = wallets.filter(wallet => wallet.type === 'marscoin' && typeof wallet._getSeed === 'function' && wallet.getSecret());
  return mars.find(wallet => wallet.getID() === owner) || mars.find(wallet => !wallet.civic) || mars[0] || null;
}

// Renders nothing. Keeps swaps advancing while the app is open.
export function SwapWatcher() {
  const { wallets } = useContext(BlueStorageContext);
  useSwapWatcher(wallets);
  // Offers of Marscoin are answered from the same wallet.
  useMakerRunner(useSwapWallet());
  // Mounted once near the root, so this also counts app starts.
  React.useEffect(() => {
    noteAppOpened();
  }, []);
  return null;
}

export function Row({ label, value, strong = false }) {
  return (
    <View style={swapStyles.row}>
      <Text style={shared.secondaryText}>{label}</Text>
      <Text style={[swapStyles.value, strong && swapStyles.strong]}>{value}</Text>
    </View>
  );
}

// A long value such as an address or transaction ID; tap to copy.
export function Copyable({ label, value }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Copy ${label}`} onPress={copy} style={swapStyles.copyable}>
      <View style={swapStyles.copyText}>
        <Text style={shared.caption}>{copied ? 'Copied' : label}</Text>
        <Text style={swapStyles.mono} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Icon name={copied ? 'check' : 'copy'} type="feather" size={18} color={civicColors.orange} />
    </TouchableOpacity>
  );
}

// A value that runs 0 -> 1 over and over while mounted.
function useLoop(duration) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [value, duration]);
  return value;
}

// A soft ring that spreads out from whatever it surrounds: "this is live".
function Halo({ size }) {
  const beat = useLoop(1600);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        swapStyles.halo,
        { width: size, height: size, borderRadius: size / 2 },
        {
          opacity: beat.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
        },
      ]}
    />
  );
}

export function Steps({ steps, current, tone }) {
  return (
    <View style={swapStyles.steps}>
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current && tone === 'active';
        return (
          <View key={label} style={swapStyles.step}>
            <View style={swapStyles.stepSlot}>
              {active ? <Halo size={30} /> : null}
              <View style={[swapStyles.stepMark, done && swapStyles.stepDone, active && swapStyles.stepActive]}>
                {done ? (
                  <Icon name="check" type="feather" size={14} color={civicColors.background} />
                ) : (
                  <Text style={[swapStyles.stepNumber, active && swapStyles.stepNumberOn]}>{index + 1}</Text>
                )}
              </View>
            </View>
            <Text style={[swapStyles.stepLabel, (done || active) && swapStyles.stepLabelOn]}>{label}</Text>
            {active ? <ActivityIndicator size="small" color={civicColors.orange} style={swapStyles.stepSpinner} /> : null}
          </View>
        );
      })}
    </View>
  );
}

// The name of the screen now showing, kept current as the user moves about.
function useCurrentRouteName() {
  const [name, setName] = useState(() => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined));
  useEffect(() => {
    const read = () => setName(navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined);
    read();
    return navigationRef.addListener('state', read);
  }, []);
  return name;
}

// What the banner says for a swap, or null when it has nothing to show.
export function bannerFor(swaps) {
  const swap = swaps.find(item => !isSwapFinished(item));
  if (!swap) return null;
  const view = describeSwap(swap);
  if (view.tone !== 'active') return null;
  const step = Math.min(view.step, view.steps.length - 1);
  return {
    swapId: swap.id,
    step,
    count: view.steps.length,
    title: view.canPay ? 'Your Marscoin is locked. Pay to continue.' : view.title,
    detail: `Swap · step ${step + 1} of ${view.steps.length} · ${view.steps[step]}`,
    attention: view.canPay,
  };
}

// A live strip above the tab bar while a swap is under way, on every tab.
// Tapping it opens the swap.
export function SwapBanner() {
  const wallet = useSwapWallet();
  const swaps = useSwaps(wallet);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useCurrentRouteName();
  const banner = bannerFor(swaps);
  if (!banner || route === 'SwapDetail') return null;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${banner.title} ${banner.detail}. Open the swap.`}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('Citizen', { screen: 'SwapDetail', params: { swapId: banner.swapId } })}
      style={[swapStyles.banner, banner.attention && swapStyles.bannerAttention, { bottom: insets.bottom + 49 + 30 }]}
      testID="SwapBanner"
    >
      <View style={swapStyles.bannerDot}>
        <Halo size={12} />
        <View style={swapStyles.bannerDotCore} />
      </View>
      <View style={swapStyles.bannerText}>
        <Text style={swapStyles.bannerTitle} numberOfLines={1}>
          {banner.title}
        </Text>
        <Text style={swapStyles.bannerDetail} numberOfLines={1}>
          {banner.detail}
        </Text>
        <View style={swapStyles.bannerTrack}>
          {Array.from({ length: banner.count }, (_, index) => (
            <BannerSegment key={index} state={index < banner.step ? 'done' : index === banner.step ? 'live' : 'ahead'} />
          ))}
        </View>
      </View>
      <Icon name="chevron-right" type="feather" size={20} color={civicColors.muted} />
    </TouchableOpacity>
  );
}

function BannerSegment({ state }) {
  const beat = useLoop(1100);
  if (state !== 'live') return <View style={[swapStyles.bannerSegment, state === 'done' && swapStyles.bannerSegmentDone]} />;
  return (
    <Animated.View
      style={[
        swapStyles.bannerSegment,
        swapStyles.bannerSegmentLive,
        { opacity: beat.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.35, 1] }) },
      ]}
    />
  );
}

/* eslint-disable react-native/no-unused-styles */
export const swapStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
  value: { color: civicColors.text, fontFamily: 'ChakraPetch-Medium', fontSize: 16, flexShrink: 1, textAlign: 'right' },
  strong: { fontFamily: 'ChakraPetch-Bold', fontSize: 18 },
  amount: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 30, lineHeight: 36 },
  mono: { color: civicColors.text, fontSize: 14, lineHeight: 20 },
  copyable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: civicColors.border,
    backgroundColor: civicColors.panel,
  },
  copyText: { flex: 1, gap: 2 },
  qr: { alignSelf: 'center', padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF' },
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: civicColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSlot: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', borderWidth: 2, borderColor: civicColors.orange },
  stepSpinner: { marginLeft: 'auto' },
  stepNumberOn: { color: civicColors.orange },
  banner: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14171B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: civicColors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  bannerAttention: { borderColor: civicColors.orange },
  bannerDot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  bannerDotCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: civicColors.orange },
  bannerText: { flex: 1 },
  bannerTitle: { color: civicColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15 },
  bannerDetail: { color: civicColors.muted, fontSize: 12, marginTop: 2 },
  bannerTrack: { flexDirection: 'row', marginTop: 8 },
  bannerSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: civicColors.border, marginRight: 4 },
  bannerSegmentDone: { backgroundColor: '#8FCEAB' },
  bannerSegmentLive: { backgroundColor: civicColors.orange },
  stepDone: { backgroundColor: '#8FCEAB', borderColor: '#8FCEAB' },
  stepActive: { borderColor: civicColors.orange, borderWidth: 2 },
  stepNumber: { color: civicColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 13 },
  stepLabel: { color: civicColors.muted, fontSize: 15 },
  stepLabelOn: { color: civicColors.text },
  offer: { gap: 6 },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  offerMars: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 22 },
  offerPrice: { color: civicColors.orange, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  dim: { opacity: 0.45 },
});
