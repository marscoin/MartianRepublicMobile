import { marsAlert } from '../../components/MarsDialog';
import React, { useContext, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { TOTAL_STEPS } from '../../blue_modules/onboarding';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { OnboardingFrame, Paragraph, styles } from './OnboardingUi';

const NEXT = [
  { title: 'Meet the community', text: 'Read the short community terms and see who is already here.' },
  {
    title: 'Introduce yourself',
    text: 'A name, a photo and a few words, published as your public record. It is free to start, and the Republic covers the network fee with a welcome gift when available.',
  },
  { title: 'Be recognised, then vote', text: 'Citizens endorse real people. Citizens decide what the Republic does.' },
];

// Steps six and seven: the wallet as identity, then what lies ahead.
export default function OnboardingReady() {
  const navigation = useNavigation();
  const { walletID, page = 0 } = useRoute().params;
  const { wallets, saveToDisk } = useContext(BlueStorageContext);
  const wallet = wallets.find(candidate => candidate.getID() === walletID);
  const [entering, setEntering] = useState(false);
  const busy = useRef(false);

  if (!wallet) {
    return (
      <OnboardingFrame
        art="ready"
        step={6}
        total={TOTAL_STEPS}
        title="Let us start again."
        action="Back"
        onAction={() => navigation.popToTop()}
      >
        <Paragraph>Your wallet could not be found on this device.</Paragraph>
      </OnboardingFrame>
    );
  }

  if (page === 0) {
    const address = wallet._getExternalAddressByIndex(0);
    return (
      <OnboardingFrame
        testID="OnboardingReady"
        art="ready"
        step={6}
        total={TOTAL_STEPS}
        eyebrow="REGISTERED"
        title="Your papers are in order."
        action="Continue"
        onAction={() => navigation.push('OnboardingReady', { walletID, page: 1 })}
      >
        <Paragraph>
          This wallet is also your identity. The Republic will know you by the address below, and so will anyone who sends you Marscoin.
        </Paragraph>
        <View style={styles.card}>
          <Text style={styles.note}>YOUR CIVIC ADDRESS</Text>
          <Text style={styles.mono} selectable testID="OnboardingAddress">
            {address}
          </Text>
        </View>
        <Text style={styles.note}>It is public and safe to share. Your twelve words are not.</Text>
      </OnboardingFrame>
    );
  }

  const enter = async () => {
    if (busy.current) return;
    busy.current = true;
    setEntering(true);
    try {
      // Only now does this become the civic wallet: the words have been written
      // down and checked.
      wallet.setCivic();
      await saveToDisk();
      navigation.navigate('BottomTabs');
    } catch {
      marsAlert('Not saved yet', 'Your wallet is safe, but this last step could not be saved. Please try again.');
    } finally {
      busy.current = false;
      setEntering(false);
    }
  };

  return (
    <OnboardingFrame
      testID="OnboardingNext"
      art="next"
      step={7}
      total={TOTAL_STEPS}
      eyebrow="WHAT COMES NEXT"
      title="Three things, in your own time."
      action={entering ? 'Opening…' : 'Enter the Republic'}
      actionDisabled={entering}
      onAction={enter}
      onBack={() => navigation.goBack()}
    >
      {NEXT.map((item, index) => (
        <View key={item.title} style={styles.card}>
          <Text style={styles.cardTitle}>
            {index + 1}. {item.title}
          </Text>
          <Text style={styles.note}>{item.text}</Text>
        </View>
      ))}
      <Text style={styles.note}>
        Your home screen will keep track of these for you. None of it is required: your wallet works on its own, and you can join the
        Republic later.
      </Text>
    </OnboardingFrame>
  );
}
