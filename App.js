import 'react-native-gesture-handler'; // should be on top
import React, { useContext, useEffect, useRef, useState } from 'react';
import {AppState, NativeModules, NativeEventEmitter, Linking, Platform, StyleSheet, UIManager, useColorScheme,View,LogBox,} from 'react-native';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './NavigationService';
import * as NavigationService from './NavigationService';
import { Chain } from './models/bitcoinUnits';
import DeeplinkSchemaMatch from './class/deeplink-schema-match';
import loc from './loc';
import { BlueDefaultTheme, BlueDarkTheme } from './components/themes';
import InitRoot from './Navigation';
import BlueClipboard from './blue_modules/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlueStorageContext } from './blue_modules/storage-context';
import DeviceQuickActions from './class/quick-actions';
import Notifications from './blue_modules/notifications';
import Biometric from './class/biometrics';
import ActionSheet from './screen/ActionSheet';
import HandoffComponent from './components/handoff';
import triggerHapticFeedback, { HapticFeedbackTypes } from './blue_modules/hapticFeedback';
import MenuElements from './components/MenuElements';
import { updateExchangeRate } from './blue_modules/currency';
import axios from "axios";
const A = require('./blue_modules/analytics');
const bitcoinMessage = require("bitcoinjs-message");
const bitcoin = require("bitcoinjs-lib");
const bip39 = require("bip39");
const { BIP32Factory } = require('bip32')
const ecc = require('tiny-secp256k1')
const bip32 = BIP32Factory(ecc)

const MARSCOIN = {
    messagePrefix: "\x19Marscoin Signed Message:\n",
    bech32: "M",
    bip44: 2,
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    pubKeyHash: 0x32,
    scriptHash: 0x32,
    wif: 0x80,
};

const eventEmitter = Platform.OS === 'ios' ? new NativeEventEmitter(NativeModules.EventEmitter) : undefined;
const { EventEmitter, SplashScreen } = NativeModules;

LogBox.ignoreLogs(['Require cycle:', 'Battery state `unknown` and monitoring disabled, this is normal for simulators and tvOS.']);

const ClipboardContentType = Object.freeze({
  BITCOIN: 'BITCOIN',
  LIGHTNING: 'LIGHTNING',
});

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

