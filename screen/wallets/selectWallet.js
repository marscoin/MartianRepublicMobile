import React, { useContext, useEffect, useState } from 'react';
import { View, ActivityIndicator, Image, Text, TouchableOpacity, I18nManager, FlatList, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useRoute, useNavigation, useNavigationState } from '@react-navigation/native';

import { BlueText, BlueSpacing20, BluePrivateBalance } from '../../BlueComponents';
import navigationStyle from '../../components/navigationStyle';
import WalletGradient from '../../class/wallet-gradient';
import loc, { formatBalance, transactionTimeToReadable } from '../../loc';
import { LightningLdkWallet, MultisigHDWallet, LightningCustodianWallet } from '../../class';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useTheme } from '../../components/themes';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import SafeArea from '../../components/SafeArea';
import { removeTrailingZeros } from '../../loc';

const SelectWallet = () => {
  const { chainType, onWalletSelect, availableWallets, noWalletExplanationText } = useRoute().params;
  const [isLoading, setIsLoading] = useState(true);
  const { pop, navigate, setOptions, getParent } = useNavigation();
  const { wallets } = useContext(BlueStorageContext);
  const { colors, closeImage } = useTheme();
  const isModal = useNavigationState(state => state.routes.length) === 1;
  let data = chainType
    ? wallets.filter(item => item.chain === chainType && item.allowSend())
    : wallets.filter(item => item.allowSend()) || [];

  if (availableWallets && availableWallets.length > 0) {
    // availableWallets if provided, overrides chainType argument and `allowSend()` check
    data = availableWallets;
  }
  const styles = StyleSheet.create({
    loading: {
      flex: 1,
      justifyContent: 'center',
      alignContent: 'center',
      paddingTop: 20,
      backgroundColor: colors.background,
    },
    itemRoot: {
      backgroundColor: 'transparent',
      padding: 10,
      marginVertical: 15,
      height: 180, 
      marginHorizontal: 10
    },
    gradient: {
      padding: 15,
      borderRadius: 10,
      minHeight: 164,
      height: 180,
      elevation: 5,
      marginHorizontal: 10
    },
    image: {
      width: 150,
      height: 150,
      position: 'absolute',
      bottom: 0,
      right: 0,
    },
    transparentText: {
      fontFamily: 'Orbitron-Bold',
    },
    label: {
      fontSize: 19,
      color: 'black',
      writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
      fontFamily: 'Orbitron-Bold',
    },
    balance: {
      fontWeight: 'bold',
      fontFamily: 'Orbitron-Bold',
      fontSize: 36,
      writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
      color: 'black',
    },
    latestTxLabel: {
      fontSize: 13,
      color: 'black',
      writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
      fontFamily: 'Orbitron-Regular',
    },
    latestTxValue: {
      fontWeight: 'bold',
      fontSize: 16,
      writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
      fontFamily: 'Orbitron-Regular',
      color: 'black',
    },
    noWallets: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 20,
    },
    center: {
      textAlign: 'center',
    },
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 34,
    },
    text: {
      fontSize: 30,
      fontWeight: '900',
      fontFamily: 'Orbitron-Black', 
    },
    chooseText: {
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '600',
      fontFamily: 'Orbitron-Black', 
      marginTop: 40
    },
    line: {
      position: 'absolute',
      top: 3, 
      left: 2,
      right: 2,
      height: 4,
      backgroundColor: 'black',
    },
    imageGold: {
      position: 'absolute', 
      top: 10,
      left: 20,
      right: 0,
      width: '94%',
      // height: '100%',
      zIndex: -1,
      resizeMode:'stretch',
      padding: 12,
      borderRadius: 12,
      minHeight: 164,
      height: 180 
  },
  });

  const MarscoinSymbol = () => (
    <View style={styles.container}>
      <Text style={styles.text}>M</Text>
      <View style={styles.line} />
    </View>
  );

  useEffect(() => {
    console.log('SelectWallet - useEffect');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading || data.length === 0) {
      setOptions({ statusBarStyle: 'light' });
    } else {
      setOptions({ statusBarStyle: 'auto' });
    }
  }, [isLoading, data.length, setOptions]);

  useEffect(() => {
    setOptions(
      isModal
        ? {
            headerLeft: () => (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.button}
                onPress={() => {
                  getParent().pop();
                }}
                testID="NavigationCloseButton"
              >
                <Image source={closeImage} />
              </TouchableOpacity>
            ),
          }
        : {},
    );
  }, [closeImage, isModal, styles.button]);

  const renderItem = ({ item }) => {
    const prebalance = Number((item.getBalance()))/100000000
    const balance = !item.hideBalance && (removeTrailingZeros(prebalance) );
   
    return (
      <TouchableOpacity
        onPress={() => {
          triggerHapticFeedback(HapticFeedbackTypes.Selection);
          onWalletSelect(item, { navigation: { pop, navigate } });
        }}
        accessibilityRole="button"
      >
        {/* /////CIVIC WALLET DESIGN////// */}
        {item.civic &&
        <View style={styles.itemRoot}>
          <Image style={styles.imageGold} source={require('../../img/gold3.jpeg')} />
          <View style={styles.gradient}>
            <Text style={styles.transparentText} />
            <Text style={styles.label}>
              {item.getLabel()}
            </Text>
            {item.hideBalance ? (
              <BluePrivateBalance />
            ) : (
              <Text numberOfLines={1} style={styles.balance}>
                 <MarscoinSymbol />
                  {' '}
                  {balance}  
              </Text>
            )}
            <Text style={styles.transparentText} />
            <Text numberOfLines={1} style={styles.latestTxLabel}>
              {loc.wallets.list_latest_transaction}
            </Text>
            <Text numberOfLines={1} style={styles.latestTxValue}>
              {transactionTimeToReadable(item.getLatestTransactionTime())}
            </Text>
          </View>
        </View>}

        {/* /////OTHER WALLETS DESIGN////// */}
        {!item.civic &&
        <View style={styles.itemRoot}>
          <LinearGradient colors={WalletGradient.gradientsFor(item.type)} style={styles.gradient}>
            <Image
              source={(() => {
                switch (item.type) {
                  case LightningLdkWallet.type:
                  case LightningCustodianWallet.type:
                    return I18nManager.isRTL ? require('../../img/lnd-shape-rtl.png') : require('../../img/lnd-shape.png');
                  case MultisigHDWallet.type:
                    return I18nManager.isRTL ? require('../../img/vault-shape-rtl.png') : require('../../img/vault-shape.png');
                  default:
                    return I18nManager.isRTL ? require('../../img/marscoin_transparent2.png') : require('../../img/marscoin_transparent2.png');
                }
              })()}
              style={styles.image}
            />

            <Text style={styles.transparentText} />
            <Text numberOfLines={1} style={styles.label}>
              {item.getLabel()}
            </Text>
            {item.hideBalance ? (
              <BluePrivateBalance />
            ) : (
              <Text numberOfLines={1} style={styles.balance}>
                 <MarscoinSymbol />
                  {' '}
                  {balance}  
              </Text>
            )}
            <Text style={styles.transparentText} />
            <Text numberOfLines={1} style={styles.latestTxLabel}>
              {loc.wallets.list_latest_transaction}
            </Text>
            <Text numberOfLines={1} style={styles.latestTxValue}>
              {transactionTimeToReadable(item.getLatestTransactionTime())}
            </Text>
          </LinearGradient>
        </View>}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  } else if (data.length <= 0) {
    return (
      <SafeArea>
        <View style={styles.noWallets}>
          <BlueText style={styles.center}>{loc.wallets.select_no_bitcoin}</BlueText>
          <BlueSpacing20 />
          <BlueText style={styles.center}>{noWalletExplanationText || loc.wallets.select_no_bitcoin_exp}</BlueText>
        </View>
      </SafeArea>
    );
  } else {
    return (
      <SafeArea>
        <BlueText style={styles.chooseText}>Choose a wallet</BlueText>
        <FlatList extraData={data} data={data} renderItem={renderItem} keyExtractor={(_item, index) => `${index}`} />
      </SafeArea>
    );
  }
};

SelectWallet.navigationOptions = navigationStyle({}, opts => ({ ...opts, headerTitle: loc.wallets.select_wallet }));

export default SelectWallet;
