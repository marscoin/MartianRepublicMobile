import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import React, { useContext, useEffect, useReducer } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  Image
} from 'react-native';
import {
  BitcoinButton,
  BlueButtonLink,
  BlueFormLabel,
  BlueSpacing20,
  BlueSpacing40,
  BlueText,
  MarscoinButton,
} from '../../BlueComponents';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import {
  AbstractWallet,
  HDSegwitBech32Wallet,
  HDSegwitP2SHWallet,
  LightningCustodianWallet,
  LightningLdkWallet,
  SegwitP2SHWallet,
} from '../../class';

import { MarsElectrumWallet } from '../wallets/mars-wallet';
import presentAlert from '../../components/Alert';
import Button from '../../components/Button';
import { LdkButton } from '../../components/LdkButton';
import ListItem from '../../components/ListItem';
import { useTheme } from '../../components/themes';
import useAsyncPromise from '../../hooks/useAsyncPromise';
import loc from '../../loc';
import { Chain } from '../../models/bitcoinUnits';
import BIP32Factory from 'bip32';
const BlueApp = require('../../BlueApp');
const AppStorage = BlueApp.AppStorage;
const A = require('../../blue_modules/analytics');

// const bitcoin = require('bitcoinjs-lib'); // Use bitcoinjs-lib or similar library
// const bip32 = require('bip32')
// const bip39 = require('bip39');

enum ButtonSelected {
  // @ts-ignore: Return later to update
  ONCHAIN = Chain.ONCHAIN,
  // @ts-ignore: Return later to update
  OFFCHAIN = Chain.OFFCHAIN,
  VAULT = 'VAULT',
  LDK = 'LDK',
}

interface State {
  isLoading: boolean;
  walletBaseURI: string;
  selectedIndex: number;
  label: string;
  selectedWalletType: ButtonSelected;
  backdoorPressed: number;
  entropy: string | any[] | undefined;
  entropyButtonText: string;
}

const ActionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_WALLET_BASE_URI: 'SET_WALLET_BASE_URI',
  SET_SELECTED_INDEX: 'SET_SELECTED_INDEX',
  SET_LABEL: 'SET_LABEL',
  SET_SELECTED_WALLET_TYPE: 'SET_SELECTED_WALLET_TYPE',
  INCREMENT_BACKDOOR_PRESSED: 'INCREMENT_BACKDOOR_PRESSED',
  SET_ENTROPY: 'SET_ENTROPY',
  SET_ENTROPY_BUTTON_TEXT: 'SET_ENTROPY_BUTTON_TEXT',
} as const;
type ActionTypes = (typeof ActionTypes)[keyof typeof ActionTypes];

interface Action {
  type: ActionTypes;
  payload?: any;
}

const initialState: State = {
  isLoading: true,
  walletBaseURI: '',
  selectedIndex: 0,
  label: '',
  selectedWalletType: ButtonSelected.ONCHAIN,
  backdoorPressed: 1,
  entropy: undefined,
  entropyButtonText: loc.wallets.add_entropy_provide,
};

const walletReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case ActionTypes.SET_WALLET_BASE_URI:
      return { ...state, walletBaseURI: action.payload };
    case ActionTypes.SET_SELECTED_INDEX:
      return { ...state, selectedIndex: action.payload };
    case ActionTypes.SET_LABEL:
      return { ...state, label: action.payload };
    case ActionTypes.SET_SELECTED_WALLET_TYPE:
      return { ...state, selectedWalletType: action.payload };
    case ActionTypes.INCREMENT_BACKDOOR_PRESSED:
      return { ...state, backdoorPressed: state.backdoorPressed + 1 };
    case ActionTypes.SET_ENTROPY:
      return { ...state, entropy: action.payload };
    case ActionTypes.SET_ENTROPY_BUTTON_TEXT:
      return { ...state, entropyButtonText: action.payload };
    default:
      return state;
  }
};

