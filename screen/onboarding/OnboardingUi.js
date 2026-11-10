import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CivicBack, CivicButton, civicColors as c } from '../../components/CivicUi';
import { onboardingArt } from './art';

// One step of the newcomer's setup: artwork, a short heading, a few lines, and
// a single thing to do next.
export function OnboardingFrame({
  art,
  step,
  total,
  eyebrow,
  title,
  children,
  action,
  onAction,
  actionDisabled,
  secondary,
  onSecondary,
  onBack,
  testID,
}) {
  const { height } = useWindowDimensions();
  const artHeight = Math.round(Math.min(360, Math.max(170, height * 0.34)));
  return (
    <View style={styles.screen} testID={testID}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.art, { height: artHeight }]}>
          {art ? <Image source={onboardingArt[art]} style={styles.image} /> : null}
          <LinearGradient colors={['#080A0C55', '#080A0C00', '#080A0C']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.body}>
          {eyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.mark} />
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {children}
        </View>
      </ScrollView>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          {onBack ? <CivicBack onPress={onBack} /> : <View style={styles.backSpace} />}
          <View
            style={styles.progress}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${step} of ${total}`}
            accessibilityValue={{ min: 0, max: total, now: step }}
          >
            {Array.from({ length: total }, (_, index) => (
              <View key={index} style={[styles.segment, index < step && styles.segmentOn]} />
            ))}
          </View>
          <View style={styles.backSpace} />
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.footer}>
        {action ? <CivicButton title={action} onPress={onAction} disabled={actionDisabled} testID="OnboardingAction" /> : null}
        {secondary ? <CivicButton title={secondary} onPress={onSecondary} secondary testID="OnboardingSecondary" /> : null}
      </SafeAreaView>
    </View>
  );
}

export function Paragraph({ children }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export function Rule({ number, children }) {
  return (
    <View style={styles.rule}>
      <Text style={styles.ruleNumber}>{number}</Text>
      <Text style={styles.ruleText}>{children}</Text>
    </View>
  );
}

/* eslint-disable react-native/no-unused-styles */
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  art: { width: '100%', overflow: 'hidden', backgroundColor: '#12151A' },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  backSpace: { width: 44, height: 44 },
  progress: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF33' },
  segmentOn: { backgroundColor: c.orange },
  body: { paddingHorizontal: 24, marginTop: -8, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 5, height: 16, backgroundColor: c.orange },
  eyebrow: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 12, letterSpacing: 2, color: c.muted },
  title: { fontFamily: 'ChakraPetch-Bold', fontSize: 32, lineHeight: 37, color: c.text },
  paragraph: { fontSize: 17, lineHeight: 26, color: '#D5D9DE' },
  rule: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingVertical: 2 },
  ruleNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.orange,
    color: c.orange,
    textAlign: 'center',
    lineHeight: 26,
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 14,
  },
  ruleText: { flex: 1, fontSize: 16, lineHeight: 24, color: c.text },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: c.background,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  note: { fontSize: 14, lineHeight: 21, color: c.muted },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  word: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.panel,
  },
  wordNumber: { width: 22, color: c.muted, fontFamily: 'ChakraPetch-Medium', fontSize: 14, textAlign: 'right' },
  wordText: { color: c.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 18 },
  options: { gap: 10 },
  option: {
    minHeight: 56,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.panel,
    justifyContent: 'center',
  },
  optionWrong: { borderColor: '#754638', opacity: 0.55 },
  optionRight: { borderColor: '#8FCEAB', backgroundColor: '#16231C' },
  optionText: { color: c.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 19 },
  card: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.panel, gap: 6 },
  cardTitle: { color: c.text, fontFamily: 'ChakraPetch-Bold', fontSize: 18 },
  mono: { color: c.text, fontSize: 14, lineHeight: 20 },
});
