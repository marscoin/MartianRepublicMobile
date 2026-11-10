// Asks for an App Store or Play Store review at a good moment. The decision
// lives in app-review-policy.js; this file only stores state and shows the
// system's own in-app dialog.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Rate, { AndroidMarket } from 'react-native-rate';
import { noteAsked, noteOpen, shouldAskForReview } from './app-review-policy';

const KEY = 'org.martianrepublic.review.v1';
export const STORE_OPTIONS = {
  AppleAppID: '6480416861',
  GooglePackageName: 'com.martianrepublic.app',
  preferredAndroidMarket: AndroidMarket.Google,
};

const read = async () => {
  try {
    return JSON.parse(await AsyncStorage.getItem(KEY));
  } catch {
    return null;
  }
};

// Once per app start.
export async function noteAppOpened() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(noteOpen(await read(), Date.now())));
  } catch {
    /* Not worth interrupting anyone over. */
  }
}

// Call right after something went well for the person. Shows the system
// review dialog if the time is right; never opens the store or an alert of
// our own, and never throws.
export async function celebrate() {
  try {
    const state = await read();
    if (!shouldAskForReview(state, Date.now())) return;
    await AsyncStorage.setItem(KEY, JSON.stringify(noteAsked(state, Date.now())));
    // A short pause so the success screen is seen first.
    setTimeout(() => {
      Rate.rate({ ...STORE_OPTIONS, preferInApp: true, openAppStoreIfInAppFails: false }, () => {});
    }, 1800);
  } catch {
    /* Never let this get in the way. */
  }
}

// The explicit "Rate this app" button.
export function openStoreReview() {
  Rate.rate(
    {
      ...STORE_OPTIONS,
      preferInApp: Platform.OS !== 'android',
      openAppStoreIfInAppFails: true,
      fallbackPlatformURL: 'https://martianrepublic.org',
    },
    () => {},
  );
}