const WalletsCivicAdd: React.FC = () => {
  const { colors } = useTheme();

  // State
  const [state, dispatch] = useReducer(walletReducer, initialState);
  const isLoading = state.isLoading;
  const walletBaseURI = state.walletBaseURI;
  const selectedIndex = state.selectedIndex;
  const label = state.label;
  const selectedWalletType = state.selectedWalletType;
  const backdoorPressed = state.backdoorPressed;
  const entropy = state.entropy;
  const entropyButtonText = state.entropyButtonText;
  //
  const colorScheme = useColorScheme();
  const { addWallet, saveToDisk, isAdvancedModeEnabled, wallets } = useContext(BlueStorageContext);
  const isAdvancedOptionsEnabled = useAsyncPromise(isAdvancedModeEnabled);
  const { navigate, goBack, setOptions } = useNavigation();
  const stylesHook = {
    advancedText: {
      color: colors.feeText,
    },
    label: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
    noPadding: {
      backgroundColor: colors.elevated,
    },
    root: {
      backgroundColor: colors.elevated,
    },
    lndUri: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
  };

  useEffect(() => {
    AsyncStorage.getItem(AppStorage.LNDHUB)
      .then(url => (url ? setWalletBaseURI(url) : setWalletBaseURI('')))
      .catch(() => setWalletBaseURI(''))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setOptions({
      statusBarStyle: Platform.select({ ios: 'light', default: colorScheme === 'dark' ? 'light' : 'dark' }),
    });
  }, [colorScheme, setOptions]);

  const entropyGenerated = (newEntropy: string | any[]) => {
    let entropyTitle;
    if (!newEntropy) {
      entropyTitle = loc.wallets.add_entropy_provide;
    } else if (newEntropy.length < 32) {
      entropyTitle = loc.formatString(loc.wallets.add_entropy_remain, {
        gen: newEntropy.length,
        rem: 32 - newEntropy.length,
      });
    } else {
      entropyTitle = loc.formatString(loc.wallets.add_entropy_generated, {
        gen: newEntropy.length,
      });
    }
    setEntropy(newEntropy);
    setEntropyButtonText(entropyTitle);
  };

  const setIsLoading = (value: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: value });
  };

  const setWalletBaseURI = (value: string) => {
    dispatch({ type: 'SET_WALLET_BASE_URI', payload: value });
  };

  const setSelectedIndex = (value: number) => {
    dispatch({ type: 'SET_SELECTED_INDEX', payload: value });
  };

  const setLabel = (value: string) => {
    dispatch({ type: 'SET_LABEL', payload: value });
  };

  const setSelectedWalletType = (value: ButtonSelected) => {
    dispatch({ type: 'SET_SELECTED_WALLET_TYPE', payload: value });
  };

  const setBackdoorPressed = (value: number) => {
    dispatch({ type: 'INCREMENT_BACKDOOR_PRESSED', payload: value });
  };

  const setEntropy = (value: string | any[]) => {
    dispatch({ type: 'SET_ENTROPY', payload: value });
  };

  const setEntropyButtonText = (value: string) => {
    dispatch({ type: 'SET_ENTROPY_BUTTON_TEXT', payload: value });
  };

  const createMarsWallet= async () => {
    let wallet
    wallet = new MarsElectrumWallet()
        await wallet.generate()
        wallet.setLabel('CIVIC WALLET')
        await wallet.getAddressAsync();
        addWallet(wallet);
        await saveToDisk();
        A(A.ENUM.CREATED_WALLET);
        triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
        navigate('PleaseBackupCivic' ,{
          walletID: wallet.getID(),
        });
        // navigate('MainApp', {
        //   screen: 'PleaseBackup',
        //   params: {
        //     walletID: wallet.getID(),
        //   },
        //}
      //);
  }

  const navigateToEntropy = () => {
    // @ts-ignore: Return later to update
    navigate('ProvideEntropy', { onGenerated: entropyGenerated });
  };

  const navigateToImportWallet = () => {
    // @ts-ignore: Return later to update
    navigate('ImportWallet');
  };

  const handleOnVaultButtonPressed = () => {
    Keyboard.dismiss();
    setSelectedWalletType(ButtonSelected.VAULT);
  };

  const handleOnBitcoinButtonPressed = () => {
    Keyboard.dismiss();
    setSelectedWalletType(ButtonSelected.ONCHAIN);
  };

  const handleOnLightningButtonPressed = () => {
    // @ts-ignore: Return later to update
    setBackdoorPressed((prevState: number) => {
      return prevState + 1;
    });
    Keyboard.dismiss();
    setSelectedWalletType(ButtonSelected.OFFCHAIN);
  };

  const handleOnLdkButtonPressed = async () => {
    Keyboard.dismiss();
    setSelectedWalletType(ButtonSelected.LDK);
  };

  return (
    <ScrollView style={stylesHook.root} testID="ScrollView">
      <Image style={styles.imageLG} source={require('../../img/dashboard_bg1.png')} />
      <BlueSpacing20 />
      <KeyboardAvoidingView enabled behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={62}>
        
        <View style ={{marginVertical: 30}}>
          <Text style={styles.infoText}>
            We will create a new Marscoin Wallet for you.
          </Text>
          <Text style={styles.infoText}>
            It will be your proof of citizernship!
          </Text>
          <Text style={styles.infoTextAlert}>
            It is extremely important to save the passphrase of this wallet!
          </Text>
        </View>
                  
        <View style={styles.buttons}>
          <MarscoinButton
            active={selectedWalletType === ButtonSelected.ONCHAIN}
            onPress={handleOnBitcoinButtonPressed}
            style={styles.button}
          />
        </View>

        <View style={styles.advanced}>
          {(() => {
            if (selectedWalletType === ButtonSelected.ONCHAIN && isAdvancedOptionsEnabled.data) {
              return (
                <View>
                  <BlueSpacing20 />
                  <Text style={[styles.advancedText, stylesHook.advancedText]}>{loc.settings.advanced_options}</Text>
                  <ListItem
                    containerStyle={[styles.noPadding, stylesHook.noPadding]}
                    bottomDivider={false}
                    onPress={() => setSelectedIndex(0)}
                    title={HDSegwitBech32Wallet.typeReadable}
                    checkmark={selectedIndex === 0}
                  />
                  <ListItem
                    containerStyle={[styles.noPadding, stylesHook.noPadding]}
                    bottomDivider={false}
                    onPress={() => setSelectedIndex(1)}
                    title={SegwitP2SHWallet.typeReadable}
                    checkmark={selectedIndex === 1}
                  />
                  <ListItem
                    containerStyle={[styles.noPadding, stylesHook.noPadding]}
                    bottomDivider={false}
                    onPress={() => setSelectedIndex(2)}
                    title={HDSegwitP2SHWallet.typeReadable}
                    checkmark={selectedIndex === 2}
                  />
                </View>
              );
            } else if (selectedWalletType === ButtonSelected.OFFCHAIN) {
              return (
                <>
                  <BlueSpacing20 />
                  <Text style={[styles.advancedText, stylesHook.advancedText]}>{loc.settings.advanced_options}</Text>
                  <BlueSpacing20 />
                  <BlueText>{loc.wallets.add_lndhub}</BlueText>
                  <View style={[styles.lndUri, stylesHook.lndUri]}>
                    <TextInput
                      value={walletBaseURI}
                      onChangeText={setWalletBaseURI}
                      onSubmitEditing={Keyboard.dismiss}
                      placeholder={loc.wallets.add_lndhub_placeholder}
                      clearButtonMode="while-editing"
                      autoCapitalize="none"
                      textContentType="URL"
                      autoCorrect={false}
                      placeholderTextColor="#81868e"
                      style={styles.textInputCommon}
                      editable={!isLoading}
                      underlineColorAndroid="transparent"
                    />
                  </View>
                </>
              );
            }
          })()}
          {/* {isAdvancedOptionsEnabled.data === true && selectedWalletType === ButtonSelected.ONCHAIN && !isLoading && (
            <BlueButtonLink style={styles.import} title={entropyButtonText} onPress={navigateToEntropy} />
          )} */}
          <BlueSpacing20 />
          {!isLoading ? (
            <>
            <BlueSpacing20 />
              <Button
                testID="Create"
                title={loc.wallets.add_create}
                disabled={
                  !selectedWalletType || (selectedWalletType === ButtonSelected.OFFCHAIN && (walletBaseURI ?? '').trim().length === 0)
                }
                onPress={createMarsWallet}
              />
              <BlueSpacing40 />
              <BlueSpacing40 />
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </KeyboardAvoidingView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  label: {
    flexDirection: 'row',
    borderWidth: 1,
    borderBottomWidth: 0.5,
    minHeight: 44,
    height: 44,
    marginHorizontal: 20,
    alignItems: 'center',
    marginVertical: 16,
    borderRadius: 4,
  },
  textInputCommon: {
    flex: 1,
    marginHorizontal: 8,
    color: '#81868e',
  },
  buttons: {
    flexDirection: 'column',
    marginHorizontal: 20,
    marginTop: 26,
    borderWidth: 0,
    minHeight: 100,
  },
  button: {
    width: '100%',
    height: 'auto',
  },
  advanced: {
    marginHorizontal: 20,
  },
  advancedText: {
    fontWeight: '500',
  },
  infoText: {
    marginHorizontal: 66,
    marginBottom: 5,
    textAlign: 'center',
    fontSize: 18,
    fontWeight:'500',
    fontFamily: 'Orbitron-SemiBold',
    letterSpacing: 1.5, 
    color:'white'
  },
  infoTextAlert: {
    marginHorizontal: 66,
    marginTop: 15,
    textAlign: 'center',
    fontSize: 18,
    fontWeight:'800',
    fontFamily: 'Orbitron-SemiBold',
    letterSpacing: 1.5, 
    color:'#FF7400'
  },
  lndUri: {
    flexDirection: 'row',
    borderWidth: 1,
    borderBottomWidth: 0.5,
    minHeight: 44,
    height: 44,
    alignItems: 'center',
    marginVertical: 16,
    borderRadius: 4,
  },
  import: {
    marginVertical: 24,
  },
  noPadding: {
    paddingHorizontal: 0,
  },
  imageLG: {
    position: 'absolute', // changed from 'relative' to 'absolute'
    top: 0,
    left: 0,
    width: '100%',
    height: '120%',
    zIndex: -1,
    resizeMode: 'cover'
},
});

export default WalletsCivicAdd;
