import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { esplora, getSwapServices } from '../../blue_modules/swap';
import { isBitcoinAddress } from '../../blue_modules/swap/btc-wallet';
import { formatBtc, formatSats } from '../../blue_modules/swap/present';
import { CivicButton } from '../../components/CivicUi';
import QRCodeComponent from '../../components/QRCodeComponent';
import { SectionHeading, WorkspaceField, WorkspaceNotice, WorkspaceScreen, styles } from '../workspace/WorkspaceUi';
import { Copyable, Row, swapStyles, useSwapWallet } from './SwapUi';

// The Bitcoin side of the wallet: receive to fund a swap, or send it elsewhere.
export default function BtcWallet() {
  const wallet = useSwapWallet();
  const [funds, setFunds] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError('');
    try {
      setFunds(await getSwapServices(wallet).btcWallet.sync());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // A payment shows here within seconds of being sent, well before its
      // first confirmation, so keep looking while the screen is open.
      const timer = setInterval(() => {
        getSwapServices(wallet)
          .btcWallet.sync()
          .then(setFunds)
          .catch(() => {});
      }, 15000);
      return () => clearInterval(timer);
    }, [refresh, wallet]),
  );

  if (!wallet) {
    return (
      <WorkspaceScreen title="Bitcoin" eyebrow="MARTIAN REPUBLIC / EXCHANGE">
        <WorkspaceNotice>Create or restore a Marscoin wallet first.</WorkspaceNotice>
      </WorkspaceScreen>
    );
  }

  const everything = amount.trim() === '';
  const send = async () => {
    const address = to.trim();
    if (!isBitcoinAddress(address)) return Alert.alert('Check the address', 'That is not a valid Bitcoin address.');
    const sats = everything ? null : Number(amount.trim());
    if (!everything && (!/^\d+$/.test(amount.trim()) || sats <= 0))
      return Alert.alert('Check the amount', 'Enter a whole number of sats, or leave it empty to send everything.');
    setSending(true);
    try {
      const { btcWallet } = getSwapServices(wallet);
      const [fresh, feeRate] = await Promise.all([btcWallet.sync(), esplora.feeRate()]);
      const payment = btcWallet.createPayment({
        utxos: fresh.utxos,
        to: address,
        amount: sats,
        feeRate,
        changeAddress: fresh.changeAddress,
        sweep: everything,
      });
      Alert.alert(`Send ${formatSats(payment.amount)}?`, `To ${address}\nNetwork fee ${formatSats(payment.fee)}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            try {
              await esplora.broadcast(payment.hex);
              setTo('');
              setAmount('');
              Alert.alert('Bitcoin sent', payment.txid);
              refresh();
            } catch (failure) {
              Alert.alert('Not sent', failure.message);
            } finally {
              setSending(false);
            }
          },
        },
      ]);
    } catch (failure) {
      Alert.alert('Not sent', failure.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <WorkspaceScreen title="Bitcoin" eyebrow="MARTIAN REPUBLIC / EXCHANGE" refreshing={loading} onRefresh={refresh}>
      <Text style={styles.secondaryText}>
        A Bitcoin wallet inside your Marscoin wallet, for swaps. It is secured by the same recovery phrase, so your existing backup already
        covers it.
      </Text>
      {error ? (
        <WorkspaceNotice error action="Try again" onPress={refresh}>
          {error}
        </WorkspaceNotice>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.caption}>BALANCE</Text>
        <Text style={swapStyles.amount}>{funds ? formatSats(funds.balance) : loading ? 'Checking…' : '—'}</Text>
        {funds ? <Text style={styles.secondaryText}>{formatBtc(funds.balance)}</Text> : null}
        {funds && funds.incoming > 0 ? (
          <>
            <Row label="Incoming" value={formatSats(funds.incoming)} strong />
            <Text style={styles.caption}>
              Seen on the Bitcoin network and included in your balance. Its first confirmation usually takes 10 to 30 minutes; you can
              reserve an offer meanwhile.
            </Text>
          </>
        ) : null}
      </View>

      {funds ? (
        <>
          <SectionHeading title="Receive" />
          <View style={swapStyles.qr}>
            <QRCodeComponent value={`bitcoin:${funds.receiveAddress}`} size={200} isLogoRendered={false} isMenuAvailable={false} ecl="M" />
          </View>
          <Copyable label="Your Bitcoin address" value={funds.receiveAddress} />
          <Text style={styles.caption}>
            Send only Bitcoin (BTC) on the Bitcoin network to this address. A small amount is enough: offers start around a few thousand
            sats.
          </Text>

          <SectionHeading title="Send" />
          <WorkspaceField label="Bitcoin address" value={to} onChangeText={setTo} autoCapitalize="none" autoCorrect={false} />
          <WorkspaceField
            label="Amount in sats"
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            hint="Leave empty to send the whole balance."
          />
          <CivicButton
            title={sending ? 'Preparing…' : 'Review and send'}
            secondary
            disabled={sending || !to.trim() || funds.balance <= 0}
            onPress={send}
          />
        </>
      ) : null}
    </WorkspaceScreen>
  );
}
