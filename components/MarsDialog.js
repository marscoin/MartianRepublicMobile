// A themed replacement for the system alert. `marsAlert` takes the same
// arguments as React Native's Alert.alert, so a call site only changes name.
// The sheet is drawn by <MarsDialogHost />, mounted once at the app root.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { hasDialogs, marsAlert, setDialogHost, takeDialog } from '../blue_modules/mars-alert';

export { marsAlert };

const c = {
  panel: '#101317',
  border: '#30353B',
  text: '#F5F1EB',
  muted: '#ADB3BA',
  orange: '#FF812D',
  danger: '#F4A38A',
};

// iOS cannot present a second modal over one that is already showing, and
// much of this app lives in modal screens. A window-level overlay sits above
// them all. Android's modal is a separate dialog window and has no such limit.
function Layer({ children, onRequestClose }) {
  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        <View style={StyleSheet.absoluteFill}>{children}</View>
      </FullWindowOverlay>
    );
  }
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

// "1. First\n\n2. Second\n\nClosing note" -> numbered steps plus paragraphs.
export function dialogBlocks(message) {
  if (typeof message !== 'string' || !message.trim()) return [];
  return message
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const step = /^(\d{1,2})\.\s+([\s\S]+)$/.exec(part);
      return step ? { number: step[1], text: step[2] } : { text: part };
    });
}

// Buttons in the order they are drawn: actions in the order given, the first
// one emphasised, cancel last.
export function dialogButtons(buttons) {
  const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }];
  const cancel = list.filter(button => button.style === 'cancel');
  const others = list.filter(button => button.style !== 'cancel');
  return [...others, ...cancel].map((button, index) => ({
    ...button,
    text: button.text || 'OK',
    kind: button.style === 'cancel' ? 'quiet' : button.style === 'destructive' ? 'danger' : index === 0 ? 'primary' : 'quiet',
  }));
}

export function MarsDialogHost() {
  const [dialog, setDialog] = useState(null);
  const current = useRef(null);
  const slide = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const next = useCallback(() => {
    if (current.current || !hasDialogs()) return;
    current.current = takeDialog();
    slide.setValue(0);
    setDialog(current.current);
    Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [slide]);

  useEffect(() => {
    setDialogHost({ next });
    next();
    return () => setDialogHost(null);
  }, [next]);

  const close = useCallback(
    button => {
      if (!current.current) return;
      Animated.timing(slide, { toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
        current.current = null;
        setDialog(null);
        // The action runs after the sheet is gone, so it can open another one.
        try {
          button?.onPress?.();
        } finally {
          next();
        }
      });
    },
    [slide, next],
  );

  if (!dialog) return null;
  const buttons = dialogButtons(dialog.buttons);
  const cancel = buttons.find(button => button.style === 'cancel');
  // Like the system alert: tapping outside dismisses only when that is harmless.
  const dismiss = () => {
    if (cancel) close(cancel);
    else if (buttons.length === 1) close(buttons[0]);
  };
  const blocks = dialogBlocks(dialog.message);

  return (
    <Layer onRequestClose={dismiss}>
      <Animated.View style={[styles.shade, { opacity: slide }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 8, maxHeight: height * 0.86 },
          { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
        ]}
        accessibilityViewIsModal
        testID="MarsDialog"
      >
        <View style={styles.grip} />
        <View style={styles.eyebrowRow}>
          <View style={styles.tick} />
          <Text style={styles.eyebrow}>MCR / NOTICE</Text>
        </View>
        {dialog.title ? (
          <Text style={styles.title} accessibilityRole="header">
            {dialog.title}
          </Text>
        ) : null}
        {blocks.length ? (
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {blocks.map((block, index) =>
              block.number ? (
                <View key={index} style={styles.step}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{block.number}</Text>
                  </View>
                  <Text style={[styles.message, styles.stepText]}>{block.text}</Text>
                </View>
              ) : (
                <Text key={index} style={styles.message} selectable>
                  {block.text}
                </Text>
              ),
            )}
          </ScrollView>
        ) : null}
        <View style={styles.actions}>
          {buttons.map((button, index) => (
            <TouchableOpacity
              key={index}
              accessibilityRole="button"
              onPress={() => close(button)}
              style={[styles.button, kinds[button.kind].box]}
              testID={`MarsDialogButton-${index}`}
            >
              <Text style={[styles.buttonText, kinds[button.kind].text]}>{button.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Layer>
  );
}

const styles = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,5,6,0.72)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: c.border,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  grip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 18 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tick: { width: 3, height: 13, backgroundColor: c.orange, marginRight: 9 },
  eyebrow: { color: c.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2 },
  title: { color: c.text, fontFamily: 'ChakraPetch-Bold', fontSize: 23, lineHeight: 29 },
  body: { marginTop: 12, flexGrow: 0 },
  bodyContent: { paddingBottom: 4 },
  message: { color: c.muted, fontSize: 16, lineHeight: 23, marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepText: { flex: 1, color: c.text },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  badgeText: { color: c.orange, fontFamily: 'ChakraPetch-SemiBold', fontSize: 12 },
  actions: { marginTop: 10 },
  button: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  buttonText: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  primary: { backgroundColor: c.orange },
  primaryText: { color: '#14100C' },
  quiet: { borderWidth: 1, borderColor: c.border },
  quietText: { color: c.text },
  danger: { borderWidth: 1, borderColor: c.danger },
  dangerText: { color: c.danger },
});

const kinds = {
  primary: { box: styles.primary, text: styles.primaryText },
  quiet: { box: styles.quiet, text: styles.quietText },
  danger: { box: styles.danger, text: styles.dangerText },
};
