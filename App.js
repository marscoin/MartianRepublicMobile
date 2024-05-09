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
import { URL } from "react-native-url-polyfill";
const A = require('./blue_modules/analytics');
const bitcoinMessage = require("bitcoinjs-message");
const bitcoin = require("bitcoinjs-lib");
const pbkdf2 = require("pbkdf2");
const bip39 = require("bip39");
const { BIP32Factory } = require('bip32')
const ecc = require('tiny-secp256k1')
const bip32 = BIP32Factory(ecc)
var { randomBytes } = require('crypto')

const BITCOIN = {
  messagePrefix: "\x18Bitcoin Signed Message:\n",
  bech32: "bc",
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

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

  function getCivicAddress(wallets) {
    // Loop through the wallets array
    for (let wallet of wallets) {
        // Check if the wallet has the civic property set to true
        if (wallet.civic) {
            console.log('CIVIC ADDRESS:', wallet._address );
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
            console.log('CIVIC MNEMONIC:', wallet.secret );
            return wallet.secret;
        }
    }
    return null; // Return null if no civic wallet is found
  }  


function deriveAddressFromPublicKey(publicKey, network) {
  const { address } = bitcoin.payments.p2pkh({
      pubkey: Buffer.from(publicKey, 'hex'),
      network: network
  });
  return address;
}

function verifyPublicKey(privateKeyWIF, expectedPublicKey) {
    const keyPair = bitcoin.ECPair.fromWIF(privateKeyWIF, MARSCOIN);
    
    const publicKey = keyPair.publicKey;
    console.log('!!!!!!!!!!!!!!!publicKey', publicKey)
    const derivedAddress = deriveAddressFromPublicKey(publicKey, MARSCOIN);
    console.log('Derived Address:', derivedAddress);
    console.log('Civic Address:', 'MVk86WKySkawkjRqmiazWMnbrf39qpCkLD');
    console.log('Do they match?', derivedAddress === 'MVk86WKySkawkjRqmiazWMnbrf39qpCkLD');
    
    return publicKey === expectedPublicKey;
}

async function getToken() {
  try {
    var address1 = 'MVk86WKySkawkjRqmiazWMnbrf39qpCkLD';
    //var keyPair1 = bitcoin.ECPair.fromWIF('KyDQnrnvL28X7vGi8mw7kt4m4JYFArhE8C7Q8dJB76Pwbae1nr61', MARSCOIN)
    var keyPair1 = bitcoin.ECPair.fromWIF('KxKYjXhM59QoQP4b7hK5Ajy72xxHUyAY56539ee1YVSDbaHsUZW8')
    //var address1 = '1F3sAm6ZtwLAUnj7d38pGFxtP3RVEvtsbV'
    var privateKey1 = keyPair1.privateKey
    const timestamp = Math.floor(Date.now() / 1000); // UNIX timestamp in seconds
    const message1 = `https://martianrepublic.org/api/token?a=${address1}&t=${timestamp}`;

    var signature1 = bitcoinMessage.sign(message1, privateKey1, keyPair1.compressed)
    //console.log('!!!!!!!!!', signature1.toString('base64'))
    console.log('QQQQQQQQQQQQ', bitcoinMessage.verify(message1, address1, signature1))

    const address = getCivicAddress(wallets);
    //const timestamp = Math.floor(Date.now() / 1000); // UNIX timestamp in seconds
    const message = `https://martianrepublic.org/api/token?a=${address}&t=${timestamp}`;
    //let parsedURL;


    mnemonic = getCivicMnemonic(wallets)
    const root = await generateRoot(mnemonic);
    let child = null;
    //let custom_key = "m/88888888'/0'";
    //let custom_key = `m/44'/0'/0'/0/0`;
    let custom_key =`m/44'/${MARSCOIN.bip44}'/0'/0/0` /////derives correct addresses
    child = root.derivePath(custom_key);
    
    const wif = child.toWIF();
    console.log("wif", wif);

    const keyPair = bitcoin.ECPair.fromWIF(wif);
    //console.log('keyPair:', keyPair);
    const publicKey = keyPair.publicKey;
    //console.log('publicKey:', publicKey);

    const privateKey = keyPair.privateKey;
    console.log('privateKey:', privateKey);

    const signedMsg = bitcoinMessage
      .sign(message, privateKey, keyPair.compressed)
      .toString("base64");

      const signedMsg1 = bitcoinMessage
      .sign(message1, privateKey1, keyPair1.compressed)
      .toString("base64");      

    console.log('signature:', signedMsg);
    console.log('CIVIC ADDRESS:', address);
    console.log('timestamp:', timestamp);
    console.log('message:', message);

    let isMatch = verifyPublicKey(wif, address);
    console.log('Do the keys match?', isMatch); 

    //Verify the signature
    const network = MARSCOIN;
    const verified = bitcoinMessage.verify(message, address, signedMsg);
    console.log('Verification result:', verified);
    
    const response = await axios.post("https://martianrepublic.org/api/token", {
      a: address,
      m: message,
      s: signedMsg, 
      t: timestamp,
    }).then(response => {
      console.log('Token retrieved:', response.data.token);
    }).catch(error => {
      console.error('Failed to retrieve token:', error.response.status, error.response.data);
      //console.error('Failed to retrieve token:', error.response);
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
