import React, { useContext, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { TOTAL_STEPS, backupQuiz, ordinal } from '../../blue_modules/onboarding';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import usePrivacy from '../../hooks/usePrivacy';
import { OnboardingFrame, Paragraph, styles } from './OnboardingUi';

// Step five: three of the words, to be sure the paper copy exists and is right.
export default function OnboardingCheck() {
  const navigation = useNavigation();
  const { walletID } = useRoute().params;
  const { wallets } = useContext(BlueStorageContext);
  const wallet = wallets.find(candidate => candidate.getID() === walletID);
  const { enableBlur, disableBlur } = usePrivacy();
  React.useEffect(() => {
    enableBlur();
    return () => disableBlur();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quiz = useMemo(
    () => (wallet ? backupQuiz(wallet.getSecret().trim().split(/\s+/), n => Math.floor(Math.random() * n)) : []),
    // One set of questions per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [walletID],
  );
  const [round, setRound] = useState(0);
  const [wrong, setWrong] = useState([]);
  const [right, setRight] = useState(null);

  if (!wallet || !quiz.length) {
    return (
      <OnboardingFrame
        art="check"
        step={5}
        total={TOTAL_STEPS}
        title="Let us start again."
        action="Back"
        onAction={() => navigation.goBack()}
      >
        <Paragraph>Your wallet could not be found on this device.</Paragraph>
      </OnboardingFrame>
    );
  }

  const current = quiz[round];
  const choose = option => {
    if (right) return;
    if (option !== current.answer) {
      setWrong(previous => [...previous, option]);
      return;
    }
    setRight(option);
    // A moment to see the confirmation before moving on.
    setTimeout(() => {
      setRight(null);
      setWrong([]);
      if (round + 1 < quiz.length) setRound(round + 1);
      else navigation.navigate('OnboardingReady', { walletID, page: 0 });
    }, 450);
  };

  return (
    <OnboardingFrame
      testID="OnboardingCheck"
      art="check"
      step={5}
      total={TOTAL_STEPS}
      eyebrow={`CHECK ${round + 1} OF ${quiz.length}`}
      title={`Which is your ${ordinal(current.number)} word?`}
      secondary="Show my words again"
      onSecondary={() => navigation.goBack()}
      onBack={() => navigation.goBack()}
    >
      <Paragraph>Look at your paper, not at your memory.</Paragraph>
      <View style={styles.options}>
        {current.options.map(option => {
          const isWrong = wrong.includes(option);
          return (
            <TouchableOpacity
              key={option}
              accessibilityRole="button"
              accessibilityState={{ disabled: isWrong }}
              disabled={isWrong}
              onPress={() => choose(option)}
              testID={option === current.answer ? 'OnboardingCheckAnswer' : undefined}
              style={[styles.option, isWrong && styles.optionWrong, right === option && styles.optionRight]}
            >
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {wrong.length ? <Text style={styles.note}>Not that one. Check the number on your paper, or look at the words again.</Text> : null}
    </OnboardingFrame>
  );
}
