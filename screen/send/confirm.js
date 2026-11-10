import React, { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, TouchableOpacity, StyleSheet, Switch, View } from 'react-native';
import { Text } from 'react-native-elements';
import { PayjoinClient } from 'payjoin-client';
import { Icon } from 'react-native-elements';
import PropTypes from 'prop-types';
import PayjoinTransaction from '../../class/payjoin-transaction';
import { BlueText, BlueCard } from '../../BlueComponents';
import navigationStyle from '../../components/navigationStyle';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import Biometric from '../../class/biometrics';
import loc, { formatBalance, formatBalanceWithoutSuffix } from '../../loc';
import Notifications from '../../blue_modules/notifications';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import presentAlert from '../../components/Alert';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import SafeArea from '../../components/SafeArea';
import { satoshiToBTC, satoshiToLocalCurrency } from '../../blue_modules/currency';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MARSConnection = require('../../blue_modules/MARSConnection');
const Bignumber = require('bignumber.js');
const bitcoin = require('bitcoinjs-lib');

const Confirm = () => {
  const navigation = useNavigation();
  const { wallets, fetchAndSaveWalletTransactions, isElectrumDisabled } = useContext(BlueStorageContext);
  const [isBiometricUseCapableAndEnabled, setIsBiometricUseCapableAndEnabled] = useState(false);
  const { params } = useRoute();
  const { recipients = [], walletID, fee, memo, tx, satoshiPerByte, psbt } = params;
  const [isLoading, setIsLoading] = useState(false);
  const [isPayjoinEnabled, setIsPayjoinEnabled] = useState(false);
  const wallet = wallets.find(w => w.getID() === walletID);
  const payjoinUrl = wallet.allowPayJoin() ? params.payjoinUrl : false;
  const feeSatoshi = new Bignumber(fee).multipliedBy(100000000).toNumber();
  const { navigate, setOptions } = useNavigation();
  const { colors } = useTheme();


  const stylesM = StyleSheet.create({
    container: {
      height: 33,
      //backgroundColor: 'green'
    },
    text: {
      fontSize: 33,
      fontWeight: '700',
      fontFamily: 'Orbitron-Black', 
      color:'white'
    },
    line: {
      position: 'absolute',
      top: 3, // Adjust top as needed
      left: 2,
      right: 2,
      height: 4,
      backgroundColor: 'white',
    },
  });
  const MarscoinSymbol = () => (
    <View style={stylesM.container}>
      <Text style={stylesM.text}>M</Text>
      <View style={stylesM.line} />
    </View>
  );
  
  const stylesHook = StyleSheet.create({
    transactionDetailsTitle: {
      color: colors.foregroundColor,
    },
    transactionDetailsSubtitle: {
      color: colors.feeText,
    },
    transactionAmountFiat: {
      color: colors.feeText,
    },
    txDetails: {
      backgroundColor: colors.lightButton,
    },
    valueValue: {
      color: colors.alternativeTextColor2,
    },
    valueUnit: {
      color: colors.buttonTextColor,
    },
    root: {
      backgroundColor: colors.elevated,
    },
    payjoinWrapper: {
      backgroundColor: colors.buttonDisabledBackgroundColor,
    },
  });

  useEffect(() => {


    Biometric.isBiometricUseCapableAndEnabled().then(setIsBiometricUseCapableAndEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setOptions({
      // eslint-disable-next-line react/no-unstable-nested-components
      headerRight: () => (
        <TouchableOpacity
          accessibilityRole="button"
          testID="TransactionDetailsButton"
          style={[styles.txDetails, stylesHook.txDetails]}
          onPress={async () => {
            if (isBiometricUseCapableAndEnabled) {
              if (!(await Biometric.unlockWithBiometrics())) {
                return;
              }
            }

            navigate('CreateTransaction', {
              fee,
              recipients,
              memo,
              tx,
              satoshiPerByte,
              wallet,
              feeSatoshi,
            });
          }}
        >
          <Text style={[styles.txText, stylesHook.valueUnit]}>{loc.send.create_details}</Text>
        </TouchableOpacity>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, fee, feeSatoshi, isBiometricUseCapableAndEnabled, memo, recipients, satoshiPerByte, tx, wallet]);

  /**
   * we need to look into `recipients`, find destination address and return its outputScript
   * (needed for payjoin)
   *
   * @return {string}
   */
  const getPaymentScript = () => {
    return bitcoin.address.toOutputScript(recipients[0].address);
  };

  const send = async () => {
    setIsLoading(true);
    try {
      const txids2watch = [];
      if (!isPayjoinEnabled) {
        if (!(await broadcast(tx))) {
          setIsLoading(false);
          return;
        }
      } else {
        const payJoinWallet = new PayjoinTransaction(psbt, txHex => broadcast(txHex), wallet);
        const paymentScript = getPaymentScript();
        const payjoinClient = new PayjoinClient({
          paymentScript,
          wallet: payJoinWallet,
          payjoinUrl,
        });
        await payjoinClient.run();
        const payjoinPsbt = payJoinWallet.getPayjoinPsbt();
        if (payjoinPsbt) {
          const tx2watch = payjoinPsbt.extractTransaction();
          txids2watch.push(tx2watch.getId());
        }
      }

      const txid = bitcoin.Transaction.fromHex(tx).getId();
      txids2watch.push(txid);
      Notifications.majorTomToGroundControl([], [], txids2watch);
      let amount = 0;
      for (const recipient of recipients) {
        amount += recipient.value;
      }

      amount = formatBalanceWithoutSuffix(amount, BitcoinUnit.BTC, false);
      triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
      navigate('Success', {
        fee: Number(fee),
        amount,
      });

      setIsLoading(false);

      await new Promise(resolve => setTimeout(resolve, 3000)); // sleep to make sure network propagates
      fetchAndSaveWalletTransactions(walletID);
    } catch (error) {
      triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
      setIsLoading(false);
      presentAlert({ message: error.message });
    }
  };

  const broadcast = async transaction => {
    await MARSConnection.ping();
    await MARSConnection.waitTillConnected();

    if (isBiometricUseCapableAndEnabled) {
      if (!(await Biometric.unlockWithBiometrics())) {
        return;
      }
    }

    const result = await wallet.broadcastTx(transaction);
    if (!result) {
      throw new Error(loc.errors.broadcast);
    }

    return result;
  };

  const _renderItem = ({ index, item }) => {
    return (
      <>
        <View style={styles.valueWrap}>
          <Text testID="TransactionValue" style={[styles.valueValue, stylesHook.valueValue]}>
            {(item.value)/100000000}{' '}
          </Text>
          <Text style={[styles.valueUnit, stylesHook.valueValue]}>
            <MarscoinSymbol/>
          </Text>
          {/* <Text style={[styles.valueUnit, stylesHook.valueValue]}>{' MARS'}</Text> */}
        </View>
        <Text style={[styles.transactionAmountFiat, stylesHook.transactionAmountFiat]}>$ {(item.value * params.marsRate /100000000).toFixed(8)}</Text>
        <BlueCard>
          <Text style={[styles.transactionDetailsTitle, stylesHook.transactionDetailsTitle]}>{loc.send.create_to}</Text>
          <Text textAlign='center' testID="TransactionAddress" style={[styles.transactionDetailsSubtitle, stylesHook.transactionDetailsSubtitle]}>
            {item.address}
          </Text>
        </BlueCard>
        {recipients.length > 1 && (
          <BlueText style={styles.valueOf}>{loc.formatString(loc._.of, { number: index + 1, total: recipients.length })}</BlueText>
        )}
      </>
    );
  };
  _renderItem.propTypes = {
    index: PropTypes.number.isRequired,
    item: PropTypes.object.isRequired,
  };

  const renderSeparator = () => {
    return <View style={styles.separator} />;
  };

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <TouchableOpacity 
            style={{flexDirection:'row', justifyContent:'space-between',  marginLeft: 20}}
            onPress={()=>navigation.goBack()}
          >
            <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
          </TouchableOpacity>
      
      <View style={styles.cardTop}>
        <Text style={styles.reviewLabel}>REVIEW PAYMENT</Text>
        <FlatList
          scrollEnabled={recipients.length > 1}
          extraData={recipients}
          data={recipients}
          renderItem={_renderItem}
          keyExtractor={(_item, index) => `${index}`}
          ItemSeparatorComponent={renderSeparator}
        />
        {!!payjoinUrl && (
          <View style={styles.cardContainer}>
            <BlueCard>
              <View style={[styles.payjoinWrapper, stylesHook.payjoinWrapper]}>
                <Text style={styles.payjoinText}>Payjoin</Text>
                <Switch testID="PayjoinSwitch" value={isPayjoinEnabled} onValueChange={setIsPayjoinEnabled} />
              </View>
            </BlueCard>
          </View>
        )}
      </View>
      <View style={styles.cardBottom}>
        <BlueCard>
          <View style={styles.feePanel}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Network fee</Text>
              <Text style={styles.feeValue} testID="TransactionFee">{new Bignumber(fee).toFixed(8)} MARS</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Total</Text>
              <Text style={styles.feeTotal}>{new Bignumber(recipients.reduce((sum, recipient) => sum + recipient.value, 0)).plus(feeSatoshi).dividedBy(100000000).toFixed(8)} MARS</Text>
            </View>
          </View>
          {isLoading ? <ActivityIndicator /> : <Button disabled={isElectrumDisabled} onPress={send} title="Send Marscoin" />}
        </BlueCard>
      </View>
    </SafeArea>
  );
};

export default Confirm;

const styles = StyleSheet.create({
  reviewLabel: { fontFamily: 'ChakraPetch-Bold', color: '#FF924D', fontSize: 12, letterSpacing: 2, marginBottom: 24 },
  feePanel: { minWidth: 280, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#343034', backgroundColor: '#141416', marginBottom: 18 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 16 },
  feeLabel: { fontFamily: 'ChakraPetch-Regular', color: '#B7B1AC', fontSize: 14 },
  feeValue: { fontFamily: 'ChakraPetch-Regular', color: '#F6F3F0', fontSize: 14 },
  feeTotal: { fontFamily: 'ChakraPetch-Bold', color: '#F6F3F0', fontSize: 16 },
  transactionDetailsTitle: {
    fontWeight: '500',
    fontSize: 17,
    marginBottom: 2,
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2
  },
  transactionDetailsSubtitle: {
    fontWeight: '400',
    fontSize: 15,
    marginBottom: 20,
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2,
    alignSelf: 'center'
  },
  transactionAmountFiat: {
    fontWeight: '500',
    fontSize: 15,
    marginVertical: 8,
    textAlign: 'center',
    fontFamily: 'Orbitron-Black',
  },
  valueWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  valueValue: {
    fontSize: 36,
    fontWeight: '700',
    fontFamily: 'Orbitron-Black',
  },
  valueUnit: {
    fontSize: 16,
    marginHorizontal: 4,
    paddingBottom: 6,
    fontWeight: '600',
    alignSelf: 'flex-end',
    fontFamily: 'Orbitron-Black',
  },
  valueOf: {
    alignSelf: 'flex-end',
    marginRight: 18,
    marginVertical: 8,
  },
  separator: {
    height: 0.5,
    margin: 16,
  },
  root: {
    paddingTop: 19,
    justifyContent: 'space-between',
  },
  cardTop: {
    flexGrow: 8,
    marginTop: 16,
    alignItems: 'center',
    maxHeight: '70%',
  },
  cardBottom: {
    flexGrow: 2,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cardContainer: {
    flexGrow: 1,
    width: '100%',
  },
  cardText: {
    flexDirection: 'row',
    color: '#37c0a1',
    fontSize: 14,
    marginVertical: 8,
    marginHorizontal: 24,
    paddingBottom: 6,
    fontWeight: '500',
    alignSelf: 'center',
    fontFamily: 'Orbitron-Black',
  },
  txDetails: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    borderRadius: 8,
    height: 38,
  },
  txText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Orbitron-Black',
  },
  payjoinWrapper: {
    flexDirection: 'row',
    padding: 8,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payjoinText: {
    color: '#81868e',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'Orbitron-Black',
  },
});

Confirm.navigationOptions = navigationStyle({}, opts => ({ ...opts, title: loc.send.confirm_header }));
