import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Native-stack supplies the glass background on iOS 26. Keep the content clear.
export default function HeaderAction({ title, label, color = '#FFFFFF', disabled = false, onPress, testID }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label || title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.button, title && styles.textButton, disabled && styles.disabled]}
    >
      {title ? (
        <Text style={[styles.title, styles.content, { color }]}>{title}</Text>
      ) : (
        <View style={[styles.dots, styles.content]} pointerEvents="none">
          {[0, 1, 2].map(dot => <View key={dot} style={[styles.dot, { backgroundColor: color }]} />)}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  textButton: { width: undefined, minWidth: 64, paddingHorizontal: 12 },
  title: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 17 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  content: {
    transform: [{ translateY: Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? -4 : 0 }],
  },
  disabled: { opacity: 0.4 },
});
