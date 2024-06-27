import React, { useState, useRef, useEffect, useCallback, useContext, useMemo, useLayoutEffect } from 'react';
import {ActivityIndicator,Alert,Dimensions,FlatList,Keyboard,KeyboardAvoidingView,LayoutAnimation,Platform,StyleSheet,Text,TextInput,TouchableOpacity,TouchableWithoutFeedback,View} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, useIsFocused  } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXCHANGE_RATES_STORAGE_KEY } from '../../blue_modules/currency';
import RNFS from 'react-native-fs';
import BigNumber from 'bignumber.js';
import * as bitcoin from 'bitcoinjs-lib';
import LinearGradient from 'react-native-linear-gradient';
import { BlueDismissKeyboardInputAccessory, BlueLoading, BlueSpacing20,BlueSpacing40, BlueText } from '../../BlueComponents';
import { navigationStyleTx } from '../../components/navigationStyle';
import NetworkTransactionFees, { NetworkTransactionFee } from '../../models/networkTransactionFees';
import { BitcoinUnit, Chain } from '../../models/bitcoinUnits';
import { HDSegwitBech32Wallet, MultisigHDWallet, WatchOnlyWallet } from '../../class';
import DocumentPicker from 'react-native-document-picker';
import DeeplinkSchemaMatch from '../../class/deeplink-schema-match';
import loc, { formatBalance, formatBalanceWithoutSuffix } from '../../loc';
import CoinsSelected from '../../components/CoinsSelected';
import BottomModal from '../../components/BottomModal';
import AddressInput from '../../components/AddressInput';
import AmountInput from '../../components/AmountInput';
import InputAccessoryAllFunds from '../../components/InputAccessoryAllFunds';
import { AbstractHDElectrumWallet } from '../../class/wallets/abstract-hd-electrum-wallet';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import ToolTipMenu from '../../components/TooltipMenu';
import { requestCameraAuthorization, scanQrHelper } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import ListItem from '../../components/ListItem';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import { btcToSatoshi } from '../../blue_modules/currency';
import presentAlert from '../../components/Alert';

//import { useBlueContext } from "../blue_modules/storage-context"
const prompt = require('../../helpers/prompt');
const fs = require('../../blue_modules/fs');
const btcAddressRx = /^[a-zA-Z0-9]{26,35}$/;
const currency = require("../../blue_modules/currency")

