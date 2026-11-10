import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { TOTAL_STEPS } from '../../blue_modules/onboarding';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { civicColors as c } from '../../components/CivicUi';
import usePrivacy from '../../hooks/usePrivacy';
import { MarsElectrumWallet } from '../wallets/mars-wallet';
import { OnboardingFrame, Paragraph, styles } from './OnboardingUi';

export const CIVIC_LABEL = 'CIVIC WALLET';

// A wallet created by an earlier, unfinished run of the setup. Using it again
// means leaving and coming back never produces a second set of words.
export const unfinishedCivicWallet = wallets =>
  wallets.find(wallet => wallet.type === 'marscoin' && !wallet.civic && wallet.getLabel() === CIVIC_LABEL && wallet.getSecret());

// Step four: the wallet is created here, and its twelve words are shown.
export default function OnboardingWords() {
  const navigation = useNavigation();
  const { wallets, addWallet, saveToDisk } = useContext(BlueStorageContext);
  const { enableBlur, disableBlur } = usePrivacy();
  const [walletID, setWalletID] = useState(() => unfinishedCivicWallet(wallets)?.getID() || null);
  const [error, setError] = useState('');
  const creating = useRef(false);

  // Keep the words out of screenshots and the app switcher.
  useEffect(() => {
    enableBlur();
    return () => disableBlur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (creating.current) return;
    creating.current = true;
    setError('');
    try {
      const wallet = new MarsElectrumWallet();
      await wallet.generate();
      wallet.setLabel(CIVIC_LABEL);
      addWallet(wallet);
      // Stored before the words are shown: what is written down must be what was saved.
      await saveToDisk();
      setWalletID(wallet.getID());
    } catch {
      setError('Your wallet could not be saved on this device. Make sure the phone is unlocked and has free space, then try again.');
    } finally {
      creating.current = false;
    }
  };

  useEffect(() => {
    if (!walletID) create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wallet = wallets.find(candidate => candidate.getID() === walletID);
  const words = wallet ? wallet.getSecret().trim().split(/\s+/) : [];

  if (!wallet) {
    return (
      <OnboardingFrame
        testID="OnboardingWords-creating"
        art="words"
        step={4}
        total={TOTAL_STEPS}
        eyebrow="YOUR KEY"
        title={error ? 'Something got in the way.' : 'Creating your wallet…'}
        action={error ? 'Try again' : undefined}
        onAction={create}
        onBack={() => navigation.goBack()}
      >
        {error ? <Paragraph>{error}</Paragraph> : <ActivityIndicator color={c.orange} size="large" />}
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      testID="OnboardingWords"
      art="words"
      step={4}
      total={TOTAL_STEPS}
      eyebrow="YOUR KEY"
      title="Write these down."
      action="I have written them down"
      onAction={() => navigation.navigate('OnboardingCheck', { walletID })}
      onBack={() => navigation.goBack()}
    >
      <Paragraph>On paper, in this order. Take your time; we will check a few of them with you next.</Paragraph>
      <View style={styles.words} testID="OnboardingWordList">
        {words.map((word, index) => (
          <View key={`${index}-${word}`} style={styles.word}>
            <Text style={styles.wordNumber}>{index + 1}</Text>
            <Text style={styles.wordText} selectable={false}>
              {word}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>Do not photograph them or keep them in a message or a note on this phone.</Text>
    </OnboardingFrame>
  );
}
