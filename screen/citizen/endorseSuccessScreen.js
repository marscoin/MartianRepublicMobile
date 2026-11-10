import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CivicBrand, CivicButton, civicColors, civicStyles } from '../../components/CivicUi';

export default function EndorseSuccessScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  return (
    <SafeAreaView style={civicStyles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[civicStyles.content, styles.content]}>
        <CivicBrand subtitle="CITIZENSHIP / ENDORSEMENT" />
        <Text style={civicStyles.title}>Endorsement submitted.</Text>
        <Text style={civicStyles.body}>
          Thank you for helping build the Republic. Your endorsement is awaiting blockchain confirmation and will appear on the recipient’s
          profile after it is processed.
        </Text>
        {params?.txid && (
          <View style={styles.receipt}>
            <Text style={civicStyles.eyebrow}>TRANSACTION</Text>
            <Text selectable style={styles.txid}>
              {params.txid}
            </Text>
          </View>
        )}
        <CivicButton title="Back to the community" onPress={() => navigation.navigate('CitizenScreen')} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: 28, paddingBottom: 40 },
  receipt: {
    backgroundColor: civicColors.panel,
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  txid: { color: civicColors.text, fontSize: 14, lineHeight: 22 },
});
