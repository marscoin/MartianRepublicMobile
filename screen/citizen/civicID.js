import React, { useLayoutEffect, useState } from 'react';
import { Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCodeComponent from '../../components/QRCodeComponent';
import { CivicBack, CivicBrand, civicColors as c, civicStyles as ui } from '../../components/CivicUi';

const CivicIDScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  useLayoutEffect(() => navigation.setOptions({ statusBarStyle: 'light' }), [navigation]);
  const { params } = useRoute();
  const citizen = params?.user?.citizen ?? {};
  const [imageError, setImageError] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [cardSpace, setCardSpace] = useState({ width: 0, height: 0 });
  const address = citizen.public_address || '';
  const name = [citizen.firstname, citizen.lastname].filter(Boolean).join(' ');
  const date = citizen.created_at ? new Date(citizen.created_at) : null;
  const issued =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null;
  const portrait = !citizen.avatar_link || imageError ? require('../../img/genericprofile.png') : { uri: citizen.avatar_link };
  const rotated = cardSpace.height > cardSpace.width;
  const cardScale = Math.min((rotated ? cardSpace.height : cardSpace.width) / 720, (rotated ? cardSpace.width : cardSpace.height) / 454);

  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={[ui.content, styles.content]} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <CivicBack onPress={() => navigation.goBack()} />
          <CivicBrand subtitle="CIVIC IDENTITY" />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Show horizontal Civic ID card"
          testID="ShowCivicCard"
          style={styles.cardButton}
          onPress={() => setShowCard(true)}
        >
          <Icon name="credit-card" type="feather" size={20} color={c.orange} />
          <Text style={styles.cardButtonText}>Show horizontal card</Text>
          <Icon name="maximize-2" type="feather" size={17} color={c.muted} />
        </TouchableOpacity>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeading}>
              <Text style={styles.republic}>MARTIAN{'\n'}CONGRESSIONAL REPUBLIC</Text>
              <Text style={styles.document}>CIVIC IDENTIFICATION</Text>
            </View>
            <Image source={require('../../img/marscoin.png')} style={styles.seal} accessible={false} />
          </View>
          <View style={styles.identity}>
            <Image
              source={portrait}
              onError={() => setImageError(true)}
              style={styles.photo}
              accessibilityLabel="Citizen portrait"
            />
            <View style={styles.nameBlock}>
              <Text style={styles.label}>CITIZEN</Text>
              <Text style={styles.name}>{name || 'Martian citizen'}</Text>
            </View>
          </View>
          <View style={styles.rule} />
          <View style={styles.qrSection}>
            {address ? (
              <QRCodeComponent value={address} size={132} isLogoRendered={false} isMenuAvailable={false} ecl="M" />
            ) : (
              <Text style={styles.address}>Public address unavailable</Text>
            )}
            <Text style={styles.qrCaption}>PUBLIC CIVIC IDENTITY</Text>
          </View>
          <View style={styles.addressBlock}>
            <Text style={styles.label}>MARSCOIN ADDRESS</Text>
            <Text selectable style={styles.address}>
              {address || '—'}
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.footerLabel}>MCR / CIVIC REGISTRY</Text>
            {issued && <Text style={styles.date}>Registered {issued}</Text>}
          </View>
        </View>
        <Text style={styles.caption}>Your public identity in the Republic.</Text>
      </ScrollView>
      <Modal visible={showCard} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setShowCard(false)}>
        <View style={[styles.presentation, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.presentationTop}>
            <CivicBrand subtitle="CIVIC IDENTITY" />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close horizontal card"
              testID="CloseCivicCard"
              style={ui.back}
              onPress={() => setShowCard(false)}
            >
              <Icon name="x" type="feather" size={22} color={c.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.cardSpace} onLayout={event => setCardSpace(event.nativeEvent.layout)}>
            {cardScale > 0 && (
              <View
                style={[
                  styles.card,
                  styles.horizontalCard,
                  {
                    left: (cardSpace.width - 720) / 2,
                    top: (cardSpace.height - 454) / 2,
                    transform: [{ rotate: rotated ? '90deg' : '0deg' }, { scale: cardScale }],
                  },
                ]}
              >
                <View style={styles.horizontalHeader}>
                  <View style={styles.cardHeading}>
                    <Text maxFontSizeMultiplier={1.1} style={styles.horizontalRepublic}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
                    <Text maxFontSizeMultiplier={1.1} style={styles.horizontalDocument}>CIVIC IDENTIFICATION</Text>
                  </View>
                  <Image source={require('../../img/marscoin.png')} style={styles.horizontalSeal} accessible={false} />
                </View>
                <View style={styles.horizontalIdentity}>
                  <Image source={portrait} onError={() => setImageError(true)} style={styles.horizontalPhoto} accessibilityLabel="Citizen portrait" />
                  <View style={styles.horizontalNameBlock}>
                    <Text maxFontSizeMultiplier={1.1} style={styles.horizontalLabel}>CITIZEN</Text>
                    <Text maxFontSizeMultiplier={1.1} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.horizontalName}>
                      {name || 'Martian citizen'}
                    </Text>
                    {issued && <Text maxFontSizeMultiplier={1.1} style={styles.horizontalDate}>Registered {issued}</Text>}
                  </View>
                  <View style={styles.horizontalQr}>
                    {address ? <QRCodeComponent value={address} size={156} isLogoRendered={false} isMenuAvailable={false} ecl="M" /> : null}
                    <Text maxFontSizeMultiplier={1.1} style={styles.horizontalQrCaption}>PUBLIC IDENTITY</Text>
                  </View>
                </View>
                <View style={styles.horizontalAddressBlock}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.horizontalLabel}>MARSCOIN ADDRESS</Text>
                  <Text maxFontSizeMultiplier={1.1} numberOfLines={1} adjustsFontSizeToFit style={styles.horizontalAddress}>{address || 'Public address unavailable'}</Text>
                </View>
                <View style={styles.horizontalFooter}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.horizontalFooterLabel}>MCR / CIVIC REGISTRY</Text>
                  <Text maxFontSizeMultiplier={1.1} style={styles.horizontalFooterLabel}>MARS · SOL SYSTEM</Text>
                </View>
              </View>
            )}
          </View>
          <Text style={styles.presentationCaption}>{rotated ? 'Turn your phone sideways to present your ID.' : 'Your public identity in the Republic.'}</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: { paddingTop: 16 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 16,
  },
  cardButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: c.panel,
  },
  cardButtonText: { color: c.text, flex: 1, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15 },
  presentation: { flex: 1, backgroundColor: c.background },
  presentationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  cardSpace: { flex: 1, marginHorizontal: 22, marginVertical: 12 },
  horizontalCard: { position: 'absolute', width: 720, height: 454, borderRadius: 26 },
  horizontalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, height: 104, backgroundColor: '#C39669', gap: 16 },
  horizontalRepublic: { fontFamily: 'ChakraPetch-Bold', fontSize: 21, color: '#23190F', letterSpacing: 0.6 },
  horizontalDocument: { fontFamily: 'ChakraPetch-Medium', fontSize: 13, letterSpacing: 2.8, color: '#483422', marginTop: 9 },
  horizontalSeal: { width: 56, height: 56, resizeMode: 'contain' },
  horizontalIdentity: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, height: 220, gap: 22 },
  horizontalPhoto: { width: 124, height: 160, borderRadius: 10, backgroundColor: '#C39669' },
  horizontalNameBlock: { flex: 1, minWidth: 0 },
  horizontalLabel: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 12, letterSpacing: 2, color: '#56412C' },
  horizontalName: { fontFamily: 'ChakraPetch-Bold', fontSize: 34, lineHeight: 39, marginTop: 9, color: '#23190F' },
  horizontalDate: { fontFamily: 'ChakraPetch-Medium', fontSize: 13, marginTop: 16, color: '#56412C' },
  horizontalQr: { alignItems: 'center', gap: 12 },
  horizontalQrCaption: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 1.6, color: '#56412C' },
  horizontalAddressBlock: { marginHorizontal: 28, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, gap: 7, backgroundColor: '#D4B48D' },
  horizontalAddress: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 18, color: '#23190F' },
  horizontalFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 17 },
  horizontalFooterLabel: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 10, letterSpacing: 2, color: '#56412C' },
  presentationCaption: { color: c.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 18 },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#AD7850',
    overflow: 'hidden',
    backgroundColor: '#E0C29A',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#C39669',
    borderBottomWidth: 1,
    borderBottomColor: '#B08357',
    gap: 12,
  },
  cardHeading: { flex: 1 },
  republic: {
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 13,
    lineHeight: 18,
    color: '#23190F',
    letterSpacing: 0.7,
  },
  document: {
    fontFamily: 'ChakraPetch-Medium',
    fontSize: 10,
    color: '#483422',
    letterSpacing: 1.3,
    marginTop: 10,
  },
  seal: { width: 44, height: 44, resizeMode: 'contain' },
  identity: {
    flexDirection: 'row',
    padding: 16,
    gap: 18,
    alignItems: 'center',
  },
  photo: {
    width: 72,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#C39669',
  },
  nameBlock: { flex: 1, minWidth: 0 },
  label: {
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#56412C',
  },
  name: {
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 26,
    lineHeight: 30,
    color: '#23190F',
    marginTop: 7,
  },
  rule: { marginHorizontal: 22, height: 1, backgroundColor: '#BDA07D' },
  qrSection: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
  },
  qrCaption: {
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#56412C',
  },
  addressBlock: {
    marginHorizontal: 22,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#D4B48D',
    gap: 8,
  },
  address: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#23190F',
    fontSize: 13,
    lineHeight: 20,
  },
  cardFooter: { padding: 14, gap: 8 },
  footerLabel: {
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 10,
    letterSpacing: 1.3,
    color: '#56412C',
  },
  date: { fontSize: 12, color: '#56412C' },
  caption: {
    color: c.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 12,
  },
});
export default CivicIDScreen;