const  QuickSendDetails = () => {
  const { wallets, setSelectedWalletID, sleep, txMetadata, saveToDisk, useBlueContext } = useContext(BlueStorageContext);
  const navigation = useNavigation();
  const route = useRoute();
  const { name, params: routeParams } = useRoute();
  const addressInputRef = useRef();

 const scrollView = useRef();
  const scrollIndex = useRef(0);
  const { colors } = useTheme();
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const [isLoading, setIsLoading] = useState(false);
  const [wallet, setWallet] = useState(wallets[0]);
  const [walletID, setWalletID] = useState(null);
  const [walletSelectionOrCoinsSelectedHidden, setWalletSelectionOrCoinsSelectedHidden] = useState(false);
  const [isAmountToolbarVisibleForAndroid, setIsAmountToolbarVisibleForAndroid] = useState(false);
  const [isFeeSelectionModalVisible, setIsFeeSelectionModalVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [isTransactionReplaceable, setIsTransactionReplaceable] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [units, setUnits] = useState([]);
  const [transactionMemo, setTransactionMemo] = useState('');
  const [networkTransactionFees, setNetworkTransactionFees] = useState(new NetworkTransactionFee(3, 2, 1));
  const [networkTransactionFeesIsLoading, setNetworkTransactionFeesIsLoading] = useState(false);
  const [customFee, setCustomFee] = useState(null);
  const [feePrecalc, setFeePrecalc] = useState({ current: null, slowFee: null, mediumFee: null, fastestFee: null });
  const [feeUnit, setFeeUnit] = useState();
  const [amountUnit, setAmountUnit] = useState();
  const [utxo, setUtxo] = useState(null);
  const [frozenBalance, setFrozenBlance] = useState(false);
  const [payjoinUrl, setPayjoinUrl] = useState(null);
  const [changeAddress, setChangeAddress] = useState();
  const [dumb, setDumb] = useState(false);
  const { isEditable } = routeParams;
  // if utxo is limited we use it to calculate available balance
  const balance = utxo ? utxo.reduce((prev, curr) => prev + curr.value, 0) : wallet?.getBalance();
  const allBalance = formatBalanceWithoutSuffix(balance, BitcoinUnit.BTC, true);
  const [triggerScan, setTriggerScan] = useState(false);
  const [firstTriggerDone, setFirstTriggerDone] = useState(false);
  const [scanInitiated, setScanInitiated] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [tabPressed, setTabPressed] = useState(false);
  const isFocused = useIsFocused();
  const [marsRate, setMarsRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchMarscoinRate = async () => {
    try {
      setLoading(true);
      const ratesString = await AsyncStorage.getItem(EXCHANGE_RATES_STORAGE_KEY);
      const rates = ratesString ? JSON.parse(ratesString) : {};
      const marsRate = rates['MARS_USD']; // Make sure 'MARS_USD' is the key under which the rate is stored.
      setMarsRate(marsRate);
    } catch (error) {
      console.error('Failed to load Marscoin rate', error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchMarscoinRate();
  }, []);

  const stylesM = StyleSheet.create({
    container: {
      height: 16,
    },
    text: {
      fontSize: 16,
      fontWeight: '400',
      fontFamily: 'Orbitron-Black', 
      color:'#81868e'
    },
    line: {
      position: 'absolute',
      top: 2, // Adjust top as needed
      left: 2,
      right: 2,
      height: 1.5,
      backgroundColor: '#81868e',
    },
  });
  const MarscoinSymbol = () => (
    <View style={stylesM.container}>
      <Text style={stylesM.text}>M</Text>
      <View style={stylesM.line} />
    </View>
  );
  
  /////AUTO SCAN///////
  useEffect(() => {
    // Trigger scan only if it has never been initiated
    if (!scanInitiated) {
      setTriggerScan(true); // Trigger the scan
      setScanInitiated(true); // Set that the scan has been initiated
    } 
    // Clean up to reset triggerScan on unmount or re-render
    return () => setTriggerScan(false);
  }, [isFocused]); 


//   useEffect(() => {
//     const unsubscribe = navigation.addListener('tabPress', e => {
//         console.log('Tab press event fired');

//         // Prevent default action
//         e.preventDefault();

//         // Check if the current screen is focused and if it is the "Send" tab
//         if (isFocused && route.name === "Send") {
//             console.log('Send tab is pressed and is focused');
//             setTriggerScan(true);
//         }
//     });

//     return unsubscribe;
// }, [navigation, isFocused, route.name]);
// useEffect(() => {
//   console.log('LISTENER!!!!!');
//   // const unsubscribe = navigation.addListener('tabPress', (e) => {
//   //   console.log('Tab press detected!!');
//   // });
//   const unsubscribe = navigation
//   .getParent('Send')
//   .addListener('tabPress', (e) => {
//     // Do something
//   });

//   return unsubscribe;
// }, [navigation, isFocused]);
useFocusEffect(
  React.useCallback(() => {
    const onTabPress = () => {
      console.log('Tab press detected');
      // Trigger whatever action you need here
    };

    const unsubscribe = navigation.addListener('tabPress', onTabPress);

    return () => unsubscribe();
  }, [navigation])
);

  // useEffect(() => {
  //   if (!isFocused) {
  //     setTriggerScan(false);
  //   }
  // }, [isFocused]);

  useEffect(() => {
    console.log('isFocused', isFocused);
  }, [isFocused]);


  // if cutomFee is not set, we need to choose highest possible fee for wallet balance
  // if there are no funds for even Slow option, use 1 sat/vbyte fee
  const feeRate = useMemo(() => {
    if (customFee) return customFee;
    if (feePrecalc.slowFee === null) return '1'; // wait for precalculated fees
    let initialFee;
    if (feePrecalc.fastestFee !== null) {
      initialFee = String(networkTransactionFees.fastestFee);
    } else if (feePrecalc.mediumFee !== null) {
      initialFee = String(networkTransactionFees.mediumFee);
    } else {
      initialFee = String(networkTransactionFees.slowFee);
    }
    return initialFee;
  }, [customFee, feePrecalc, networkTransactionFees]);

  useLayoutEffect(() => {
    if (wallet) {
      setHeaderRightOptions();
    }
  }, [colors, wallet, isTransactionReplaceable, balance, addresses, isEditable, isLoading]);

  // keyboad effects
  useEffect(() => {
    const _keyboardDidShow = () => {
      setWalletSelectionOrCoinsSelectedHidden(true);
      setIsAmountToolbarVisibleForAndroid(true);
    };

    const _keyboardDidHide = () => {
      setWalletSelectionOrCoinsSelectedHidden(false);
      setIsAmountToolbarVisibleForAndroid(false);
    };

    Keyboard.addListener('keyboardDidShow', _keyboardDidShow);
    Keyboard.addListener('keyboardDidHide', _keyboardDidHide);
    return () => {
      Keyboard.removeAllListeners('keyboardDidShow');
      Keyboard.removeAllListeners('keyboardDidHide');
    };
  }, []);

  useEffect(() => {
    // decode route params
    const currentAddress = addresses[scrollIndex.current];
    if (routeParams.uri) {
      try {
        const { address, amount, memo, payjoinUrl: pjUrl } = DeeplinkSchemaMatch.decodeBitcoinUri(routeParams.uri);

        setUnits(u => {
          u[scrollIndex.current] = BitcoinUnit.MARS; // also resetting current unit to BTC
          return [...u];
        });

        setAddresses(addrs => {
          if (currentAddress) {
            currentAddress.address = address;
            if (Number(amount) > 0) {
              currentAddress.amount = amount;
              currentAddress.amountSats = btcToSatoshi(amount);
            }
            addrs[scrollIndex.current] = currentAddress;
            return [...addrs];
          } else {
            return [...addrs, { address, amount, amountSats: btcToSatoshi(amount), key: String(Math.random()) }];
          }
        });

        if (memo?.trim().length > 0) {
          setTransactionMemo(memo);
        }
        setAmountUnit(BitcoinUnit.MARS);
        setPayjoinUrl(pjUrl);
      } catch (error) {
        console.log(error);
        presentAlert({ title: loc.errors.error, message: loc.send.details_error_decode });
      }
    } else if (routeParams.address) {
      const { amount, amountSats, unit = BitcoinUnit.MARS } = routeParams;
      setAddresses(addrs => {
        if (currentAddress) {
          currentAddress.address = routeParams.address;
          addrs[scrollIndex.current] = currentAddress;
          return [...addrs];
        } else {
          return [...addrs, { address: routeParams.address, key: String(Math.random()), amount, amountSats }];
        }
      });
      if (routeParams.memo?.trim().length > 0) {
        setTransactionMemo(routeParams.memo);
      }
      setUnits(u => {
        u[scrollIndex.current] = unit;
        return [...u];
      });
    } else {
      setAddresses([{ address: '', key: String(Math.random()) }]); // key is for the FlatList
    }
  }, [routeParams.uri, routeParams.address]);

  useEffect(() => {
    // check if we have a suitable wallet
    const suitable = wallets.filter(w => w.chain === Chain.ONCHAIN && w.allowSend());
    if (suitable.length === 0) {
      presentAlert({ title: loc.errors.error, message: loc.send.details_wallet_before_tx });
      navigation.goBack();
      return;
    }
    const newWallet = (routeParams.walletID && wallets.find(w => w.getID() === routeParams.walletID)) || suitable[0];
    setWallet(newWallet);
    setWalletID(newWallet.getID());
    setFeeUnit(newWallet.getPreferredBalanceUnit());
    setAmountUnit(newWallet.preferredBalanceUnit); // default for whole screen

    // we are ready!
    setIsLoading(false);

    // load cached fees
    AsyncStorage.getItem(NetworkTransactionFee.StorageKey)
      .then(res => {
        const fees = JSON.parse(res);
        if (!fees?.fastestFee) return;
        setNetworkTransactionFees(fees);
      })
      .catch(e => console.log('loading cached recommendedFees error', e));

    // load fresh fees from servers
    setNetworkTransactionFeesIsLoading(true);
    NetworkTransactionFees.recommendedFees()
      .then(async fees => {
        if (!fees?.fastestFee) return;
        setNetworkTransactionFees(fees);
        await AsyncStorage.setItem(NetworkTransactionFee.StorageKey, JSON.stringify(fees));
      })
      .catch(e => console.log('loading recommendedFees error', e))
      .finally(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setNetworkTransactionFeesIsLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // change header and reset state on wallet change
  useEffect(() => {
    if (!wallet) return;
    setSelectedWalletID(wallet.getID());

    // reset other values
    setUtxo(null);
    setChangeAddress(null);
    setIsTransactionReplaceable(wallet.type === HDSegwitBech32Wallet.type && !routeParams.noRbf);

    // update wallet UTXO
    wallet
      .fetchUtxo()
      .then(() => {
        // we need to re-calculate fees
        setDumb(v => !v);
      })
      .catch(e => console.log('fetchUtxo error', e));
  }, [wallet]); 

  // recalc fees in effect so we don't block render
  useEffect(() => {
    if (!wallet) return; // wait for it
    const fees = networkTransactionFees;
    console.log("FEES: ", fees)
    const change = getChangeAddressFast();
    const requestedSatPerByte = Number(feeRate);
    const lutxo = utxo || wallet.getUtxo();
    let frozen = 0;
    if (!utxo) {
      // if utxo is not limited search for frozen outputs and calc it's balance
      frozen = wallet
        .getUtxo(true)
        .filter(o => !lutxo.some(i => i.txid === o.txid && i.vout === o.vout))
        .reduce((prev, curr) => prev + curr.value, 0);
    }
    const options = [
      { key: 'current', fee: requestedSatPerByte },
      { key: 'slowFee', fee: fees.slowFee },
      { key: 'mediumFee', fee: fees.mediumFee },
      { key: 'fastestFee', fee: fees.fastestFee },
    ];

    const newFeePrecalc = { ...feePrecalc };

    for (const opt of options) {
      let targets = [];
      for (const transaction of addresses) {
        if (transaction.amount === BitcoinUnit.MAX) {
          // single output with MAX
          targets = [{ address: transaction.address }];
          break;
        }
        const value = parseInt(transaction.amountSats, 10);
        if (value > 0) {
          targets.push({ address: transaction.address, value });
        } else if (transaction.amount) {
          if (btcToSatoshi(transaction.amount) > 0) {
            targets.push({ address: transaction.address, value: btcToSatoshi(transaction.amount) });
          }
        }
      }

      // if targets is empty, insert dust
      if (targets.length === 0) {
        targets.push({ address: '36JxaUrpDzkEerkTf1FzwHNE1Hb7cCjgJV', value: 546 });
      }

      // replace wrong addresses with dump
      targets = targets.map(t => {
        if (!wallet.isAddressValid(t.address)) {
          return { ...t, address: '36JxaUrpDzkEerkTf1FzwHNE1Hb7cCjgJV' };
        } else {
          return t;
        }
      });

      let flag = false;
      while (true) {
        try {
          const { fee } = wallet.coinselect(lutxo, targets, opt.fee, change);
          newFeePrecalc[opt.key] = fee;
          break;
        } catch (e) {
          if (e.message.includes('Not enough') && !flag) {
            flag = true;
            // if we don't have enough funds, construct maximum possible transaction
            targets = targets.map((t, index) => (index > 0 ? { ...t, value: 546 } : { address: t.address }));
            continue;
          }
          newFeePrecalc[opt.key] = null;
          break;
        }
      }
    }
    setFeePrecalc(newFeePrecalc);
    setFrozenBlance(frozen);
  }, [wallet, networkTransactionFees, utxo, addresses, feeRate, dumb]); // eslint-disable-line react-hooks/exhaustive-deps

  // we need to re-calculate fees if user opens-closes coin control
  useFocusEffect(
    useCallback(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDumb(v => !v);
    }, []),
  );

  const getChangeAddressFast = () => {
    if (changeAddress) return changeAddress; // cache
    let change;
    if (WatchOnlyWallet.type === wallet.type && !wallet.isHd()) {
      // plain watchonly - just get the address
      change = wallet.getAddress();
    } else if (WatchOnlyWallet.type === wallet.type || wallet instanceof AbstractHDElectrumWallet) {
      change = wallet._getInternalAddressByIndex(wallet.getNextFreeChangeAddressIndex());
    } else {
      // legacy wallets
      change = wallet.getAddress();
    }
    return change;
  };

  const getChangeAddressAsync = async () => {
    console.log("== [SendDetails] getChangeAddressAsync ==")
    if (changeAddress) {
      console.log("Found changeAddress in cache: " + changeAddress)
      return changeAddress
    } // cache

    let change;
    if (WatchOnlyWallet.type === wallet.type && !wallet.isHd()) {
      // plain watchonly - just get the address
      change = wallet.getAddress();
    } else {
      // otherwise, lets call widely-used getChangeAddressAsync()
      try {
        change = await Promise.race([sleep(2000), wallet.getChangeAddressAsync()]);
      } catch (_) {}

      if (!change) {
        console.log("Could not find change")
        // either sleep expired or getChangeAddressAsync threw an exception
        if (wallet instanceof AbstractHDElectrumWallet) {
          change = wallet._getInternalAddressByIndex(wallet.getNextFreeChangeAddressIndex());
        } else {
          // legacy wallets
          change = wallet.getAddress();
        }
      }
    }

    if (change) setChangeAddress(change); // cache
  
    console.log("Setting change address to: " + change)
    return change;
  };

  /**
   * TODO: refactor this mess, get rid of regexp, use https://github.com/bitcoinjs/bitcoinjs-lib/issues/890 etc etc
   * @param data {String} Can be address or `bitcoin:xxxxxxx` uri scheme, or invalid garbage
   */
  const processAddressData = data => {
    console.log("[PROCESS ADDRESS DATA] Data: ", data);
  
    // Normalize the input to ensure it's a string
    const inputData = typeof data === 'object' && data.data ? data.data : data;
    console.log("Normalized Input: ", inputData);
  
    // Remove the URI scheme and unnecessary quotation marks, then trim spaces
    const cleanData = inputData.replace(/["“”]/g, '').trim().replace(/^(bitcoin|BITCOIN|marscoin):/, '');
  
    console.log("Clean Data: ", cleanData);
  
    // Check if the address is valid
    if (wallet.isAddressValid(cleanData)) {
      console.log("Address is valid");
      setAddresses(addrs => {
        const newAddresses = [...addrs];
        newAddresses[scrollIndex.current] = { ...newAddresses[scrollIndex.current], address: cleanData };
        return newAddresses;
      });
    } else {
      console.log("Invalid address");
      // Handle invalid address, possibly with an alert or error message
      presentAlert({ title: loc.errors.error, message: loc.send.details_address_field_is_not_valid });
    }
    setIsLoading(false);
  };
  
  

  const createTransaction = async () => {
    Keyboard.dismiss();
    setIsLoading(true);
    const requestedSatPerByte = feeRate;
    console.log("[TX] feeRate: " + feeRate)
    console.log("[TX] balance: " + balance)
    for (const [index, transaction] of addresses.entries()) {
      let error;
      console.log('!!!!transaction.amount', transaction.amount)
      if (!transaction.amount || transaction.amount < 0 || parseFloat(transaction.amount) === 0) {
        error = loc.send.details_amount_field_is_not_valid;
        console.log('validation error 1', error);
        presentAlert({ title: 'ERROR', message: 'The amount is not valid.' });
      } else if (parseFloat(transaction.amountSats) <= 500) {
        error = loc.send.details_amount_field_is_less_than_minimum_amount_sat;
        console.log('validation error 2', error);
        presentAlert({ title: 'ERROR', message: 'The specified amount is too small. Please enter greater amount.' });
      } else if (!requestedSatPerByte || parseFloat(requestedSatPerByte) < 1) {
        error = loc.send.details_fee_field_is_not_valid;
        console.log('validation error 3');
      } else if (!transaction.address) {
        error = loc.send.details_address_field_is_not_valid;
        console.log('validation error 4', error);
        //presentAlert({ title: 'ERROR', message: 'Address is invalid!' });
      } else if (balance - transaction.amountSats < 0) {
        // first sanity check is that sending amount is not bigger than available balance
        error = frozenBalance > 0 ? loc.send.details_total_exceeds_balance_frozen : loc.send.details_total_exceeds_balance;
        console.log('validation error 5', error);
        presentAlert({ title: 'ERROR', message: 'The sending amount exceeds the available balance!' });
      } else if (transaction.address) {
        const address = transaction.address.trim().toLowerCase();
        if (address.startsWith('lnb') || address.startsWith('lightning:lnb')) {
          error = loc.send.provided_address_is_invoice;
          console.log('validation error 6');
        }
      }

      if (!error) {
        if (!wallet.isAddressValid(transaction.address)) {
          console.log('validation error 7');
          presentAlert({ title: 'ERROR', message: 'Address is invalid!' });
          error = loc.send.details_address_field_is_not_valid;
        }
      }
      if (error) {
        scrollView.current.scrollToIndex({ index });
        setIsLoading(false);
        triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
        return;
      }
    }
    createPsbtTransaction();
  };

  const createPsbtTransaction = async () => {
    console.log("[createPsbtTx] Creating")
    const change = await getChangeAddressAsync();
    const requestedSatPerByte = Number(feeRate);
    const lutxo = utxo || wallet.getUtxo();
    console.log({ requestedSatPerByte, lutxo: lutxo.length });
    const targets = [];
    for (const transaction of addresses) {
      if (transaction.amount === BitcoinUnit.MAX) {
        // output with MAX
        targets.push({ address: transaction.address });
        continue;
      }
      const value = parseInt(transaction.amountSats, 10);
      if (value > 0) {
        targets.push({ address: transaction.address, value });
      } else if (transaction.amount) {
        if (btcToSatoshi(transaction.amount) > 0) {
          targets.push({ address: transaction.address, value: btcToSatoshi(transaction.amount) });
        }
      }
    }
    
    const { tx, outputs, psbt, fee } = await wallet.createTransaction(
      lutxo,
      targets,
      requestedSatPerByte,
      change,
      isTransactionReplaceable ? HDSegwitBech32Wallet.defaultRBFSequence : HDSegwitBech32Wallet.finalRBFSequence,
    );
    
    console.log("(OLD SEND) THE TX BEING BUILT:",  fee)

    if (tx && routeParams.launchedBy && psbt) {
      console.warn('navigating back to ', routeParams.launchedBy);
      navigation.navigate(routeParams.launchedBy, { psbt });
    }
    if (wallet.type === WatchOnlyWallet.type) {
      // watch-only wallets with enabled HW wallet support have different flow. we have to show PSBT to user as QR code
      // so he can scan it and sign it. then we have to scan it back from user (via camera and QR code), and ask
      // user whether he wants to broadcast it
      navigation.navigate('PsbtWithHardwareWallet', {
        memo: transactionMemo,
        fromWallet: wallet,
        psbt,
        launchedBy: routeParams.launchedBy,
      });
      setIsLoading(false);
      return;
    }

    if (wallet.type === MultisigHDWallet.type) {
      navigation.navigate('PsbtMultisig', {
        memo: transactionMemo,
        psbtBase64: psbt.toBase64(),
        walletID: wallet.getID(),
        launchedBy: routeParams.launchedBy,
      });
      setIsLoading(false);
      return;
    }

    txMetadata[tx.getId()] = {
      txhex: tx.toHex(),
      memo: transactionMemo,
    };
    
    await saveToDisk();

    let recipients = outputs.filter(({ address }) => address !== change);

    if (recipients.length === 0) {
      // special case. maybe the only destination in this transaction is our own change address..?
      // (ez can be the case for single-address wallet when doing self-payment for consolidation)
      recipients = outputs;
    }
    navigation.navigate('Confirm', {
      fee: new BigNumber(fee).dividedBy(100000000).toNumber(),
      memo: transactionMemo,
      walletID: wallet.getID(),
      tx: tx.toHex(),
      recipients,
      satoshiPerByte: requestedSatPerByte,
      payjoinUrl,
      psbt,
      marsRate: marsRate
    });
    setIsLoading(false);
  };

  const onWalletSelect = w => {
    setWallet(w);
    navigation.pop();
  };

  /**
   * same as `importTransaction`, but opens camera instead.
   * @returns {Promise<void>}
   */
  const importQrTransaction = () => {
    if (wallet.type !== WatchOnlyWallet.type) {
      return presentAlert({ title: loc.errors.error, message: 'Importing transaction in non-watchonly wallet (this should never happen)' });
    }
    setOptionsVisible(false);
    requestCameraAuthorization().then(() => {
      navigation.navigate('ScanQRCodeRoot', {
        screen: 'ScanQRCode',
        params: {
          onBarScanned: importQrTransactionOnBarScanned,
          showFileImportButton: false,
        },
      });
    });
  };

  const importQrTransactionOnBarScanned = ret => {
    //navigation.getParent().pop();
    //navigation.goBack()
    console.log('importQrTransactionOnBarScanned!!!!!!!!!!!!')
    if (!ret.data) ret = { data: ret };
    if (ret.data.toUpperCase().startsWith('UR')) {
      presentAlert({ title: loc.errors.error, message: 'BC-UR not decoded. This should never happen' });
    } else if (ret.data.indexOf('+') === -1 && ret.data.indexOf('=') === -1 && ret.data.indexOf('=') === -1) {
    } else {
      const psbt = bitcoin.Psbt.fromBase64(ret.data);
      navigation.navigate('PsbtWithHardwareWallet', {
        memo: transactionMemo,
        fromWallet: wallet,
        psbt,
      });
      setIsLoading(false);
      setOptionsVisible(false);
    }
  };

  /**
   * watch-only wallets with enabled HW wallet support have different flow. we have to show PSBT to user as QR code
   * so he can scan it and sign it. then we have to scan it back from user (via camera and QR code), and ask
   * user whether he wants to broadcast it.
   * alternatively, user can export psbt file, sign it externally and then import it
   * @returns {Promise<void>}
   */
  const importTransaction = async () => {
    if (wallet.type !== WatchOnlyWallet.type) {
      return presentAlert({ title: loc.errors.error, message: 'Importing transaction in non-watchonly wallet (this should never happen)' });
    }
    try {
      const res = await DocumentPicker.pickSingle({
        type:
          Platform.OS === 'ios'
            ? ['io.bluewallet.psbt', 'io.bluewallet.psbt.txn', DocumentPicker.types.plainText, 'public.json']
            : [DocumentPicker.types.allFiles],
      });

      if (DeeplinkSchemaMatch.isPossiblySignedPSBTFile(res.uri)) {
        // we assume that transaction is already signed, so all we have to do is get txhex and pass it to next screen
        // so user can broadcast:
        const file = await RNFS.readFile(res.uri, 'ascii');
        const psbt = bitcoin.Psbt.fromBase64(file);
        const txhex = psbt.extractTransaction().toHex();
        navigation.navigate('PsbtWithHardwareWallet', { memo: transactionMemo, fromWallet: wallet, txhex });
        setIsLoading(false);
        setOptionsVisible(false);
        return;
      }

      if (DeeplinkSchemaMatch.isPossiblyPSBTFile(res.uri)) {
        // looks like transaction is UNsigned, so we construct PSBT object and pass to next screen
        // so user can do smth with it:
        const file = await RNFS.readFile(res.uri, 'ascii');
        const psbt = bitcoin.Psbt.fromBase64(file);
        navigation.navigate('PsbtWithHardwareWallet', { memo: transactionMemo, fromWallet: wallet, psbt });
        setIsLoading(false);
        setOptionsVisible(false);
        return;
      }

      if (DeeplinkSchemaMatch.isTXNFile(res.uri)) {
        // plain text file with txhex ready to broadcast
        const file = (await RNFS.readFile(res.uri, 'ascii')).replace('\n', '').replace('\r', '');
        navigation.navigate('PsbtWithHardwareWallet', { memo: transactionMemo, fromWallet: wallet, txhex: file });
        setIsLoading(false);
        setOptionsVisible(false);
        return;
      }

      presentAlert({ title: loc.errors.error, message: loc.send.details_unrecognized_file_format });
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        presentAlert({ title: loc.errors.error, message: loc.send.details_no_signed_tx });
      }
    }
  };

  const askCosignThisTransaction = async () => {
    return new Promise(resolve => {
      Alert.alert(
        '',
        loc.multisig.cosign_this_transaction,
        [
          {
            text: loc._.no,
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: loc._.yes,
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false },
      );
    });
  };

  const _importTransactionMultisig = async base64arg => {
    try {
      const base64 = base64arg || (await fs.openSignedTransaction());
      if (!base64) return;
      const psbt = bitcoin.Psbt.fromBase64(base64); // if it doesnt throw - all good, its valid
      if (wallet.howManySignaturesCanWeMake() > 0 && (await askCosignThisTransaction())) {
        hideOptions();
        setIsLoading(true);
        await sleep(100);
        wallet.cosignPsbt(psbt);
        setIsLoading(false);
        await sleep(100);
      }
      navigation.navigate('PsbtMultisig', {
        memo: transactionMemo,
        psbtBase64: psbt.toBase64(),
        walletID: wallet.getID(),
      });
    } catch (error) {
      presentAlert({ title: loc.send.problem_with_psbt, message: error.message });
    }
    setIsLoading(false);
    setOptionsVisible(false);
  };

  const importTransactionMultisig = () => {
    return _importTransactionMultisig();
  };

  const onBarScanned = ret => {
    setScanInitiated(true)
    navigation.getParent().pop();
    if (!ret.data) ret = { data: ret };
    if (ret.data.toUpperCase().startsWith('UR')) {
      presentAlert({ title: loc.errors.error, message: 'BC-UR not decoded. This should never happen' });
    } else if (ret.data.indexOf('+') === -1 && ret.data.indexOf('=') === -1 && ret.data.indexOf('=') === -1) {
      // this looks like NOT base64, so maybe its transaction's hex
      // we dont support it in this flow
    } else {
      // psbt base64?
      return _importTransactionMultisig(ret.data);
    }
  };

  const importTransactionMultisigScanQr = () => {
    setOptionsVisible(false);
    requestCameraAuthorization().then(() => {
      navigation.navigate('ScanQRCodeRoot', {
        screen: 'ScanQRCode',
        params: {
          onBarScanned,
          showFileImportButton: true,
        },
      });
    });
  };

  const handleAddRecipient = async () => {
    setAddresses(addrs => [...addrs, { address: '', key: String(Math.random()) }]);
    setOptionsVisible(false);
    await sleep(200); // wait for animation
    scrollView.current.scrollToEnd();
    if (addresses.length === 0) return;
    scrollView.current.flashScrollIndicators();
  };

  const handleRemoveRecipient = async () => {
    const last = scrollIndex.current === addresses.length - 1;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAddresses(addrs => {
      addrs.splice(scrollIndex.current, 1);
      return [...addrs];
    });
    setOptionsVisible(false);
    if (addresses.length === 0) return;
    await sleep(200); // wait for animation
    scrollView.current.flashScrollIndicators();
    if (last && Platform.OS === 'android') scrollView.current.scrollToEnd(); // fix white screen on android
  };

  const handleCoinControl = () => {
    setOptionsVisible(false);
    navigation.navigate('CoinControl', {
      walletID: wallet.getID(),
      onUTXOChoose: u => setUtxo(u),
    });
  };

  const handlePsbtSign = async () => {
    setIsLoading(true);
    setOptionsVisible(false);
    await new Promise(resolve => setTimeout(resolve, 100)); // sleep for animations
    const scannedData = await scanQrHelper(navigation.navigate, name);
    if (!scannedData) return setIsLoading(false);
    let tx;
    let psbt;
    try {
      psbt = bitcoin.Psbt.fromBase64(scannedData);
      tx = wallet.cosignPsbt(psbt).tx;
    } catch (e) {
      presentAlert({ title: loc.errors.error, message: e.message });
      return;
    } finally {
      setIsLoading(false);
    }

    if (!tx) return setIsLoading(false);
    // we need to remove change address from recipients, so that Confirm screen show more accurate info
    const changeAddresses = [];
    for (let c = 0; c < wallet.next_free_change_address_index + wallet.gap_limit; c++) {
      changeAddresses.push(wallet._getInternalAddressByIndex(c));
    }
    const recipients = psbt.txOutputs.filter(({ address }) => !changeAddresses.includes(address));

    navigation.navigate('CreateTransaction', {
      fee: new BigNumber(psbt.getFee()).dividedBy(100000000).toNumber(),//
      feeSatoshi: psbt.getFee(),
      wallet,
      tx: tx.toHex(),
      recipients,
      satoshiPerByte: psbt.getFeeRate(),
      showAnimatedQr: true,
      psbt,
    });
  };

  const hideOptions = () => {
    Keyboard.dismiss();
    setOptionsVisible(false);
  };

  // Header Right Button
  const headerRightOnPress = id => {
    if (id ===  QuickSendDetails.actionKeys.AddRecipient) {
      handleAddRecipient();
    } else if (id ===  QuickSendDetails.actionKeys.RemoveRecipient) {
      handleRemoveRecipient();
    } else if (id ===  QuickSendDetails.actionKeys.SignPSBT) {
      handlePsbtSign();
    } else if (id ===  QuickSendDetails.actionKeys.SendMax) {
      onUseAllPressed();
    } else if (id ===  QuickSendDetails.actionKeys.AllowRBF) {
      onReplaceableFeeSwitchValueChanged(!isTransactionReplaceable);
    } else if (id ===  QuickSendDetails.actionKeys.ImportTransaction) {
      importTransaction();
    } else if (id ===  QuickSendDetails.actionKeys.ImportTransactionQR) {
      importQrTransaction();
    } else if (id ===  QuickSendDetails.actionKeys.ImportTransactionMultsig) {
      importTransactionMultisig();
    } else if (id ===  QuickSendDetails.actionKeys.CoSignTransaction) {
      importTransactionMultisigScanQr();
    } else if (id ===  QuickSendDetails.actionKeys.CoinControl) {
      handleCoinControl();
    }
  };

  const headerRightActions = () => {
    const actions = [];
    if (isEditable) {
      const isSendMaxUsed = addresses.some(element => element.amount === BitcoinUnit.MAX);

      actions.push([{ id:  QuickSendDetails.actionKeys.SendMax, text: loc.send.details_adv_full, disabled: balance === 0 || isSendMaxUsed }]);
      if (wallet.type === HDSegwitBech32Wallet.type) {
        actions.push([{ id:  QuickSendDetails.actionKeys.AllowRBF, text: loc.send.details_adv_fee_bump, menuStateOn: isTransactionReplaceable }]);
      }
      const transactionActions = [];
      if (wallet.type === WatchOnlyWallet.type && wallet.isHd()) {
        transactionActions.push(
          {
            id:  QuickSendDetails.actionKeys.ImportTransaction,
            text: loc.send.details_adv_import,
            icon:  QuickSendDetails.actionIcons.ImportTransaction,
          },
          {
            id:  QuickSendDetails.actionKeys.ImportTransactionQR,
            text: loc.send.details_adv_import_qr,
            icon:  QuickSendDetailss.actionIcons.ImportTransactionQR,
          },
        );
      }
      if (wallet.type === MultisigHDWallet.type) {
        transactionActions.push({
          id:  QuickSendDetails.actionKeys.ImportTransactionMultsig,
          text: loc.send.details_adv_import,
          icon:  QuickSendDetails.actionIcons.ImportTransactionMultsig,
        });
      }
      if (wallet.type === MultisigHDWallet.type && wallet.howManySignaturesCanWeMake() > 0) {
        transactionActions.push({
          id:  QuickSendDetails.actionKeys.CoSignTransaction,
          text: loc.multisig.co_sign_transaction,
          icon:  QuickSendDetails.actionIcons.SignPSBT,
        });
      }
      if (wallet.allowCosignPsbt()) {
        transactionActions.push({ id:  QuickSendDetails.actionKeys.SignPSBT, text: loc.send.psbt_sign, icon:  QuickSendDetails.actionIcons.SignPSBT });
      }
      actions.push(transactionActions, [
        {
          id:  QuickSendDetails.actionKeys.AddRecipient,
          text: loc.send.details_add_rec_add,
          icon:  QuickSendDetails.actionIcons.AddRecipient,
        },
        {
          id:  QuickSendDetails.actionKeys.RemoveRecipient,
          text: loc.send.details_add_rec_rem,
          disabled: addresses.length < 2,
          icon:  QuickSendDetails.actionIcons.RemoveRecipient,
        },
      ]);
    }
    actions.push({ id:  QuickSendDetails.actionKeys.CoinControl, text: loc.cc.header, icon:  QuickSendDetails.actionIcons.CoinControl });
    return actions;
  };
  const setHeaderRightOptions = () => {
    navigation.setOptions({
      headerRight: Platform.select({
        ios: () => (
          <ToolTipMenu
            disabled={isLoading}
            isButton
            isMenuPrimaryAction
            onPressMenuItem={headerRightOnPress}
            actions={headerRightActions()}
          >
            <Icon size={22} name="more-horiz" type="material" color={colors.foregroundColor} style={styles.advancedOptions} />
          </ToolTipMenu>
        ),
        default: () => (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={loc._.more}
            disabled={isLoading}
            style={styles.advancedOptions}
            onPress={() => {
              Keyboard.dismiss();
              setOptionsVisible(true);
            }}
            testID="advancedOptionsMenuButton"
          >
            <Icon size={22} name="more-horiz" type="material" color={colors.foregroundColor} />
          </TouchableOpacity>
        ),
      }),
    });
  };

  const onReplaceableFeeSwitchValueChanged = value => {
    setIsTransactionReplaceable(value);
  };

  // because of https://github.com/facebook/react-native/issues/21718 we use
  // onScroll for android and onMomentumScrollEnd for iOS
  const handleRecipientsScrollEnds = e => {
    if (Platform.OS === 'android') return; // for android we use handleRecipientsScroll
    const contentOffset = e.nativeEvent.contentOffset;
    const viewSize = e.nativeEvent.layoutMeasurement;
    const index = Math.floor(contentOffset.x / viewSize.width);
    scrollIndex.current = index;
  };

  const handleRecipientsScroll = e => {
    if (Platform.OS === 'ios') return; // for iOS we use handleRecipientsScrollEnds
    const contentOffset = e.nativeEvent.contentOffset;
    const viewSize = e.nativeEvent.layoutMeasurement;
    const index = Math.floor(contentOffset.x / viewSize.width);
    scrollIndex.current = index;
  };

  const onUseAllPressed = () => {
    triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
    const message = frozenBalance > 0 ? loc.send.details_adv_full_sure_frozen : loc.send.details_adv_full_sure;
    Alert.alert(
      loc.send.details_adv_full,
      message,
      [
        {
          text: loc._.ok,
          onPress: () => {
            Keyboard.dismiss();
            setAddresses(addrs => {
              addrs[scrollIndex.current].amount = BitcoinUnit.MAX;
              addrs[scrollIndex.current].amountSats = BitcoinUnit.MAX;
              return [...addrs];
            });
            setUnits(u => {
              u[scrollIndex.current] = BitcoinUnit.MARS;
              return [...u];
            });
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setOptionsVisible(false);
          },
          style: 'default',
        },
        { text: loc._.cancel, onPress: () => {}, style: 'cancel' },
      ],
      { cancelable: false },
    );
  };

  const stylesHook = StyleSheet.create({
    loading: {
      backgroundColor: colors.background,
    },
    root: {
      backgroundColor: colors.elevated,
    },
    modalContent: {
      backgroundColor: colors.modal,
      borderTopColor: colors.borderTopColor,
      borderWidth: colors.borderWidth,
    },
    optionsContent: {
      backgroundColor: colors.modal,
      borderTopColor: colors.borderTopColor,
      borderWidth: colors.borderWidth,
    },
    feeModalItemActive: {
      backgroundColor: colors.feeActive,
    },
    feeModalLabel: {
      color: colors.successColor,
    },
    feeModalTime: {
      backgroundColor: colors.successColor,
    },
    feeModalTimeText: {
      color: colors.background,
    },
    feeModalValue: {
      color: colors.successColor,
    },
    feeModalCustomText: {
      color: colors.buttonAlternativeTextColor,
    },
    selectLabel: {
      fontSize: 18,
      color: 'black',
    },
    of: {
      color: 'black',
    },
    memo: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
    feeLabel: {
      color: colors.feeText,
      fontFamily: 'Orbitron-Regular',
      letterSpacing: 1.2,
    },
    feeModalItemDisabled: {
      backgroundColor: colors.buttonDisabledBackgroundColor,
    },
    feeModalItemTextDisabled: {
      color: colors.buttonDisabledTextColor,
    },
    feeRow: {
      backgroundColor: colors.feeLabel,
    },
    feeValue: {
      color: colors.feeValue,
      fontFamily: 'Orbitron-Regular',
      letterSpacing: 1.2,
      color:'#FF7400'
    },
  });

  const renderFeeSelectionModal = () => {
    const nf = networkTransactionFees;
    const options = [
      {
        label: loc.send.fee_fast,
        time: '2m',
        fee: feePrecalc.fastestFee,
        rate: nf.fastestFee,
        active: Number(feeRate) === nf.fastestFee,
      },
      {
        label: loc.send.fee_medium,
        time: '15m',
        fee: feePrecalc.mediumFee,
        rate: nf.mediumFee,
        active: Number(feeRate) === nf.mediumFee,
        disabled: nf.mediumFee === nf.fastestFee,
      },
      {
        label: loc.send.fee_slow,
        time: '45m',
        fee: feePrecalc.slowFee,
        rate: nf.slowFee,
        active: Number(feeRate) === nf.slowFee,
        disabled: nf.slowFee === nf.mediumFee || nf.slowFee === nf.fastestFee,
      },
    ];

    return (
      <BottomModal
        deviceWidth={width + width / 2}
        isVisible={isFeeSelectionModalVisible}
        onClose={() => setIsFeeSelectionModalVisible(false)}
      >
        <KeyboardAvoidingView enabled={!Platform.isPad} behavior={Platform.OS === 'ios' ? 'position' : null}>
          <View style={[styles.modalContent, stylesHook.modalContent]}>
            {options.map(({ label, time, fee, rate, active, disabled }, index) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={label}
                disabled={disabled}
                onPress={() => {
                  setFeePrecalc(fp => ({ ...fp, current: fee }));
                  setIsFeeSelectionModalVisible(false);
                  setCustomFee(rate.toString());
                }}
                style={[styles.feeModalItem, active && styles.feeModalItemActive, active && !disabled && stylesHook.feeModalItemActive]}
              >
                <View style={styles.feeModalRow}>
                  <Text style={[styles.feeModalLabel, disabled ? stylesHook.feeModalItemTextDisabled : stylesHook.feeModalLabel]}>
                    {label}
                  </Text>
                  <View style={[styles.feeModalTime, disabled ? stylesHook.feeModalItemDisabled : stylesHook.feeModalTime]}>
                    <Text style={stylesHook.feeModalTimeText}>~{time}</Text>
                  </View>
                </View>
                <View style={styles.feeModalRow}>
                  {marsRate &&
                  <Text style={[disabled ? stylesHook.feeModalItemTextDisabled : stylesHook.feeModalValue, {fontSize: 12}]}>{fee*100} zubrin / ${(fee*marsRate/ 1000000).toFixed(8)}</Text>}
                  <Text style={[disabled ? stylesHook.feeModalItemTextDisabled : stylesHook.feeModalValue, {fontSize: 12}]}>
                    {rate} {loc.units.sat_vbyte}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID="feeCustom"
              accessibilityRole="button"
              style={styles.feeModalCustom}
              onPress={async () => {
                let error = loc.send.fee_satvbyte;
                while (true) {
                  let fee;
                  try {
                    fee = await prompt(loc.send.create_fee, error, true, 'numeric');
                  } catch (_) {
                    return;
                  }
                  if (!/^\d+$/.test(fee)) {
                    error = loc.send.details_fee_field_is_not_valid;
                    continue;
                  }
                  if (fee < 1) fee = '1';
                  fee = Number(fee).toString(); // this will remove leading zeros if any
                  setCustomFee(fee);
                  setIsFeeSelectionModalVisible(false);
                  return;
                }
              }}
            >
              <Text style={[styles.feeModalCustomText, stylesHook.feeModalCustomText]}>{loc.send.fee_custom}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </BottomModal>
    );
  };

  const renderOptionsModal = () => {
    const isSendMaxUsed = addresses.some(element => element.amount === BitcoinUnit.MAX);
    return (
      <BottomModal deviceWidth={width + width / 2} isVisible={optionsVisible} onClose={hideOptions}>
        <KeyboardAvoidingView enabled={!Platform.isPad} behavior={Platform.OS === 'ios' ? 'position' : null}>
          <View style={[styles.optionsContent, stylesHook.optionsContent]}>
            {isEditable && (
              <ListItem
                testID="sendMaxButton"
                disabled={balance === 0 || isSendMaxUsed}
                title={loc.send.details_adv_full}
                hideChevron
                onPress={onUseAllPressed}
              />
            )}
            {wallet.type === HDSegwitBech32Wallet.type && isEditable && (
              <ListItem
                title={loc.send.details_adv_fee_bump}
                Component={TouchableWithoutFeedback}
                switch={{ value: isTransactionReplaceable, onValueChange: onReplaceableFeeSwitchValueChanged }}
              />
            )}
            {wallet.type === WatchOnlyWallet.type && wallet.isHd() && (
              <ListItem title={loc.send.details_adv_import} hideChevron component={TouchableOpacity} onPress={importTransaction} />
            )}
            {wallet.type === WatchOnlyWallet.type && wallet.isHd() && (
              <ListItem
                testID="ImportQrTransactionButton"
                title={loc.send.details_adv_import_qr}
                hideChevron
                onPress={importQrTransaction}
              />
            )}
            {wallet.type === MultisigHDWallet.type && isEditable && (
              <ListItem title={loc.send.details_adv_import} hideChevron onPress={importTransactionMultisig} />
            )}
            {wallet.type === MultisigHDWallet.type && wallet.howManySignaturesCanWeMake() > 0 && isEditable && (
              <ListItem title={loc.multisig.co_sign_transaction} hideChevron onPress={importTransactionMultisigScanQr} />
            )}
            {isEditable && (
              <>
                <ListItem testID="AddRecipient" title={loc.send.details_add_rec_add} hideChevron onPress={handleAddRecipient} />
                <ListItem
                  testID="RemoveRecipient"
                  title={loc.send.details_add_rec_rem}
                  hideChevron
                  disabled={addresses.length < 2}
                  onPress={handleRemoveRecipient}
                />
              </>
            )}
            <ListItem testID="CoinControl" title={loc.cc.header} hideChevron onPress={handleCoinControl} />
            {wallet.allowCosignPsbt() && isEditable && (
              <ListItem testID="PsbtSign" title={loc.send.psbt_sign} hideChevron onPress={handlePsbtSign} />
            )}
          </View>
        </KeyboardAvoidingView>
      </BottomModal>
    );
  };

  const renderCreateButton = () => {
    return (
      <View style={styles.createButton}>
        {isLoading ? (
          <ActivityIndicator />
        ) : (
          <Button onPress={createTransaction} title={loc.send.details_next} testID="CreateTransactionButton" />
        )}
      </View>
    );
  };

  const renderWalletSelectionOrCoinsSelected = () => {
    if (walletSelectionOrCoinsSelectedHidden) return null;
    if (utxo !== null) {
      return (
        <View style={styles.select}>
          <CoinsSelected
            number={utxo.length}
            onContainerPress={handleCoinControl}
            onClose={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setUtxo(null);
            }}
          />
        </View>
      );
    }

    return (
      <View style={{justifyContent:'center', marginHorizontal: 20}}>
        <Text style={{fontFamily: 'Orbitron-Black',color:'white', fontSize: 16, fontWeight:'500'}}>From: </Text>
        <TouchableOpacity 
          style={styles.select}
          accessibilityRole="button"
          onPress={() => navigation.navigate('SelectWallet', { onWalletSelect, chainType: Chain.ONCHAIN })}
              disabled={!isEditable || isLoading}
        >  
          <View style={styles.selectWrap}>
            <View>
              <Text style={{fontFamily: 'Orbitron-Black',color:'#FF7400', fontSize: 18, fontWeight:'600'}}>{wallet.getLabel()}</Text>
              <Text style={{fontFamily: 'Orbitron-Black',color:'#81868e', fontSize: 14, fontWeight:'500', marginTop: 5}}>
              <MarscoinSymbol/>
                {' '}
                {(wallet.getBalance()/100000000).toLocaleString()}
                {' /$ '}
                {(wallet.getBalance()/100000000*marsRate).toLocaleString()}
              </Text>
              </View>
              <Icon name="chevron-right" size={20} type="font-awesome-5" color={'#81868e'} />
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBitcoinTransactionInfoFields = params => {
    const { item, index } = params;
    return (
      <View style={{ width }} testID={'Transaction' + index}>
        <AddressInput
          onChangeText={text => {
            text = text.trim();
            const { address, amount, memo, payjoinUrl: pjUrl } = 
              DeeplinkSchemaMatch.decodeBitcoinUri(text);
            setAddresses(addrs => {
              item.address = address || text;
              item.amount = amount || item.amount;
              addrs[index] = item;
              return [...addrs];
            });
            setTransactionMemo(memo || transactionMemo);
            setIsLoading(false);
            setPayjoinUrl(pjUrl);
          }}
          onBarScanned={processAddressData}
          address={item.address}
          isLoading={isLoading}
          triggerScan={triggerScan}
          inputAccessoryViewID={BlueDismissKeyboardInputAccessory.InputAccessoryViewID}
          launchedBy={name}
          editable={isEditable}
        />
        {addresses.length > 1 && (
          <Text style={[styles.of, stylesHook.of]}>{loc.formatString(loc._.of, { number: index + 1, total: addresses.length })}</Text>
        )}
        <TouchableOpacity
              testID="chooseFee"
              accessibilityRole="button"
              onPress={() => setIsFeeSelectionModalVisible(true)}
              disabled={isLoading}
              style={styles.fee}
            >
              <Text style={[styles.feeLabel, stylesHook.feeLabel]}>{loc.send.create_fee}</Text>
              {networkTransactionFeesIsLoading ? (
                <ActivityIndicator />
              ) : (
                <View style={[styles.feeRow, stylesHook.feeRow]}>
                  <Text style={[stylesHook.feeValue, {fontSize: 12}]}>
                    {(feePrecalc.current*100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' zubrin' }
                  </Text>
                </View>
              )}
            </TouchableOpacity>
         <BlueSpacing20/>

        {/* {item.address &&
        <AmountInput
          isLoading={isLoading}
          amount={item.amount ? item.amount.toString() : null}
          onAmountUnitChange={unit => {
            console.log(
              "UNIT AND AMOUNT: ",
              unit,
              " - ",
              (item.amount),
              "AMOUNT ITEM:",
              item.amount
            )
            setAddresses(addrs => {
              const addr = addrs[index];
              switch (unit) {
                case BitcoinUnit.SATS:
                  addr.amountSats = parseInt(addr.amount, 10);
                  break;
                case BitcoinUnit.BTC:
                  addr.amountSats = btcToSatoshi(addr.amount);
                  break;
                case BitcoinUnit.MARS:
                  addr.amountSats = currency.btcToSatoshi(item.amount)
                  break
                case BitcoinUnit.LOCAL_CURRENCY:
                  // also accounting for cached fiat->sat conversion to avoid rounding error
                  //addr.amountSats = AmountInput.getCachedSatoshis(addr.amount) || btcToSatoshi(fiatToBTC(addr.amount));
                  addr.amountSats = currency.btcToSatoshi(
                    currency.fiatToMARS(addr.amount)
                  )
                  break;
              }

              addrs[index] = addr;
              return [...addrs];
            });
            setUnits(u => {
              u[index] = unit;
              return [...u];
            });
          }}
          onChangeText={text => {
            setAddresses(addrs => {
              item.amount = text;
              switch (units[index] || amountUnit) {
                case BitcoinUnit.BTC:
                  item.amountSats = btcToSatoshi(item.amount);
                  break;
                case BitcoinUnit.MARS:
                  item.amountSats = currency.btcToSatoshi(item.amount)
                break
                case BitcoinUnit.LOCAL_CURRENCY:
                  //item.amountSats = btcToSatoshi(fiatToBTC(item.amount));
                  item.amountSats = currency.btcToSatoshi(
                    currency.fiatToMARS(item.amount)
                  )
                  break;
                case BitcoinUnit.SATS:
                default:
                  item.amountSats = parseInt(text, 10);
                  break;
              }
              addrs[index] = item;
              return [...addrs];
            });
          }}
          chain={ wallet.getNetwork()}
          unit={units[index] || amountUnit}
          editable={isEditable}
          disabled={!isEditable}
          inputAccessoryViewID={InputAccessoryAllFunds.InputAccessoryViewID}
          style ={{height: 100}}
        />} */}
      </View>
    );
  };

  if (isLoading || !wallet) {
    return (
      <View style={[styles.loading, stylesHook.loading]}>
        <BlueLoading />
      </View>
    );
  }
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.root, stylesHook.root]} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        <View>
        <Text style={{fontFamily: 'Orbitron-Black',color:'white', fontSize: 20, fontWeight:'600', marginHorizontal: 20, alignSelf: 'center'}}>QUICK SEND </Text>
          <BlueSpacing40/>
        {renderWalletSelectionOrCoinsSelected()}
        <BlueSpacing20/>
          <KeyboardAvoidingView enabled={!Platform.isPad} behavior="position">
            {/* /////////Currency and address//////// */}
            <Text style={{fontFamily: 'Orbitron-Black',color:'white', fontSize: 16, fontWeight:'500', marginHorizontal: 20}}>To: </Text>
            <FlatList
              keyboardShouldPersistTaps="always"
              scrollEnabled={addresses.length > 1}
              data={addresses}
              renderItem={renderBitcoinTransactionInfoFields}
              ref={scrollView}
              horizontal
              pagingEnabled
              removeClippedSubviews={false}
              onMomentumScrollBegin={Keyboard.dismiss}
              onMomentumScrollEnd={handleRecipientsScrollEnds}
              onScroll={handleRecipientsScroll}
              scrollEventThrottle={200}
              scrollIndicatorInsets={styles.scrollViewIndicator}
              contentContainerStyle={styles.scrollViewContent}
            />
            {/* <TouchableOpacity
              testID="chooseFee"
              accessibilityRole="button"
              onPress={() => setIsFeeSelectionModalVisible(true)}
              disabled={isLoading}
              style={styles.fee}
            >
              <Text style={[styles.feeLabel, stylesHook.feeLabel]}>{loc.send.create_fee}</Text>
              {networkTransactionFeesIsLoading ? (
                <ActivityIndicator />
              ) : (
                <View style={[styles.feeRow, stylesHook.feeRow]}>
                  <Text style={[stylesHook.feeValue, {fontSize: 12}]}>
                    {(feePrecalc.current*100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' zubrin' }
                  </Text>
                </View>
              )}
            </TouchableOpacity> */}
            {renderCreateButton()}
            {renderFeeSelectionModal()}
          </KeyboardAvoidingView>
        </View>
        <BlueDismissKeyboardInputAccessory />
        {Platform.select({
          ios: <InputAccessoryAllFunds canUseAll={balance > 0} onUseAllPressed={onUseAllPressed} balance={allBalance} />,
          android: isAmountToolbarVisibleForAndroid && (
            <InputAccessoryAllFunds canUseAll={balance > 0} onUseAllPressed={onUseAllPressed} balance={allBalance} />
          ),
        })}
      </View>
    </TouchableWithoutFeedback>
  );
};

export default QuickSendDetails;

QuickSendDetails.actionKeys = {
  SignPSBT: 'SignPSBT',
  SendMax: 'SendMax',
  AddRecipient: 'AddRecipient',
  RemoveRecipient: 'RemoveRecipient',
  AllowRBF: 'AllowRBF',
  ImportTransaction: 'ImportTransaction',
  ImportTransactionMultsig: 'ImportTransactionMultisig',
  ImportTransactionQR: 'ImportTransactionQR',
  CoinControl: 'CoinControl',
  CoSignTransaction: 'CoSignTransaction',
};

QuickSendDetails.actionIcons = {
  SignPSBT: { iconType: 'SYSTEM', iconValue: 'signature' },
  SendMax: 'SendMax',
  AddRecipient: { iconType: 'SYSTEM', iconValue: 'person.badge.plus' },
  RemoveRecipient: { iconType: 'SYSTEM', iconValue: 'person.badge.minus' },
  AllowRBF: 'AllowRBF',
  ImportTransaction: { iconType: 'SYSTEM', iconValue: 'square.and.arrow.down' },
  ImportTransactionMultsig: { iconType: 'SYSTEM', iconValue: 'square.and.arrow.down.on.square' },
  ImportTransactionQR: { iconType: 'SYSTEM', iconValue: 'qrcode.viewfinder' },
  CoinControl: { iconType: 'SYSTEM', iconValue: 'switch.2' },
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    paddingTop: 20,
  },
  root: {
    flex: 1,
    marginTop:100,
    justifyContent: 'space-between',
  },
  scrollViewContent: {
    flexDirection: 'row',
  },
  scrollViewIndicator: {
    top: 0,
    left: 8,
    bottom: 0,
    right: 8,
  },
  modalContent: {
    padding: 22,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minHeight: 200,
  },
  optionsContent: {
    padding: 22,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minHeight: 130,
  },
  feeModalItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 10,
  },
  feeModalItemActive: {
    borderRadius: 8,
  },
  feeModalRow: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
  },
  feeModalLabel: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2
  },
  feeModalTime: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  feeModalCustom: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feeModalCustomText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2
  },
  createButton: {
    marginVertical: 36,
    marginHorizontal: 16,
    alignContent: 'center',
    minHeight: 44,
  },
  select: {
    width:'100%',
    height: 70,
    marginTop: 8,
    marginHorizontal: 24,
    padding: 10,
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius:4,
    borderWidth: 1,
    borderColor: 'white',
    backgroundColor: '#2F2D2B',
  },
  selectTouch: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  selectText: {
    color: 'black',
    fontSize: 14,
    marginRight: 8,
    fontFamily: 'Orbitron-Black',
    letterSpacing: 1.2,
    color: '#81868e',
  },
  selectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  selectLabel: {
    fontSize: 14,
    fontFamily: 'Orbitron-Black',
    //color: '#81868e',
    color:'#FF7400'
  },
  of: {
    alignSelf: 'flex-end',
    marginRight: 18,
    marginVertical: 8,
  },
  memo: {
    flexDirection: 'row',
    borderWidth: 1,
    borderBottomWidth: 0.5,
    minHeight: 44,
    height: 44,
    marginHorizontal: 20,
    alignItems: 'center',
    marginVertical: 8,
    borderRadius: 4,
  },
  memoText: {
    flex: 1,
    marginHorizontal: 8,
    minHeight: 33,
    color: '#81868e',
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2
  },
  fee: {
    flexDirection: 'row',
    marginHorizontal: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeLabel: {
    fontSize: 14,
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2
  },
  feeRow: {
    minWidth: 40,
    height: 25,
    borderRadius: 4,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  advancedOptions: {
    minWidth: 40,
    height: 40,
    justifyContent: 'center',
  },
  frozenContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
});

QuickSendDetails.navigationOptions = navigationStyleTx({}, options => ({
  ...options,
  title: loc.send.header,
  statusBarStyle: 'light',
}));

QuickSendDetails.initialParams = { isEditable: true, triggerScan:true };