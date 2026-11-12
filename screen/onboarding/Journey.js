import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { journeyProgress } from '../../blue_modules/onboarding';
import { civicColors as c } from '../../components/CivicUi';

// The newcomer's path, shown on the home screen until it is complete: what is
// done, the one thing to do now, and what lies ahead.
// `onSkip`, when given, offers to put the path away and just use the wallet.
export default function Journey({ steps, onOpen, onSkip }) {
  const progress = journeyProgress(steps);
  const [showAll, setShowAll] = useState(false);
  const current = steps.find(step => step.state === 'current');
  const visible = showAll ? steps : steps.filter(step => step.state !== 'ahead');
  return (
    <View style={styles.box} testID="Journey">
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
          <View style={[styles.dot, step.done && styles.dotDone, step.state === 'current' && styles.dotCurrent]}>
            {step.done ? <Icon name="check" type="feather" size={13} color={c.background} /> : null}
          </View>
          <View style={styles.text}>
            <Text style={[styles.title, step.state === 'ahead' && styles.ahead]}>{step.title}</Text>
            {step.state === 'current' ? <Text style={styles.detail}>{step.detail}</Text> : null}
          </View>
        </View>
      ))}
      {current ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => onOpen(current)} style={styles.action} testID="JourneyAction">
          <Text style={styles.actionText}>{current.action}</Text>
          <Icon name="arrow-right" type="feather" size={18} color={c.background} />
        </TouchableOpacity>
      ) : null}
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
    </View>
  );
}

// What stands in for the path after "Just use the wallet for now": one quiet
// row that brings it back.
export function JoinInvite({ onJoin }) {
  return (
    <TouchableOpacity
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: { padding: 20, borderRadius: 16, backgroundColor: '#171613', borderLeftWidth: 3, borderLeftColor: c.orange, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 12, letterSpacing: 2, color: c.muted },
  count: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 13, color: c.muted },
  bar: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF22' },
  segmentDone: { backgroundColor: '#8FCEAB' },
  segmentCurrent: { backgroundColor: c.orange },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dotDone: { backgroundColor: '#8FCEAB', borderColor: '#8FCEAB' },
  dotCurrent: { borderColor: c.orange, borderWidth: 2 },
  text: { flex: 1, gap: 4 },
  title: { fontFamily: 'ChakraPetch-SemiBold', fontSize: 17, color: c.text },
  ahead: { color: c.muted },
  detail: { fontSize: 15, lineHeight: 22, color: c.muted },
  action: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: c.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionText: { fontFamily: 'ChakraPetch-Bold', fontSize: 16, color: c.background },
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.panel,
  },
  inviteNote: { fontSize: 14, lineHeight: 20, color: c.muted },
});
