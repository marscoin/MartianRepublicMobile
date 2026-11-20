import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { REPUBLIC_LOGIN_HOST, parseRepublicLogin, secondsLeft, submitRepublicLogin } from '../../blue_modules/republic-login';
import { CivicBack, CivicBrand, CivicButton, civicColors, civicStyles } from '../../components/CivicUi';

const SAID = {
  expired: 'This sign-in code has run out or was already used. Reload the sign-in page on the website and scan the new code.',
  refused: 'The website did not accept the signature. Reload the sign-in page and try again.',
  busy: 'Too many sign-in attempts. Wait a minute, then reload the sign-in page and scan again.',
  failed: 'The website could not be reached. Check your connection and try again.',
};

const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Opened from the scanner with the website's login code. Nothing is signed or sent until the citizen confirms.
export default function RepublicLoginScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const url = params?.url;
  const login = useMemo(() => parseRepublicLogin(url), [url]);
  const { wallets } = useContext(BlueStorageContext);
  const wallet = wallets.find(item => item.civic);
  const address = wallet?._getExternalAddressByIndex(0);
  const lock = useRef(false);
  const [left, setLeft] = useState(() => secondsLeft(login));
  const [state, setState] = useState('ready'); // ready | busy | signed_in | expired | refused | busy_server | failed

  useEffect(() => {
    if (!login || state === 'signed_in') return;
    const timer = setInterval(() => setLeft(secondsLeft(login)), 1000);
    return () => clearInterval(timer);
  }, [login, state]);

  const signIn = async () => {
    if (lock.current || !wallet || !login) return;
    lock.current = true;
    setState('busy');
    try {
      const { outcome } = await submitRepublicLogin({ wallet, login, post: axios.post });
      setState(outcome === 'busy' ? 'busy_server' : outcome);
    } catch {
      setState('failed');
    } finally {
      // a used code cannot be used twice: only a failure to reach the site may be retried
      lock.current = false;
    }
  };

  const problem = !login
    ? 'This is not a Martian Republic sign-in code.'
    : !wallet
      ? 'Set up or restore your civic identity in the app first, then scan the code again.'
      : state === 'busy_server'
        ? SAID.busy
        : SAID[state] || (left <= 0 ? SAID.expired : null);
  const done = state === 'signed_in';
  const canSign = !!login && !!wallet && left > 0 && (state === 'ready' || state === 'failed');

  return (
    <SafeAreaView style={civicStyles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={[civicStyles.content, styles.content]}>
        <CivicBack onPress={() => navigation.goBack()} />
        <CivicBrand subtitle="MARTIAN REPUBLIC / WEBSITE SIGN-IN" />
        <Text style={civicStyles.title}>{done ? 'You are signed in.' : 'Sign in on the website?'}</Text>
        {done ? (
          <Text style={civicStyles.body}>Go back to your browser: the Martian Republic opens there as you.</Text>
        ) : (
          <Text style={civicStyles.body}>
            A browser showing {REPUBLIC_LOGIN_HOST} asks to sign in with your civic identity. Continue only if you opened the sign-in page
            yourself, just now.
          </Text>
        )}
        <View style={styles.panel}>
          <Text style={civicStyles.eyebrow}>WEBSITE</Text>
          <Text style={styles.site}>{REPUBLIC_LOGIN_HOST}</Text>
          <Text style={civicStyles.eyebrow}>SIGNING IN AS</Text>
          <Text selectable style={styles.address}>
            {address || 'No civic identity on this phone'}
          </Text>
          {!done && login && left > 0 && <Text style={styles.expires}>This code works for another {clock(left)}.</Text>}
        </View>
        {problem && !done && <Text style={[civicStyles.body, styles.problem]}>{problem}</Text>}
        {done ? (
          <CivicButton title="Done" icon="check" onPress={() => navigation.goBack()} testID="RepublicLoginDone" />
        ) : (
          <>
            <CivicButton
              title={state === 'busy' ? 'Signing in…' : 'Sign in'}
              icon="log-in"
              disabled={!canSign}
              onPress={signIn}
              testID="RepublicLoginConfirm"
            />
            <CivicButton title="Cancel" secondary onPress={() => navigation.goBack()} testID="RepublicLoginCancel" />
          </>
        )}
        <Text style={styles.note}>
          Your phone signs a message naming this website and this sign-in only. Your recovery words and keys never leave the phone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingBottom: 40 },
  panel: { backgroundColor: civicColors.panel, padding: 20, borderRadius: 16, gap: 8 },
  site: { color: civicColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 22, marginBottom: 8 },
  address: { color: civicColors.text, fontSize: 14, lineHeight: 20 },
  expires: { color: civicColors.muted, fontSize: 13, marginTop: 8 },
  problem: { color: civicColors.orange },
  note: { color: civicColors.muted, fontSize: 13, lineHeight: 19 },
});
