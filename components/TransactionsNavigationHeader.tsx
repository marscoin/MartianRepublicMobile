import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { Image, Text, TouchableOpacity, View, I18nManager, StyleSheet } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import LinearGradient from 'react-native-linear-gradient';
import { AbstractWallet, HDSegwitBech32Wallet, LightningCustodianWallet, LightningLdkWallet, MultisigHDWallet } from '../class';
import { BitcoinUnit } from '../models/bitcoinUnits';
import WalletGradient from '../class/wallet-gradient';
import Biometric from '../class/biometrics';
import loc, { formatBalance } from '../loc';
import { BlueStorageContext } from '../blue_modules/storage-context';
import ToolTipMenu from './TooltipMenu';
import { BluePrivateBalance, BlueSpacing10, BlueSpacing20 } from '../BlueComponents';
import { FiatUnit } from '../models/fiatUnit';
import WalletAddresses from '../screen/wallets/addresses';
import { removeTrailingZeros } from '../loc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {EXCHANGE_RATES_STORAGE_KEY} from '../blue_modules/currency';
import { MarsElectrumWallet } from '../screen/wallets/mars-wallet';
import { Icon } from 'react-native-elements';

interface TransactionsNavigationHeaderProps {
  wallet: MarsElectrumWallet;
  onWalletUnitChange?: (wallet: any) => void;
  navigation: {
    navigate: (route: string, params?: any) => void;
    goBack: () => void;
  };
  onManageFundsPressed?: (id: string) => void; // Add a type definition for this prop
  actionKeys: {
    CopyToClipboard: 'copyToClipboard';
    WalletBalanceVisibility: 'walletBalanceVisibility';
    Refill: 'refill';
    RefillWithExternalWallet: 'qrcode';
  };
}
const stylesM = StyleSheet.create({
  container: {
    height: 36,
    //backgroundColor: 'green'
  },
  text: {
    fontSize: 36,
    fontWeight: '700',
    fontFamily: 'Orbitron-Black', 
  },
  line: {
    position: 'absolute',
    top: 3, // Adjust top as needed
    left: 2,
    right: 2,
    height: 4,
    backgroundColor: 'black',
  },
});
const MarscoinSymbol = () => (
  <View style={stylesM.container}>
    <Text style={stylesM.text}>M</Text>
    <View style={stylesM.line} />
  </View>
);

