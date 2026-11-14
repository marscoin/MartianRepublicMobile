import React, { useContext, useEffect, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { PayjoinClient } from 'payjoin-client';
import PayjoinTransaction from '../../class/payjoin-transaction';
import navigationStyle from '../../components/navigationStyle';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import Biometric from '../../class/biometrics';
import loc, { formatBalanceWithoutSuffix } from '../../loc';
import Notifications from '../../blue_modules/notifications';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import presentAlert from '../../components/Alert';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import { NEXT_BLOCK_TEXT } from '../../blue_modules/mars-fee-text';
import {
  AddressText,
  CardLabel,
  Divider,
  FigureRow,
  HeaderAction,
  HeroAmount,
  IconTile,
  Rise,
  SendButton,
  SendCard,
  SendHeader,
  TimingLine,
  sendColors,
  styles as shared,
  useReduceMotion,
} from '../../components/send/SendUi';
import { fiatOfZubrins, marsText, ownWalletLabel } from '../../components/send/sendFormat';

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
  const { navigate } = useNavigation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  useEffect(() => {


    Biometric.isBiometricUseCapableAndEnabled().then(setIsBiometricUseCapableAndEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The raw transaction, for those who want to see it. Asks for Face ID or
  // Touch ID first when that is switched on.
  const openDetails = async () => {
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
  };

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
        // What the "sent" screen shows besides the amount.
        txid: isPayjoinEnabled ? undefined : txid,
        recipients: recipients.map(recipient => ({ address: recipient.address, value: recipient.value })),
        marsRate: params.marsRate,
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

  const usdRate = params.marsRate;
  const amountSats = recipients.reduce((sum, recipient) => sum + recipient.value, 0);
  const totalSats = new Bignumber(amountSats).plus(feeSatoshi).toNumber();
  const many = recipients.length > 1;
  const fiatNote = zubrins => fiatOfZubrins(zubrins, usdRate) || undefined;
  const amountFiat = fiatOfZubrins(amountSats, usdRate);
  // The amount is repeated on the button while it is short enough to fit a narrow phone.
  const sendTitle = marsText(amountSats).length <= 8 ? `Send ${marsText(amountSats)} MARS` : 'Send payment';

  return (
    <View style={shared.screen} testID="ConfirmScreen">
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]}
        alwaysBounceVertical={false}
      >
        <SendHeader
          overline="MCR / SEND"
          title="Review payment"
          onBack={() => navigation.goBack()}
          backTestID="ConfirmBack"
          right={
            <HeaderAction
              icon="file-text"
              label={loc.send.create_details}
              onPress={openDetails}
              disabled={isLoading}
              testID="TransactionDetailsButton"
            />
          }
        />

        <Rise still={reduceMotion} style={styles.hero}>
          <CardLabel style={styles.heroLabel}>YOU ARE SENDING</CardLabel>
          <HeroAmount
            amount={marsText(amountSats)}
            fiat={amountFiat ? `≈ ${amountFiat}` : null}
            testID={many ? 'TransactionTotalValue' : 'TransactionValue'}
            fiatTestID="TransactionFiat"
          />
        </Rise>

        <Rise still={reduceMotion} delay={60} style={styles.cards}>
          <SendCard style={styles.to}>
            <CardLabel>{many ? `TO ${recipients.length} RECIPIENTS` : 'TO'}</CardLabel>
            {recipients.map((recipient, index) => {
              const own = ownWalletLabel(recipient.address, wallets);
              return (
                <View key={`${recipient.address}-${index}`} style={[styles.recipient, index > 0 && styles.recipientNext]}>
                  <IconTile icon="arrow-up-right" />
                  <View style={styles.recipientText}>
                    <AddressText address={recipient.address} testID="TransactionAddress" />
                    {many ? (
                      <Text style={styles.recipientAmount} testID="TransactionValue">
                        {marsText(recipient.value)} MARS
                      </Text>
                    ) : null}
                    {own ? (
                      <Text style={styles.own} testID="ConfirmOwnAddress">
                        One of your own addresses · {own}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {memo ? (
              <>
                <Divider />
                <CardLabel>NOTE · ONLY YOU SEE IT</CardLabel>
                <Text style={styles.memo} testID="ConfirmMemo">
                  {memo}
                </Text>
              </>
            ) : null}
          </SendCard>

          <SendCard style={styles.figures}>
            <FigureRow label="From" value={wallet.getLabel()} testID="ConfirmFromWallet" />
            <Divider />
            <FigureRow label="Amount" value={`${marsText(amountSats, { fixed: true })} MARS`} note={fiatNote(amountSats)} />
            <FigureRow
              label="Network fee"
              value={`${new Bignumber(fee).toFixed(8)} MARS`}
              note={fiatNote(feeSatoshi)}
              testID="TransactionFee"
            />
            <Divider />
            <FigureRow
              label="Total"
              value={`${marsText(totalSats, { fixed: true })} MARS`}
              note={fiatNote(totalSats)}
              strong
              testID="TransactionTotal"
            />
          </SendCard>

          {payjoinUrl ? (
            <SendCard style={styles.payjoin}>
              <Text style={styles.payjoinText}>Payjoin</Text>
              <Switch
                testID="PayjoinSwitch"
                value={isPayjoinEnabled}
                onValueChange={setIsPayjoinEnabled}
                trackColor={{ false: sendColors.border, true: sendColors.orange }}
                thumbColor={sendColors.text}
                ios_backgroundColor={sendColors.border}
              />
            </SendCard>
          ) : null}

          <TimingLine style={styles.timing}>{NEXT_BLOCK_TEXT} Once sent, a payment cannot be taken back.</TimingLine>
        </Rise>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <SendButton
          title="Back"
          secondary
          onPress={() => navigation.goBack()}
          disabled={isLoading}
          testID="ConfirmBackButton"
          style={styles.back}
        />
        <SendButton
          title={isElectrumDisabled ? 'Offline mode is on' : sendTitle}
          icon={isElectrumDisabled ? undefined : 'arrow-up-right'}
          disabled={isElectrumDisabled}
          busy={isLoading}
          onPress={send}
          testID="ConfirmSendButton"
          style={styles.send}
        />
      </View>
    </View>
  );
};

export default Confirm;

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', paddingTop: 28, paddingBottom: 26 },
  heroLabel: { marginBottom: 6 },
  cards: { gap: 12 },
  to: { gap: 12 },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recipientNext: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: sendColors.border },
  recipientText: { flex: 1, gap: 3 },
  recipientAmount: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, fontVariant: ['tabular-nums'] },
  own: { color: sendColors.good, fontSize: 13, lineHeight: 18 },
  memo: { color: sendColors.text, fontSize: 15, lineHeight: 21, marginTop: 4 },
  figures: { paddingVertical: 10 },
  payjoin: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  payjoinText: { color: sendColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  timing: { marginTop: 4, paddingHorizontal: 4 },
  bar: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sendColors.hairline,
    backgroundColor: sendColors.background,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  back: { flex: 1 },
  send: { flex: 2.4 },
});

Confirm.navigationOptions = navigationStyle({}, opts => ({ ...opts, title: loc.send.confirm_header }));
