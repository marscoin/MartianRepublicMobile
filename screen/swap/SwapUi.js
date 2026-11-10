import React, { useContext } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useSwapOwnerId, useSwapWatcher } from '../../blue_modules/swap';
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

export function Steps({ steps, current, tone }) {
  return (
    <View style={swapStyles.steps}>
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current && tone === 'active';
        return (
          <View key={label} style={swapStyles.step}>
            <View style={[swapStyles.stepMark, done && swapStyles.stepDone, active && swapStyles.stepActive]}>
              {done ? (
                <Icon name="check" type="feather" size={14} color={civicColors.background} />
              ) : (
                <Text style={swapStyles.stepNumber}>{index + 1}</Text>
              )}
            </View>
            <Text style={[swapStyles.stepLabel, (done || active) && swapStyles.stepLabelOn]}>{label}</Text>
          </View>
        );
      })}
    </View>
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