const TransactionsNavigationHeader: React.FC<TransactionsNavigationHeaderProps> = ({
  // @ts-ignore: Ugh
  wallet: initialWallet,
  // @ts-ignore: Ugh
  onWalletUnitChange,
  // @ts-ignore: Ugh
  navigation,
  // @ts-ignore: Ugh
  onManageFundsPressed,
}) => {
  const [wallet, setWallet] = useState(initialWallet);
  const [marsRate, setMarsRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allowOnchainAddress, setAllowOnchainAddress] = useState(false);

  const { preferredFiatCurrency, saveToDisk } = useContext(BlueStorageContext);
  const menuRef = useRef(null);

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
  // useEffect(() => {
  //   console.log('Updated Marscoin rate', marsRate);
  // }, [marsRate]);

  const verifyIfWalletAllowsOnchainAddress = useCallback(() => {
    if (wallet.type === LightningCustodianWallet.type) {
      wallet
        .allowOnchainAddress()
        .then((value: boolean) => setAllowOnchainAddress(value))
        .catch((e: Error) => {
          console.log('This Lndhub wallet does not have an onchain address API.');
          setAllowOnchainAddress(false);
        });
    }
  }, [wallet]);

  useEffect(() => {
    setWallet(initialWallet);
  }, [initialWallet]);

  useEffect(() => {
    verifyIfWalletAllowsOnchainAddress();
  }, [wallet, verifyIfWalletAllowsOnchainAddress]);

  const handleCopyPress = () => {
    const value = formatBalance(wallet.getBalance(), wallet.getPreferredBalanceUnit());
    if (value) {
      Clipboard.setString(value);
    }
  };

  const updateWalletVisibility = (w: AbstractWallet, newHideBalance: boolean) => {
    w.hideBalance = newHideBalance;
    return w;
  };

  const handleBalanceVisibility = async () => {
    const isBiometricsEnabled = await Biometric.isBiometricUseCapableAndEnabled();

    if (isBiometricsEnabled && wallet.hideBalance) {
      if (!(await Biometric.unlockWithBiometrics())) {
        return navigation.goBack();
      }
    }

    const updatedWallet = updateWalletVisibility(wallet, !wallet.hideBalance);
    setWallet(updatedWallet);
    saveToDisk();
  };

  const handleManageFundsPressed = () => {
    onManageFundsPressed?.(actionKeys.Refill);
  };

  const handleOnPaymentCodeButtonPressed = () => {
    navigation.navigate('PaymentCodeRoot', {
      screen: 'PaymentCode',
      params: { paymentCode: (wallet as HDSegwitBech32Wallet).getBIP47PaymentCode() },
    });
  };

  const onPressMenuItem = (id: string) => {
    if (id === 'walletBalanceVisibility') {
      handleBalanceVisibility();
    } else if (id === 'copyToClipboard') {
      handleCopyPress();
    }
  };

  const [balanceMode, setBalanceMode] = useState('balance');

  const toggleBalanceDisplay = () => {
    setBalanceMode(prevMode => {
      if (prevMode === 'balance') return 'balanceZub';
      if (prevMode === 'balanceZub') return 'balanceUSD';
      return 'balance';
    });
  };

  const getDisplayBalance = () => {
    const balance = wallet.getBalance();
    const balanceZub = wallet.getBalance().toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ';
    const balanceMARS = removeTrailingZeros(balance / 100000000);
    const balanceUSD = (balance / 100000000 * marsRate).toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (balanceMode === 'balance') 
      return (
        <View style={styles.balanceCont}>
            <Text
              testID="WalletBalance"
              numberOfLines={1}
              //adjustsFontSizeToFit
              style={styles.walletBalance}
            >
              <MarscoinSymbol />
              {' '}
              {balanceMARS}
            </Text>
        </View>
      );
    if (balanceMode === 'balanceZub') 
      return (
        <View style={[styles.balanceCont, {flexDirection:'row', paddingRight: 60}]}>
          <Text
              testID="WalletBalance"
              numberOfLines={1}
              //adjustsFontSizeToFit
              style={[styles.walletBalance, {fontSize: 30}]}
            >
              {balanceZub}
          </Text>
          <Text
              testID="WalletBalance"
              numberOfLines={1}
              //adjustsFontSizeToFit
              style={[styles.walletBalance, {fontSize: 20, alignSelf:'flex-end', marginBottom: 5}]}
            >
              zubrin
          </Text>
        
        </View>
      )
    
    if (balanceUSD) {
        // return `$ ${balanceUSD}`;
        return (
          <View style={styles.balanceCont}>
              <Text
                testID="WalletBalance"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={styles.walletBalance}
              >
                {`$ ${balanceUSD}`}
              </Text>
          </View>
        );
    } else {
        return "Rate unavailable";
    }
  };
  const RegularHeaderLayout = () => (
    <LinearGradient
        colors={WalletGradient.gradientsFor(wallet.type)}
        style={styles.lineaderGradient}
        {...WalletGradient.linearGradientProps(wallet.type)}
      >
        <Image
          source={(() => {
            switch (wallet.type) {
              case LightningLdkWallet.type:
              case LightningCustodianWallet.type:
                return I18nManager.isRTL ? require('../img/lnd-shape-rtl.png') : require('../img/lnd-shape.png');
              case MultisigHDWallet.type:
                return I18nManager.isRTL ? require('../img/vault-shape-rtl.png') : require('../img/vault-shape.png');
              default:
                return wallet.civic ? require('../img/passport.png') : require('../img/marscoin_transparent2.png');
            }
          })()}
          style={styles.chainIcon}
        />

        <Text testID="WalletLabel" numberOfLines={1} style={styles.walletLabel}>
          {wallet.getLabel()}
        </Text>
        <Text testID="WalletLabel" numberOfLines={1} style={styles.address}>
          {wallet.getAddress()}
        </Text>
      
      <TouchableOpacity onPress={toggleBalanceDisplay}>
          <Text style={styles.walletBalance}>
            {getDisplayBalance()}
          </Text>
        </TouchableOpacity>
        
        {wallet.type === LightningCustodianWallet.type && allowOnchainAddress && (
          <ToolTipMenu
            isMenuPrimaryAction
            isButton
            onPressMenuItem={handleManageFundsPressed}
            actions={[
              {
                id: actionKeys.Refill,
                text: loc.lnd.refill,
                icon: actionIcons.Refill,
              },
              {
                id: actionKeys.RefillWithExternalWallet,
                text: loc.lnd.refill_external,
                icon: actionIcons.RefillWithExternalWallet,
              },
            ]}
            buttonStyle={styles.manageFundsButton}
          >
            <Text style={styles.manageFundsButtonText}>{loc.lnd.title}</Text>
          </ToolTipMenu>
        )}

        {wallet.allowBIP47() && wallet.isBIP47Enabled() && (
          <TouchableOpacity accessibilityRole="button" onPress={handleOnPaymentCodeButtonPressed}>
            <View style={styles.manageFundsButton}>
              <Text style={styles.manageFundsButtonText}>{loc.bip47.payment_code}</Text>
            </View>
          </TouchableOpacity>
        )}
        {wallet.type === LightningLdkWallet.type && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={loc.lnd.title} onPress={handleManageFundsPressed}>
            <View style={styles.manageFundsButton}>
              <Text style={styles.manageFundsButtonText}>{loc.lnd.title}</Text>
            </View>
          </TouchableOpacity>
        )}
        {wallet.type === MultisigHDWallet.type && (
          <TouchableOpacity accessibilityRole="button" onPress={handleManageFundsPressed}>
            <View style={styles.manageFundsButton}>
              <Text style={styles.manageFundsButtonText}>{loc.multisig.manage_keys}</Text>
            </View>
          </TouchableOpacity>
        )}
      </LinearGradient>
    )

    const CivicHeaderLayout = () => (
      <View style={styles.lineaderGradient}>
      <Image style={styles.imageGold} source={require('../img/gold3.jpeg')} />

          {/* <Image
            source={(() => {
              switch (wallet.type) {
                case LightningLdkWallet.type:
                case LightningCustodianWallet.type:
                  return I18nManager.isRTL ? require('../img/lnd-shape-rtl.png') : require('../img/lnd-shape.png');
                case MultisigHDWallet.type:
                  return I18nManager.isRTL ? require('../img/vault-shape-rtl.png') : require('../img/vault-shape.png');
                default:
                  return wallet.civic ? require('../img/passport.png') : require('../img/marscoin_transparent2.png');
              }
            })()}
            style={styles.chainIconCivic}
          /> */}
  
          <Text testID="WalletLabel" numberOfLines={1} style={styles.walletLabel}>
            {wallet.getLabel()}
          </Text>
          <Text testID="WalletLabel" numberOfLines={1} style={styles.address}>
            {wallet.getAddress()}
          </Text>
          <BlueSpacing20/>
        <TouchableOpacity onPress={toggleBalanceDisplay}>
            <Text style={styles.walletBalance}>
              {getDisplayBalance()}
            </Text>
          </TouchableOpacity>
          <BlueSpacing10/>
          {wallet.type === LightningCustodianWallet.type && allowOnchainAddress && (
            <ToolTipMenu
              isMenuPrimaryAction
              isButton
              onPressMenuItem={handleManageFundsPressed}
              actions={[
                {
                  id: actionKeys.Refill,
                  text: loc.lnd.refill,
                  icon: actionIcons.Refill,
                },
                {
                  id: actionKeys.RefillWithExternalWallet,
                  text: loc.lnd.refill_external,
                  icon: actionIcons.RefillWithExternalWallet,
                },
              ]}
              buttonStyle={styles.manageFundsButton}
            >
              <Text style={styles.manageFundsButtonText}>{loc.lnd.title}</Text>
            </ToolTipMenu>
          )}
  
          {wallet.allowBIP47() && wallet.isBIP47Enabled() && (
            <TouchableOpacity accessibilityRole="button" onPress={handleOnPaymentCodeButtonPressed}>
              <View style={styles.manageFundsButton}>
                <Text style={styles.manageFundsButtonText}>{loc.bip47.payment_code}</Text>
              </View>
            </TouchableOpacity>
          )}
          {wallet.type === LightningLdkWallet.type && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={loc.lnd.title} onPress={handleManageFundsPressed}>
              <View style={styles.manageFundsButton}>
                <Text style={styles.manageFundsButtonText}>{loc.lnd.title}</Text>
              </View>
            </TouchableOpacity>
          )}
          {wallet.type === MultisigHDWallet.type && (
            <TouchableOpacity accessibilityRole="button" onPress={handleManageFundsPressed}>
              <View style={styles.manageFundsButton}>
                <Text style={styles.manageFundsButtonText}>{loc.multisig.manage_keys}</Text>
              </View>
            </TouchableOpacity>
          )}
  </View>
      )  


    
    return wallet.civic ? <CivicHeaderLayout /> : <RegularHeaderLayout />;
    
  
};

