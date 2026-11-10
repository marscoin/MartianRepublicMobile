import React from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { INTRO_PAGES, TOTAL_STEPS } from '../../blue_modules/onboarding';
import { OnboardingFrame, Paragraph, Rule } from './OnboardingUi';

// The three introductory steps. Each is its own screen in the stack, so the
// back gesture and button walk through them naturally.
export default function OnboardingIntro() {
  const navigation = useNavigation();
  const index = Math.min(Math.max(useRoute().params?.page || 0, 0), INTRO_PAGES.length - 1);
  const page = INTRO_PAGES[index];
  const next = () =>
    index + 1 < INTRO_PAGES.length ? navigation.push('OnboardingIntro', { page: index + 1 }) : navigation.navigate('OnboardingWords');
  return (
    <OnboardingFrame
      testID={`OnboardingIntro-${page.key}`}
      art={page.art}
      step={index + 1}
      total={TOTAL_STEPS}
      eyebrow={page.eyebrow}
      title={page.title}
      action={page.action}
      onAction={next}
      onBack={() => navigation.goBack()}
    >
      {page.body.map(text => (
        <Paragraph key={text}>{text}</Paragraph>
      ))}
      {page.rules ? (
        <View>
          {page.rules.map((rule, number) => (
            <Rule key={rule} number={number + 1}>
              {rule}
            </Rule>
          ))}
        </View>
      ) : null}
    </OnboardingFrame>
  );
}
