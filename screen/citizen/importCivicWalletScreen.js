import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from 'react-native-elements';
import { RESULTS } from 'react-native-permissions';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { validateMarsRecoveryInput } from '../../blue_modules/mars-recovery-input';
import { CivicBack, CivicBrand, CivicButton, civicColors as c, civicStyles as ui } from '../../components/CivicUi';
import usePrivacy from '../../hooks/usePrivacy';

const ImportCivicWalletScreen = () => {
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ statusBarStyle: 'light' }), [navigation]);
  const route = useRoute();
  const [importText, setImportText] = useState(route.params?.label ?? '');
  const [askPassphrase, setAskPassphrase] = useState(false);
  const [error, setError] = useState('');
  const [scanReady, setScanReady] = useState(false);
  const { enableBlur, disableBlur } = usePrivacy();
  const triggered = useRef(false);

  const restore = text => {
    const result = validateMarsRecoveryInput(text);
    if (!result.valid) {
      setError(result.message);
      return;
    }
    setError('');
    Keyboard.dismiss();
    navigation.navigate('ImportCivicWalletDiscovery', {
      importText: result.phrase,
      askPassphrase,
      searchAccounts: false,
    });
  };

  const onBarScanned = value => {
    const text = typeof value === 'string' ? value : typeof value?.data === 'string' ? value.data : '';
    const result = validateMarsRecoveryInput(text);
    // Keep public keys and unrelated QR contents out of the phrase field.
    setImportText(result.valid ? result.phrase : '');
    setScanReady(result.valid);
    setError(result.valid ? '' : result.message);
  };

  const scan = async () => {
    try {
      if ((await requestCameraAuthorization()) !== RESULTS.GRANTED) {
        setError('Enable camera access in Settings to scan, or enter your recovery phrase below.');
        return;
      }
      navigation.navigate('ScanQRCode', {
        launchedBy: route.name,
        onBarScanned,
        showFileImportButton: true,
      });
    } catch (_) {
      setError('Camera access is unavailable. Enable it in Settings, or enter your recovery phrase below.');
    }
  };

  useEffect(() => {
    enableBlur();
    return disableBlur;
  }, [enableBlur, disableBlur]);
  useEffect(() => {
    if (route.params?.triggerImport && !triggered.current) {
      triggered.current = true;
      restore(route.params?.label ?? '');
    }
    // Only a caller explicitly requesting an import skips the input step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={ui.screen}>
        <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            <CivicBack onPress={() => navigation.goBack()} />
            <CivicBrand subtitle="WALLET RECOVERY" />
          </View>
          <Text style={ui.title}>Welcome back{'\n'}to the Republic.</Text>
          <Text style={styles.intro}>Restore your civic wallet with the recovery phrase you saved when you created it.</Text>
          <View style={styles.scan}>
            <CivicButton title="Scan recovery phrase" icon="maximize" secondary onPress={scan} testID="ScanImport" />
          </View>
          <View style={styles.separator}>
            <View style={styles.line} />
            <Text style={styles.or}>OR ENTER YOUR WORDS</Text>
            <View style={styles.line} />
          </View>
          <Text style={styles.label}>Recovery phrase</Text>
          <TextInput
            value={importText}
            onChangeText={value => {
              setImportText(value);
              setError('');
              setScanReady(false);
            }}
            style={[styles.input, !!error && styles.inputError]}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="none"
            importantForAutofill="no"
            placeholder="Your 12 or 24 words, in order"
            placeholderTextColor="#7D858F"
            accessibilityLabel="Recovery phrase"
            testID="ImportSecret"
            textAlignVertical="top"
          />
          {!!error && (
            <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Icon name="alert-circle" type="feather" size={19} color="#FFAE79" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {scanReady && <Text style={styles.scanReady}>Recovery phrase scanned. Tap Restore to continue.</Text>}
          <View style={styles.passphrase}>
            <View style={styles.optionCopy}>
              <Text style={styles.label}>Use a passphrase</Text>
              <Text style={styles.optionHint}>Only if you added one to this backup.</Text>
            </View>
            <Switch
              value={askPassphrase}
              onValueChange={setAskPassphrase}
              accessibilityLabel="Use a recovery passphrase"
              testID="AskPassphrase"
              trackColor={{ true: c.orange }}
            />
          </View>
          <CivicButton
            title="Restore civic wallet"
            icon="arrow-right"
            onPress={() => restore(importText)}
            disabled={!importText.trim()}
            testID="DoImport"
          />
          <View style={styles.privacy}>
            <Icon name="lock" type="feather" size={14} color={c.muted} />
            <Text style={styles.privacyText}>Your recovery phrase stays on this device.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginBottom: 32,
  },
  intro: { ...ui.body, marginTop: 14 },
  scan: { marginTop: 28 },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  line: { flex: 1, height: 1, backgroundColor: c.border },
  or: { ...ui.eyebrow, fontSize: 10, letterSpacing: 1 },
  label: {
    fontFamily: 'ChakraPetch-SemiBold',
    color: c.text,
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: c.panel,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 18,
    minHeight: 138,
    color: c.text,
    fontSize: 17,
    lineHeight: 26,
  },
  inputError: { borderColor: '#B75C30' },
  error: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#2A1B14',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#FFBE94' },
  scanReady: { color: c.orange, fontSize: 14, lineHeight: 21, marginTop: 12 },
  passphrase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  optionCopy: { flex: 1 },
  optionHint: { fontSize: 12, lineHeight: 18, color: c.muted },
  privacy: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 8,
  },
  privacyText: { flexShrink: 1, color: c.muted, fontSize: 12, lineHeight: 17 },
});
export default ImportCivicWalletScreen;
