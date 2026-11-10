import React, { useLayoutEffect, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from 'react-native-elements';
import IdleTimerManager from 'react-native-idle-timer';
import startImport from '../class/mars-wallet-import';
import { BlueStorageContext } from '../blue_modules/storage-context';
import prompt from '../helpers/prompt';
import usePrivacy from '../hooks/usePrivacy';
import { CivicBack, CivicBrand, CivicButton, civicColors as c, civicStyles as ui } from './CivicUi';

export default function MarsWalletRecovery({ civic = false }) {
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ statusBarStyle: 'light' }), [navigation]);
  const { params = {} } = useRoute();
  const { addAndSaveCivicWallet, addAndSaveWallet } = useContext(BlueStorageContext);
  const [phase, setPhase] = useState('connecting');
  const [failure, setFailure] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const recoveredWallet = useRef();
  const { enableBlur, disableBlur } = usePrivacy();
  useEffect(() => {
    enableBlur();
    return disableBlur;
  }, [enableBlur, disableBlur]);

  useEffect(() => {
    let active = true;
    let task;
    let saving = false;
    setFailure(null);
    IdleTimerManager.setIdleTimerDisabled(true);
    const run = async () => {
      let wallet = recoveredWallet.current;
      if (!wallet) {
        setPhase('connecting');
        task = startImport(
          params.importText,
          params.askPassphrase,
          false,
          () => {},
          () => {},
          async (title, subtitle) => {
            try {
              return await prompt(title, subtitle);
            } catch (error) {
              if (active && error.message === 'Cancel Pressed') {
                active = false;
                navigation.goBack();
              }
              throw error;
            }
          },
        );
        const result = await task.promise;
        if (!active || result.cancelled) return;
        wallet = result.wallets[0];
        recoveredWallet.current = wallet;
      }
      if (!active) return;
      saving = true;
      setPhase('saving');
      const saved = await (civic ? addAndSaveCivicWallet(wallet) : addAndSaveWallet(wallet));
      if (!active) return;
      if (saved) {
        setPhase('complete');
        navigation.navigate('BottomTabs');
      } else {
        setFailure({
          title: 'Wallet already restored',
          message: 'This wallet is already on this device.',
          duplicate: true,
        });
      }
    };
    run()
      .catch(error => {
        if (!active) return;
        const invalidInput = error.name === 'RecoveryInputError';
        setFailure({
          title: saving ? 'Could not save your wallet' : invalidInput ? 'Check your recovery phrase' : 'Could not connect to Marscoin',
          message:
            saving || invalidInput
              ? error.message
              : 'Your recovery phrase is valid. Check your internet connection and try again. Your wallet has not been saved yet.',
          input: invalidInput,
        });
      })
      .finally(() => {
        if (active) IdleTimerManager.setIdleTimerDisabled(false);
      });
    return () => {
      active = false;
      task?.stop();
      IdleTimerManager.setIdleTimerDisabled(false);
    };
    // Retry uses the already derived wallet after a save failure; never asks for its passphrase twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const steps = ['Check recovery phrase', 'Connect to Marscoin', 'Save on this device'];
  const current = phase === 'saving' ? 2 : phase === 'complete' ? 3 : 1;
  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={ui.content}>
        <View style={styles.top}>
          <CivicBack onPress={() => navigation.goBack()} />
          <CivicBrand subtitle="WALLET RECOVERY" />
        </View>
        <View style={styles.symbol}>
          <Icon name={failure ? 'alert-circle' : 'shield'} type="feather" color={c.orange} size={36} />
        </View>
        <Text style={ui.title}>
          {failure ? failure.title : civic ? 'Restoring your\ncivic wallet.' : 'Restoring your\nMarscoin wallet.'}
        </Text>
        <Text style={styles.intro}>
          {failure ? failure.message : 'Your identity starts with your keys. We’re getting your wallet ready on this device.'}
        </Text>
        {!failure && (
          <View style={styles.steps}>
            {steps.map((label, index) => (
              <View key={label} style={styles.step}>
                {index < current ? (
                  <Icon name="check-circle" type="feather" size={22} color={c.orange} />
                ) : index === current ? (
                  <ActivityIndicator color={c.orange} style={styles.spinner} />
                ) : (
                  <View style={styles.pending} />
                )}
                <Text style={[styles.stepText, index > current && styles.pendingText]}>{label}</Text>
              </View>
            ))}
          </View>
        )}
        {failure && (
          <View style={styles.actions}>
            {failure.duplicate ? (
              <CivicButton title="Open wallets" onPress={() => navigation.navigate('BottomTabs')} />
            ) : (
              !failure.input && (
                <CivicButton
                  title={recoveredWallet.current ? 'Try saving again' : 'Try again'}
                  icon="rotate-ccw"
                  onPress={() => setAttempt(value => value + 1)}
                />
              )
            )}
            <CivicButton title="Back to recovery phrase" secondary onPress={() => navigation.goBack()} />
          </View>
        )}
        <Text style={styles.footer}>Your recovery phrase stays on this device.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 44,
  },
  symbol: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#2A1C13',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  intro: { ...ui.body, marginTop: 16 },
  steps: {
    backgroundColor: c.panel,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 18,
    padding: 22,
    gap: 28,
    marginTop: 32,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepText: {
    fontFamily: 'ChakraPetch-Medium',
    fontSize: 16,
    color: c.text,
    flex: 1,
  },
  pendingText: { color: c.muted },
  pending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: c.border,
  },
  spinner: { width: 22, height: 22 },
  actions: { gap: 12, marginTop: 28 },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: c.muted,
    textAlign: 'center',
    marginTop: 28,
  },
});
