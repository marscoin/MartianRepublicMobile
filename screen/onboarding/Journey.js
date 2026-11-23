import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { journeyProgress } from '../../blue_modules/onboarding';
import { civicColors as c } from '../../components/CivicUi';
import MarsFrame, { MarsButton } from '../../components/MarsFrame';

// The newcomer's path, shown on the home screen until it is complete: what is
// done, the one thing to do now, and what lies ahead.
// `onSkip`, when given, offers to put the path away and just use the wallet.
export default function Journey({ steps, onOpen, onSkip }) {
  const progress = journeyProgress(steps);
  const [showAll, setShowAll] = useState(false);
  const current = steps.find(step => step.state === 'current');
  const visible = showAll ? steps : steps.filter(step => step.state !== 'ahead');
  return (
    <MarsFrame tab style={styles.box} testID="Journey">
      <View style={styles.head}>
        <Text style={styles.label}>YOUR PATH</Text>
        <Text style={styles.count}>
          {progress.done} of {progress.total}
        </Text>
      </View>
      <View style={styles.bar}>
        {steps.map(step => (
          <View
            key={step.key}
            style={[styles.segment, step.done && styles.segmentDone, step.state === 'current' && styles.segmentCurrent]}
          />
        ))}
      </View>
      {visible.map(step => (
        <View key={step.key} style={styles.step}>
          <MarsFrame
            cut={5}
            fill={step.done ? c.ok : 'transparent'}
            border={step.done ? c.ok : step.state === 'current' ? c.orange : c.border}
            borderWidth={step.state === 'current' ? 2 : 1}
            style={styles.dot}
          >
            {step.done ? <Icon name="check" type="feather" size={13} color={c.background} /> : null}
          </MarsFrame>
          <View style={styles.text}>
            <Text style={[styles.title, step.state === 'ahead' && styles.ahead]}>{step.title}</Text>
            {step.state === 'current' ? <Text style={styles.detail}>{step.detail}</Text> : null}
          </View>
        </View>
      ))}
      {current ? <MarsButton title={current.action} icon="arrow-right" onPress={() => onOpen(current)} testID="JourneyAction" /> : null}
      {steps.some(step => step.state === 'ahead') ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => setShowAll(!showAll)} style={styles.more}>
          <Text style={styles.moreText}>{showAll ? 'Show less' : 'See what comes after'}</Text>
        </TouchableOpacity>
      ) : null}
      {onSkip ? (
        <TouchableOpacity accessibilityRole="button" onPress={onSkip} style={styles.skip} testID="JourneySkip">
          <Text style={styles.skipText}>Just use the wallet for now</Text>
        </TouchableOpacity>
      ) : null}
    </MarsFrame>
  );
}

// What stands in for the path after "Just use the wallet for now": one quiet
// row that brings it back.
export function JoinInvite({ onJoin }) {
  return (
    <MarsFrame
      accessibilityRole="button"
      accessibilityLabel="Join the Republic. Introduce yourself when you are ready. Your wallet works either way."
      onPress={onJoin}
      style={styles.invite}
      testID="JoinInvite"
    >
      <View style={styles.text}>
        <Text style={styles.title}>Join the Republic</Text>
        <Text style={styles.inviteNote}>Introduce yourself when you are ready. Your wallet works either way.</Text>
      </View>
      <Icon name="arrow-right" type="feather" size={20} color={c.orange} />
    </MarsFrame>
  );
}

const styles = StyleSheet.create({
  box: { padding: 20, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 12, letterSpacing: 2, color: c.muted },
  count: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 13, color: c.muted },
  bar: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, backgroundColor: '#FFFFFF22' },
  segmentDone: { backgroundColor: c.ok },
  segmentCurrent: { backgroundColor: c.orange },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  text: { flex: 1, gap: 4 },
  title: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 17, color: c.text },
  ahead: { color: c.muted },
  detail: { fontSize: 15, lineHeight: 22, color: c.muted },
  more: { minHeight: 36, justifyContent: 'center', alignItems: 'center' },
  moreText: { fontFamily: 'ChakraPetch-Medium', fontSize: 14, color: c.muted },
  skip: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#FFFFFF14' },
  skipText: { fontFamily: 'ChakraPetch-Medium', fontSize: 14, color: c.muted },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  inviteNote: { fontSize: 14, lineHeight: 20, color: c.muted },
});
