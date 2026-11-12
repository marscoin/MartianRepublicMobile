// The mark shown when a payment has gone out: a ring that closes clockwise
// from the top, then an orange disc with a tick that is drawn in, and one
// soft ripple. Drawn with plain views. With `animate` false (Reduce Motion)
// it is simply there, complete.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { sendColors } from './SendUi';

export default function SuccessMark({ size = 104, animate = true, label = 'Done', testID = 'SuccessMark' }) {
  const stroke = Math.max(3, Math.round(size / 26));
  const half = size / 2;
  const inset = Math.round(size * 0.1);
  const disc = size - inset * 2;
  const box = Math.round(size * 0.4);
  const tick = Math.max(4, Math.round(size / 19));

  const ring = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const fill = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const draw = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      ring.setValue(1);
      fill.setValue(1);
      draw.setValue(1);
      ripple.setValue(0);
      return;
    }
    ring.setValue(0);
    fill.setValue(0);
    draw.setValue(0);
    ripple.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 520, delay: 120, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(fill, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }),
        // The tick is revealed from left to right by a window that widens;
        // width cannot be driven natively.
        Animated.timing(draw, { toValue: 1, duration: 300, delay: 90, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(ripple, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [animate, ring, fill, draw, ripple]);

  const circle = { width: size, height: size, borderRadius: half };
  const arc = { width: half, height: size, borderWidth: stroke, borderColor: sendColors.orange };

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={label} testID={testID}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.layer,
          circle,
          styles.ripple,
          {
            opacity: ripple.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.5, 0] }),
            transform: [
              {
                scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.layer, circle, { borderWidth: stroke, borderColor: sendColors.hairline }]} />

      {/* First half of the ring: twelve o'clock round to six. */}
      <View style={[styles.layer, styles.clip, { left: half, width: half, height: size }]}>
        <Animated.View
          style={[
            styles.layer,
            { left: -half, width: size, height: size },
            {
              transform: [
                {
                  rotate: ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '180deg', '180deg'] }),
                },
              ],
            },
          ]}
        >
          <View style={[arc, styles.arcLeft, { borderTopLeftRadius: half, borderBottomLeftRadius: half }]} />
        </Animated.View>
      </View>
      {/* Second half: six o'clock back up to twelve. */}
      <View style={[styles.layer, styles.clip, styles.atLeft, { width: half, height: size }]}>
        <Animated.View
          style={[
            styles.layer,
            styles.atLeft,
            { width: size, height: size },
            {
              transform: [
                {
                  rotate: ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0deg', '180deg'] }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.layer,
              arc,
              styles.arcRight,
              {
                left: half,
                borderTopRightRadius: half,
                borderBottomRightRadius: half,
              },
            ]}
          />
        </Animated.View>
      </View>

      <Animated.View
        style={[
          styles.layer,
          styles.disc,
          {
            top: inset,
            left: inset,
            width: disc,
            height: disc,
            borderRadius: disc / 2,
          },
          {
            opacity: fill,
            transform: [
              {
                scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
              },
            ],
          },
        ]}
        testID={`${testID}Disc`}
      >
        <View style={{ width: box, height: box }}>
          <Animated.View
            style={[
              styles.clip,
              {
                height: box,
                width: draw.interpolate({ inputRange: [0, 1], outputRange: [0, box] }),
              },
            ]}
            testID={`${testID}Tick`}
          >
            <View style={[styles.tickBox, { width: box, height: box }]}>
              <View
                style={[
                  styles.tick,
                  {
                    width: Math.round(box * 0.82),
                    height: Math.round(box * 0.44),
                    borderLeftWidth: tick,
                    borderBottomWidth: tick,
                    marginTop: -Math.round(box * 0.16),
                  },
                ]}
              />
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0 },
  clip: { overflow: 'hidden' },
  atLeft: { left: 0 },
  arcLeft: { borderRightWidth: 0 },
  arcRight: { borderLeftWidth: 0 },
  tick: { borderColor: sendColors.background, borderBottomLeftRadius: 2, transform: [{ rotate: '-45deg' }] },
  ripple: { left: 0, borderWidth: 2, borderColor: sendColors.orange },
  disc: { alignItems: 'center', justifyContent: 'center', backgroundColor: sendColors.orange },
  tickBox: { alignItems: 'center', justifyContent: 'center' },
});
