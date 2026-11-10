import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';

export const civicColors = {
  background: '#080A0C',
  panel: '#14171B',
  border: '#30353B',
  text: '#F5F1EB',
  muted: '#ADB3BA',
  orange: '#FF812D',
};

export function CivicBack({ onPress }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" onPress={onPress} style={civicStyles.back}>
      <Icon name="arrow-left" type="feather" size={22} color={civicColors.text} />
    </TouchableOpacity>
  );
}

export function CivicButton({ title, onPress, icon, secondary = false, disabled = false, testID }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      activeOpacity={0.8}
      style={[civicStyles.button, secondary && civicStyles.secondaryButton, disabled && civicStyles.disabled]}
    >
      {icon && <Icon name={icon} type="feather" size={20} color={secondary ? civicColors.text : civicColors.background} />}
      <Text style={[civicStyles.buttonText, secondary && civicStyles.secondaryButtonText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function CivicBrand({ subtitle = 'MARTIAN REPUBLIC' }) {
  return (
    <View style={civicStyles.brand}>
      <View style={civicStyles.brandMark} />
      <Text style={civicStyles.eyebrow}>{subtitle}</Text>
    </View>
  );
}

// Shared screen styles are also consumed by the civic screens.
/* eslint-disable react-native/no-unused-styles */
export const civicStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: civicColors.background },
  content: {
    flexGrow: 1,
    padding: 24,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 5, height: 18, backgroundColor: civicColors.orange },
  eyebrow: {
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 12,
    letterSpacing: 2,
    color: civicColors.muted,
  },
  title: {
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 36,
    lineHeight: 40,
    color: civicColors.text,
  },
  body: { fontSize: 16, lineHeight: 24, color: civicColors.muted },
  back: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: civicColors.panel,
  },
  button: {
    minHeight: 56,
    padding: 16,
    borderRadius: 14,
    backgroundColor: civicColors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: civicColors.border,
    backgroundColor: civicColors.panel,
  },
  buttonText: {
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 17,
    color: civicColors.background,
    flexShrink: 1,
    textAlign: 'center',
  },
  secondaryButtonText: { color: civicColors.text },
  disabled: { opacity: 0.4 },
});
