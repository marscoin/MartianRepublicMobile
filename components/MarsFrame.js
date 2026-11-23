import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from 'react-native-elements';
import { civicColors } from './CivicUi';

// The Republic's panels: a thin outline with the top-left and bottom-right corners cut, like the consoles of a ship.
// The outline is drawn once the panel knows its size; what is inside lays itself out as usual.

// The outline as an SVG path, half a pixel inside the edge so a 1-pixel line stays sharp.
export function cutOutline(width, height, cut = 12, inset = 0.5) {
  const c = Math.max(0, Math.min(cut, width / 2, height / 2));
  const r = width - inset;
  const b = height - inset;
  const n = value => Math.round(value * 100) / 100;
  return `M${n(c)} ${n(inset)}H${n(r)}V${n(b - c + inset)}L${n(r - c + inset)} ${n(b)}H${n(inset)}V${n(c)}Z`;
}

/**
 * A panel with cut corners. With `onPress` it is a button. `tab` puts a short orange bar on the left edge (the panel
 * that matters most on a screen), `accent` a small orange bracket in the top-right corner.
 */
export default function MarsFrame({
  children,
  style,
  cut = 12,
  fill = civicColors.panel,
  border = civicColors.border,
  borderWidth = 1,
  tab = false,
  accent = false,
  onPress,
  ...props
}) {
  const [size, setSize] = useState(null);
  const Box = onPress ? TouchableOpacity : View;
  return (
    <Box
      {...props}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : undefined}
      style={[styles.box, style]}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setSize(current => (current && current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      {size ? (
        <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
          <Path d={cutOutline(size.width, size.height, cut, borderWidth / 2)} fill={fill} stroke={border} strokeWidth={borderWidth} />
        </Svg>
      ) : null}
      {tab ? <View pointerEvents="none" style={styles.tab} /> : null}
      {accent ? <View pointerEvents="none" style={styles.accent} /> : null}
      {children}
    </Box>
  );
}

// The line at the top of a panel: what it is on the left, its code in orange on the right.
export function FrameHead({ label, code, right }) {
  return (
    <View style={styles.head}>
      <Text style={styles.label}>{label}</Text>
      {code ? <Text style={styles.code}>{code}</Text> : right || null}
    </View>
  );
}

// The main action on a panel, in the same cut-corner shape.
export function MarsButton({ title, icon, onPress, disabled = false, testID, accessibilityLabel }) {
  return (
    <MarsFrame
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      cut={10}
      fill={civicColors.orange}
      border={civicColors.orange}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
      {icon ? <Icon name={icon} type="feather" size={18} color={civicColors.background} /> : null}
    </MarsFrame>
  );
}

const styles = StyleSheet.create({
  box: { position: 'relative' },
  tab: { position: 'absolute', left: 0, top: 18, width: 3, height: 40, backgroundColor: civicColors.orange },
  accent: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: civicColors.orange,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2, color: civicColors.muted },
  code: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 1.5, color: civicColors.orange },
  button: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  buttonText: { fontFamily: 'ChakraPetch-Bold', fontSize: 16, color: civicColors.background },
  disabled: { opacity: 0.4 },
});
