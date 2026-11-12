// The welcome gift, shown full screen at the moment a newcomer is about to
// publish their introduction and the Republic offers to cover the fee. It is
// only an offer: nothing is requested until "Accept and publish" is tapped.
// While the gift is claimed and the introduction published, the same screen
// says honestly what is happening.
import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CivicButton, civicColors as c } from './CivicUi';
import { onboardingArt } from '../screen/onboarding/art';

export default function WelcomeGift({ visible, amountText, progress, canStop = false, stopping = false, onAccept, onDecline, onStop }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const artHeight = Math.round(Math.min(340, Math.max(160, height * 0.32)));
  // Two short movements: the page settles, then the gift itself arrives.
  const page = useRef(new Animated.Value(0)).current;
  const gift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    let live = true;
    let running;
    page.setValue(0);
    gift.setValue(0);
    const settle = () => {
      page.setValue(1);
      gift.setValue(1);
    };
    const play = () => {
      const ease = Easing.out(Easing.cubic);
      running = Animated.sequence([
        Animated.timing(page, { toValue: 1, duration: 420, easing: ease, useNativeDriver: true }),
        Animated.timing(gift, { toValue: 1, duration: 520, easing: ease, useNativeDriver: true }),
      ]);
      running.start();
    };
    // With Reduce Motion on, everything is simply there.
    Promise.resolve()
      .then(() => AccessibilityInfo.isReduceMotionEnabled())
      .then(reduced => live && (reduced ? settle() : play()))
      .catch(() => live && settle());
    return () => {
      live = false;
      running?.stop();
    };
  }, [visible, page, gift]);

  if (!visible) return null;
  const busy = !!progress;
  const rise = value => ({
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={busy ? undefined : onDecline}>
      <View style={styles.screen} accessibilityViewIsModal testID="WelcomeGift">
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.art, { height: artHeight, opacity: page }]}>
            <Image source={onboardingArt.ready} style={styles.image} />
            <LinearGradient colors={['#080A0C55', '#080A0C00', '#080A0C']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[styles.body, rise(page)]}>
            <View style={styles.eyebrowRow}>
              <View style={styles.mark} />
              <Text style={styles.eyebrow}>MARTIAN REPUBLIC / WELCOME GIFT</Text>
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              A welcome gift from the Republic.
            </Text>
            <Text style={styles.paragraph}>
              The Martian Republic gives every newcomer {amountText || 'a little Marscoin'}. It pays the network fee to publish your
              introduction.
            </Text>
          </Animated.View>
          <Animated.View style={[styles.body, styles.giftRow, rise(gift)]}>
            <View
              style={styles.card}
              accessible
              accessibilityLabel={`Your gift: ${amountText || 'a little Marscoin'}, sent to your civic wallet.`}
            >
              <Text style={styles.cardLabel}>YOUR GIFT</Text>
              <Text style={styles.amount} testID="WelcomeGiftAmount">
                {amountText || 'A little Marscoin'}
              </Text>
              <Text style={styles.note}>Sent to your civic wallet. One for each newcomer.</Text>
            </View>
            <Text style={styles.note}>
              Accepting publishes your introduction as your public record. If you would rather wait, nothing is requested and no Marscoin is
              sent.
            </Text>
          </Animated.View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          {busy ? (
            <View style={styles.working} accessibilityLiveRegion="polite" testID="WelcomeGiftProgress">
              <ActivityIndicator color={c.orange} />
              <Text style={styles.progress}>{progress}</Text>
              <Text style={[styles.note, styles.centered]}>This can take a few minutes. Keep the app open.</Text>
              {canStop ? (
                <CivicButton
                  title={stopping ? 'Stopping…' : 'Stop waiting'}
                  onPress={onStop}
                  disabled={stopping}
                  secondary
                  testID="WelcomeGiftStop"
                />
              ) : null}
            </View>
          ) : (
            <>
              <CivicButton title="Accept and publish" onPress={onAccept} testID="WelcomeGiftAccept" />
              <CivicButton title="Not now" onPress={onDecline} secondary testID="WelcomeGiftDecline" />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  art: { width: '100%', overflow: 'hidden', backgroundColor: '#12151A' },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  body: { paddingHorizontal: 24, marginTop: -8, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  giftRow: { marginTop: 20 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 5, height: 16, backgroundColor: c.orange },
  eyebrow: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 12, letterSpacing: 2, color: c.muted },
  title: { fontFamily: 'ChakraPetch-Bold', fontSize: 32, lineHeight: 37, color: c.text },
  paragraph: { fontSize: 17, lineHeight: 26, color: '#D5D9DE' },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#5A3A22',
    backgroundColor: '#171613',
    gap: 6,
  },
  cardLabel: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2, color: c.muted },
  amount: { fontFamily: 'ChakraPetch-Bold', fontSize: 34, lineHeight: 40, color: c.orange },
  note: { fontSize: 14, lineHeight: 21, color: c.muted },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 10,
    backgroundColor: c.background,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  centered: { textAlign: 'center' },
  working: { gap: 10, alignItems: 'stretch', paddingVertical: 6 },
  progress: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 17, lineHeight: 23, color: c.text, textAlign: 'center' },
});
