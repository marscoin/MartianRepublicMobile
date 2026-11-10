import React, { useLayoutEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { CivicBrand, CivicButton, civicColors as c, civicStyles as ui } from '../../components/CivicUi';

const AreYouCitizenScreen = () => {
  const navigation = useNavigation();
  const compact = useWindowDimensions().height < 760;
  useLayoutEffect(() => navigation.setOptions({ statusBarStyle: 'light' }), [navigation]);
  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}>
        <CivicBrand />
        <View style={[styles.hero, compact && styles.compactHero]}>
          <Image source={require('../../img/mars1.png')} style={styles.planet} />
          <LinearGradient colors={['#080A0C00', '#080A0C']} style={StyleSheet.absoluteFill} />
          <View style={styles.heroCaption}>
            <View style={styles.line} />
            <Text style={styles.caption}>A NEW WORLD. A SHARED FUTURE.</Text>
          </View>
        </View>
        <Text style={ui.title}>Your place in{'\n'}the Republic.</Text>
        <Text style={styles.intro}>Your civic wallet connects your Marscoin and your public identity.</Text>
        <View style={styles.choices}>
          <CivicButton
            title="I am new here"
            icon="arrow-right"
            onPress={() => navigation.navigate('OnboardingIntro', { page: 0 })}
            testID="CreateCivicWallet"
          />
          <Text style={styles.hint}>We will set you up step by step. About three minutes.</Text>
          <View style={styles.divider} />
          <Text style={ui.eyebrow}>ALREADY HAVE A CIVIC WALLET?</Text>
          <CivicButton
            title="Restore with my twelve words"
            icon="rotate-ccw"
            secondary
            onPress={() => navigation.navigate('ImportCivicWalletScreen')}
            testID="RestoreCivicWallet"
          />
        </View>
        <Text style={styles.footer}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  hero: {
    height: 205,
    marginTop: 22,
    marginHorizontal: -24,
    overflow: 'hidden',
  },
  compactHero: { height: 112 },
  planet: {
    width: '100%',
    height: 310,
    position: 'absolute',
    top: -35,
    resizeMode: 'cover',
    opacity: 0.85,
  },
  heroCaption: {
    position: 'absolute',
    bottom: 22,
    left: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  line: { width: 24, height: 1, backgroundColor: c.orange },
  caption: {
    fontFamily: 'ChakraPetch-Medium',
    color: c.orange,
    letterSpacing: 1.3,
    fontSize: 10,
  },
  intro: { ...ui.body, marginTop: 14, maxWidth: 360 },
  choices: { marginTop: 32, gap: 12 },
  hint: { fontSize: 13, lineHeight: 19, color: c.muted, textAlign: 'center' },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 8 },
  footer: {
    ...ui.eyebrow,
    fontSize: 9,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 8,
  },
});

export default AreYouCitizenScreen;