const styles = StyleSheet.create({
  lineaderGradient: {
    padding: 15,
    minHeight: 140,
    justifyContent: 'center',
  },
  chainIcon: {
    width: 150,
    height: 150,
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  chainIconCivic: {
    width: 180,
    height: 180,
    position: 'absolute',
    bottom: 10,
    right: 20,
  },
  walletLabel: {
    backgroundColor: 'transparent',
    fontSize: 19,
    color: 'black',
    fontFamily: 'Orbitron-Black',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  address: {
    backgroundColor: 'transparent',
    fontSize: 14,
    color: 'black',
    fontFamily: 'Orbitron-Regular',
    marginTop: 10,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  walletBalance: {
    fontWeight: 'bold',
    // maxWidth: '60%',
    fontFamily: 'Orbitron-Black',
    fontSize: 36,
    color: 'black',
    marginTop: 5,
    //marginBottom: 3,
  },
  balanceCont:{
    height: 45,
    alignItems: 'flex-start',
    //maxWidth: '80%',
  },
  manageFundsButton: {
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 9,
    minHeight: 39,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manageFundsButtonText: {
    fontWeight: '500',
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Orbitron-Black',
    padding: 12,
  },
  imageGold: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '108%',
    zIndex: -1,
    resizeMode:'stretch',
    padding: 12,
    minHeight: 164,
    height: 150 
},
});

export const actionKeys = {
  CopyToClipboard: 'copyToClipboard',
  WalletBalanceVisibility: 'walletBalanceVisibility',
  Refill: 'refill',
  RefillWithExternalWallet: 'qrcode',
};

export const actionIcons = {
  Eye: {
    iconType: 'SYSTEM',
    iconValue: 'eye',
  },
  EyeSlash: {
    iconType: 'SYSTEM',
    iconValue: 'eye.slash',
  },
  Clipboard: {
    iconType: 'SYSTEM',
    iconValue: 'doc.on.doc',
  },
  Refill: {
    iconType: 'SYSTEM',
    iconValue: 'goforward.plus',
  },
  RefillWithExternalWallet: {
    iconType: 'SYSTEM',
    iconValue: 'qrcode',
  },
};

export default TransactionsNavigationHeader;