const App = () => {
  const {
    walletsInitialized,
    wallets,
    addWallet,
    saveToDisk,
    fetchAndSaveWalletTransactions,
    refreshAllWalletTransactions,
    setSharedCosigner,
  } = useContext(BlueStorageContext);

  const appState = useRef(AppState.currentState);
  const clipboardContent = useRef();
  const colorScheme = useColorScheme();

  const generateRoot = async (mnemonic) => {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    //const root = bitcoin.bip32.fromSeed(seed, MARSCOIN); 
    const root = bip32.fromSeed(seed, MARSCOIN);
    return root;
  };

  const onNotificationReceived = async notification => {
    const payload = Object.assign({}, notification, notification.data);
    if (notification.data && notification.data.data) Object.assign(payload, notification.data.data);
    payload.foreground = true;

    await Notifications.addNotification(payload);
    // if user is staring at the app when he receives the notification we process it instantly
    // so app refetches related wallet
    if (payload.foreground) await processPushNotifications();
  };

  const onUserActivityOpen = data => {
    switch (data.activityType) {
      case HandoffComponent.activityTypes.ReceiveOnchain:
        NavigationService.navigate('ReceiveDetailsRoot', {
          screen: 'ReceiveDetails',
          params: {
            address: data.userInfo.address,
          },
        });
        break;
      case HandoffComponent.activityTypes.Xpub:
        NavigationService.navigate('WalletXpubRoot', {
          screen: 'WalletXpub',
          params: {
            xpub: data.userInfo.xpub,
          },
        });
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (walletsInitialized) {
      addListeners();
    }
  }, [walletsInitialized]);

  const storeCivic = async (address) => {
    try {
      await AsyncStorage.setItem('civicAddress', address);
      console.log('CivicAddress successfully saved', address);
    } catch (error) {
      console.error('Failed to save the civicAddress to storage', error);
    }
  };

  const storeMnemonic = async (mnemonic) => {
    try {
      await AsyncStorage.setItem('civicMnemonic', mnemonic);
      console.log('CivicMnemonic successfully saved!!!!!!!!', mnemonic);
    } catch (error) {
      console.error('Failed to save the civicMnemonic to storage', error);
    }
  };

  function getCivicAddress(wallets) {
    // Loop through the wallets array
    for (let wallet of wallets) {
        // Check if the wallet has the civic property set to true
        if (wallet.civic) {
            console.log('CIVIC ADDRESS:', wallet._address );
            storeCivic(wallet._address)
            return wallet._address;
        }
    }
    return null;  // Return null if no civic wallet is found
  }  
  
  function getCivicMnemonic(wallets) {
    // Loop through the wallets array
    for (let wallet of wallets) {
        // Check if the wallet has the civic property set to true
        if (wallet.civic) {
            storeMnemonic(wallet.secret)
            return wallet.secret;
        }
    }
    return null; // Return null if no civic wallet is found
  }  


  const storeToken = async (token) => {
    try {
      await AsyncStorage.setItem('@auth_token', token);
      console.log('Token successfully saved');
    } catch (error) {
      console.error('Failed to save the token to storage', error);
    }
  };

async function getToken() {
  try {
    const address = getCivicAddress(wallets);
    const timestamp = Math.floor(Date.now() / 1000); // UNIX timestamp in seconds
    const message = `https://martianrepublic.org/api/token?a=${address}&t=${timestamp}`;

    mnemonic = getCivicMnemonic(wallets)
    const root = await generateRoot(mnemonic);
    let child = null;
    //let custom_key = "m/88888888'/0'";
    let custom_key =`m/44'/${MARSCOIN.bip44}'/0'/0/0` /////derives correct addresses
    child = root.derivePath(custom_key);
    const wif = child.toWIF();

    const keyPair = bitcoin.ECPair.fromWIF(wif);
    const privateKey = keyPair.privateKey;
    
    ///////SIGNING THE MESSAGE/////////
    const signedMsg = bitcoinMessage
      .sign(message, privateKey, keyPair.compressed)
      .toString("base64");   

    console.log('signature:', signedMsg);
    console.log('CIVIC ADDRESS:', address);
    console.log('timestamp:', timestamp);
    console.log('message:', message);

    //Verify the signature
    const verified = bitcoinMessage.verify(message, address, signedMsg);
    console.log('Verification result:', verified);
    
    const response = await axios.post("https://martianrepublic.org/api/token", {
      a: address,
      m: message,
      s: signedMsg, 
      t: timestamp,
    }).then(response => {
      console.log('Token retrieved:', response.data.token);
      storeToken(response.data.token); // Save the token once retrieved
    }).catch(error => {
      console.error('Failed to retrieve token:', error.response);
    });

    console.log('RESPONSE:', response);
  } catch (error) {
    console.error('Error fetching token:', error);
    return null;
  }
}
  
  useEffect(() => {
    if (walletsInitialized) {
      getToken();
    }
  }, [wallets]);
  
  const addListeners = () => {
    Linking.addEventListener('url', handleOpenURL);
    AppState.addEventListener('change', handleAppStateChange);
    EventEmitter?.getMostRecentUserActivity()
      .then(onUserActivityOpen)
      .catch(() => console.log('No userActivity object sent'));
    handleAppStateChange(undefined);
    /*
      When a notification on iOS is shown while the app is on foreground;
      On willPresent on AppDelegate.m
     */
    eventEmitter?.addListener('onNotificationReceived', onNotificationReceived);
    eventEmitter?.addListener('onUserActivityOpen', onUserActivityOpen);
  };

  /**
   * Processes push notifications stored in AsyncStorage. Might navigate to some screen.
   *
   * @returns {Promise<boolean>} returns TRUE if notification was processed _and acted_ upon, i.e. navigation happened
   * @private
   */
  const processPushNotifications = async () => {
    if (!walletsInitialized) {
      console.log('not processing push notifications because wallets are not initialized');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    // sleep needed as sometimes unsuspend is faster than notification module actually saves notifications to async storage
    const notifications2process = await Notifications.getStoredNotifications();

    await Notifications.clearStoredNotifications();
    Notifications.setApplicationIconBadgeNumber(0);
    const deliveredNotifications = await Notifications.getDeliveredNotifications();
    setTimeout(() => Notifications.removeAllDeliveredNotifications(), 5000); // so notification bubble wont disappear too fast

    for (const payload of notifications2process) {
      const wasTapped = payload.foreground === false || (payload.foreground === true && payload.userInteraction);

      console.log('processing push notification:', payload);
      let wallet;
      switch (+payload.type) {
        case 2:
        case 3:
          wallet = wallets.find(w => w.weOwnAddress(payload.address));
          break;
        case 1:
        case 4:
          wallet = wallets.find(w => w.weOwnTransaction(payload.txid || payload.hash));
          break;
      }

      if (wallet) {
        const walletID = wallet.getID();
        fetchAndSaveWalletTransactions(walletID);
        if (wasTapped) {
          if (payload.type !== 3 || wallet.chain === Chain.OFFCHAIN) {
            NavigationService.dispatch(
              CommonActions.navigate({
                name: 'WalletTransactions',
                params: {
                  walletID,
                  walletType: wallet.type,
                },
              }),
            );
          } else {
            NavigationService.navigate('ReceiveDetailsRoot', {
              screen: 'ReceiveDetails',
              params: {
                walletID,
                address: payload.address,
              },
            });
          }

          return true;
        }
      } else {
        console.log('could not find wallet while processing push notification, NOP');
      }
    } // end foreach notifications loop

    if (deliveredNotifications.length > 0) {
      // notification object is missing userInfo. We know we received a notification but don't have sufficient
      // data to refresh 1 wallet. let's refresh all.
      refreshAllWalletTransactions();
    }
    // if we are here - we did not act upon any push
    return false;
  };

  const handleAppStateChange = async nextAppState => {
    if (wallets.length === 0) return;
    if ((appState.current.match(/background/) && nextAppState === 'active') || nextAppState === undefined) {
      setTimeout(() => A(A.ENUM.APP_UNSUSPENDED), 2000);
      updateExchangeRate();
      const processed = await processPushNotifications();
      if (processed) return;
      const clipboard = await BlueClipboard().getClipboardContent();
      const isAddressFromStoredWallet = wallets.some(wallet => {
        if (wallet.chain === Chain.ONCHAIN) {
          // checking address validity is faster than unwrapping hierarchy only to compare it to garbage
          return wallet.isAddressValid && wallet.isAddressValid(clipboard) && wallet.weOwnAddress(clipboard);
        } else {
          return wallet.isInvoiceGeneratedByWallet(clipboard) || wallet.weOwnAddress(clipboard);
        }
      });
      const isBitcoinAddress = DeeplinkSchemaMatch.isBitcoinAddress(clipboard);
      const isLightningInvoice = DeeplinkSchemaMatch.isLightningInvoice(clipboard);
      const isLNURL = DeeplinkSchemaMatch.isLnUrl(clipboard);
      const isBothBitcoinAndLightning = DeeplinkSchemaMatch.isBothBitcoinAndLightning(clipboard);
      if (
        !isAddressFromStoredWallet &&
        clipboardContent.current !== clipboard &&
        (isBitcoinAddress || isLightningInvoice || isLNURL || isBothBitcoinAndLightning)
      ) {
        let contentType;
        if (isBitcoinAddress) {
          contentType = ClipboardContentType.BITCOIN;
        } else if (isLightningInvoice || isLNURL) {
          contentType = ClipboardContentType.LIGHTNING;
        } else if (isBothBitcoinAndLightning) {
          contentType = ClipboardContentType.BITCOIN;
        }
        showClipboardAlert({ contentType });
      }
      clipboardContent.current = clipboard;
    }
    if (nextAppState) {
      appState.current = nextAppState;
    }
  };

  const handleOpenURL = event => {
    DeeplinkSchemaMatch.navigationRouteFor(event, value => NavigationService.navigate(...value), {
      wallets,
      addWallet,
      saveToDisk,
      setSharedCosigner,
    });
  };

  const showClipboardAlert = ({ contentType }) => {
    triggerHapticFeedback(HapticFeedbackTypes.ImpactLight);
    BlueClipboard()
      .getClipboardContent()
      .then(clipboard => {
        if (Platform.OS === 'ios' || Platform.OS === 'macos') {
          ActionSheet.showActionSheetWithOptions(
            {
              options: [loc._.cancel, loc._.continue],
              title: loc._.clipboard,
              message: contentType === ClipboardContentType.BITCOIN ? loc.wallets.clipboard_bitcoin : loc.wallets.clipboard_lightning,
              cancelButtonIndex: 0,
            },
            buttonIndex => {
              if (buttonIndex === 1) {
                handleOpenURL({ url: clipboard });
              }
            },
          );
        } else {
          ActionSheet.showActionSheetWithOptions({
            buttons: [
              { text: loc._.cancel, style: 'cancel', onPress: () => {} },
              {
                text: loc._.continue,
                style: 'default',
                onPress: () => {
                  handleOpenURL({ url: clipboard });
                },
              },
            ],
            title: loc._.clipboard,
            message: contentType === ClipboardContentType.BITCOIN ? loc.wallets.clipboard_bitcoin : loc.wallets.clipboard_lightning,
          });
        }
      });
  };

  useEffect(() => {
    if (Platform.OS === 'ios') {
      // Call hide to setup the listener on the native side
      SplashScreen?.addObserver();
    }
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <NavigationContainer ref={navigationRef} theme={colorScheme === 'dark' ? BlueDarkTheme : BlueDefaultTheme}>
          <InitRoot />
          <Notifications onProcessNotifications={processPushNotifications} />
          <MenuElements />
          <DeviceQuickActions />
        </NavigationContainer>
      </View>
      <Biometric />
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
