import { marsAlert } from '../../components/MarsDialog';
import { hasUnfinishedMakerSwaps, hasUnfinishedSwaps } from '../../blue_modules/swap';
import React, { useEffect, useState, useCallback, useContext, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
  Switch,
  Platform,
  Linking,
  StyleSheet,
  ScrollView,
  InteractionManager,
  ActivityIndicator,
  I18nManager,
} from 'react-native';
import { Icon } from 'react-native-elements';
import { BlueLoading } from '../../BlueComponents';
import navigationStyle from '../../components/navigationStyle';
import HeaderAction from '../../components/HeaderAction';
import { LightningCustodianWallet } from '../../class/wallets/lightning-custodian-wallet';
import Biometric from '../../class/biometrics';
import {
  HDSegwitBech32Wallet,
  SegwitP2SHWallet,
  LegacyWallet,
  SegwitBech32Wallet,
  WatchOnlyWallet,
  MultisigHDWallet,
  HDAezeedWallet,
  LightningLdkWallet,
} from '../../class';
import loc, { formatBalanceWithoutSuffix } from '../../loc';
import { useRoute, navigation, useNavigation } from '@react-navigation/native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import Notifications from '../../blue_modules/notifications';
import { isDesktop } from '../../blue_modules/environment';
import { AbstractHDElectrumWallet } from '../../class/wallets/abstract-hd-electrum-wallet';
import presentAlert from '../../components/Alert';
import { BitcoinUnit, Chain } from '../../models/bitcoinUnits';
import { writeFileAndExport } from '../../blue_modules/fs';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';
import { useTheme } from '../../components/themes';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';

const prompt = require('../../helpers/prompt');

const WalletDetails = (navigation) => {
  const { saveToDisk, wallets, deleteWallet, setSelectedWalletID, txMetadata } = useContext(BlueStorageContext);
  const { walletID } = useRoute().params;
  const [isLoading, setIsLoading] = useState(false);
  const [backdoorPressed, setBackdoorPressed] = useState(0);
  const [backdoorBip47Pressed, setBackdoorBip47Pressed] = useState(0);
  const wallet = useRef(wallets.find(w => w.getID() === walletID)).current;
  const [walletName, setWalletName] = useState(wallet.getLabel());
  const [useWithHardwareWallet, setUseWithHardwareWallet] = useState(wallet.useWithHardwareWalletEnabled());
  const { isAdvancedModeEnabled } = useContext(BlueStorageContext);
  const [isAdvancedModeEnabledRender, setIsAdvancedModeEnabledRender] = useState(false);
  const [isBIP47Enabled, setIsBIP47Enabled] = useState(wallet.isBIP47Enabled());
  const [hideTransactionsInWalletsList, setHideTransactionsInWalletsList] = useState(!wallet.getHideTransactionsInWalletsList());
  const { goBack, navigate, setOptions, popToTop } = useNavigation();
  const { colors } = useTheme();
  const [masterFingerprint, setMasterFingerprint] = useState();
  const walletTransactionsLength = useMemo(() => wallet.getTransactions().length, [wallet]);
  const derivationPath = useMemo(() => {
    try {
      const path = wallet.getDerivationPath();
      return path.length > 0 ? path : null;
    } catch (e) {
      return null;
    }
  }, [wallet]);
  const [lightningWalletInfo, setLightningWalletInfo] = useState({});

  useEffect(() => {
    if (isAdvancedModeEnabledRender && wallet.allowMasterFingerprint()) {
      InteractionManager.runAfterInteractions(() => {
        setMasterFingerprint(wallet.getMasterFingerprintHex());
      });
    }
  }, [isAdvancedModeEnabledRender, wallet]);
  useEffect(() => {
    if (wallet.type === LightningLdkWallet.type) {
      wallet.getInfo().then(setLightningWalletInfo);
    }
  }, [wallet]);

  const save = () => {
    setIsLoading(true);
    if (walletName.trim().length > 0) {
      wallet.setLabel(walletName.trim());
      if (wallet.type === WatchOnlyWallet.type && wallet.isHd()) {
        wallet.setUseWithHardwareWalletEnabled(useWithHardwareWallet);
      }
      wallet.setHideTransactionsInWalletsList(!hideTransactionsInWalletsList);
      if (wallet.allowBIP47()) {
        wallet.switchBIP47(isBIP47Enabled);
      }
    }
    saveToDisk()
      .then(() => {
        presentAlert({ title: '', message: loc.wallets.details_wallet_updated });
        goBack();
      })
      .catch(error => {
        console.log(error.message);
        setIsLoading(false);
      });
  };

  useLayoutEffect(() => {
    isAdvancedModeEnabled().then(setIsAdvancedModeEnabledRender);

    setOptions({
      headerRight: () => (
        <HeaderAction
          title={loc.wallets.details_save}
          color={colors.foregroundColor}
          testID="Save"
          disabled={isLoading}
          onPress={save}
        />
      ),
    });
  }, [isLoading, colors, walletName, useWithHardwareWallet, hideTransactionsInWalletsList, isBIP47Enabled]);

  useEffect(() => {
    if (wallets.some(w => w.getID() === walletID)) {
      setSelectedWalletID(walletID);
    }
  }, [walletID]);

  const navigateToOverviewAndDeleteWallet = () => {
    setIsLoading(true);
    let externalAddresses = [];
    try {
      externalAddresses = wallet.getAllExternalAddresses();
    } catch (_) {}
    Notifications.unsubscribe(externalAddresses, [], []);
    popToTop();
    deleteWallet(wallet);
    saveToDisk(true);
    triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
  };

  const presentWalletHasBalanceAlert = useCallback(async () => {
    triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
    try {
      const walletBalanceConfirmation = await prompt(
        loc.wallets.details_delete_wallet,
        loc.formatString(loc.wallets.details_del_wb_q, { balance: wallet.getBalance() }),
        true,
        'plain-text',
        true,
        loc.wallets.details_delete,
      );
      if (Number(walletBalanceConfirmation) === wallet.getBalance()) {
        navigateToOverviewAndDeleteWallet();
      } else {
        triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
        setIsLoading(false);
        presentAlert({ message: loc.wallets.details_del_wb_err });
      }
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToWalletExport = () => {
    navigate('WalletExportRoot', {
      screen: 'WalletExport',
      params: {
        walletID: wallet.getID(),
      },
    });
  };
  const navigateToMultisigCoordinationSetup = () => {
    navigate('ExportMultisigCoordinationSetupRoot', {
      screen: 'ExportMultisigCoordinationSetup',
      params: {
        walletId: wallet.getID(),
      },
    });
  };
  const navigateToViewEditCosigners = () => {
    navigate('ViewEditMultisigCosignersRoot', {
      screen: 'ViewEditMultisigCosigners',
      params: {
        walletId: wallet.getID(),
      },
    });
  };
  const navigateToXPub = () =>
    navigate('WalletXpubRoot', {
      screen: 'WalletXpub',
      params: {
        walletID,
      },
    });

  const navigateToSignVerify = () =>
    navigate('SignVerifyRoot', {
      screen: 'SignVerify',
      params: {
        walletID: wallet.getID(),
        address: wallet.getAllExternalAddresses()[0], // works for both single address and HD wallets
      },
    });
  const navigateToLdkViewLogs = () => {
    navigate('LdkViewLogs', {
      walletID,
    });
  };

  const navigateToAddresses = () =>
    navigate('WalletAddresses', {
      walletID: wallet.getID(),
    });

  const navigateToPaymentCodes = () =>
    navigate('PaymentCodeRoot', {
      screen: 'PaymentCodesList',
      params: {
        walletID: wallet.getID(),
      },
    });

  const exportInternals = async () => {
    if (backdoorPressed < 10) return setBackdoorPressed(backdoorPressed + 1);
    setBackdoorPressed(0);
    if (wallet.type !== HDSegwitBech32Wallet.type) return;
    const fileName = 'wallet-externals.json';
    const contents = JSON.stringify(
      {
        _balances_by_external_index: wallet._balances_by_external_index,
        _balances_by_internal_index: wallet._balances_by_internal_index,
        _txs_by_external_index: wallet._txs_by_external_index,
        _txs_by_internal_index: wallet._txs_by_internal_index,
        _utxo: wallet._utxo,
        next_free_address_index: wallet.next_free_address_index,
        next_free_change_address_index: wallet.next_free_change_address_index,
        internal_addresses_cache: wallet.internal_addresses_cache,
        external_addresses_cache: wallet.external_addresses_cache,
        _xpub: wallet._xpub,
        gap_limit: wallet.gap_limit,
        label: wallet.label,
        _lastTxFetch: wallet._lastTxFetch,
        _lastBalanceFetch: wallet._lastBalanceFetch,
      },
      null,
      2,
    );
    if (Platform.OS === 'ios') {
      const filePath = RNFS.TemporaryDirectoryPath + `/${fileName}`;
      await RNFS.writeFile(filePath, contents);
      Share.open({
        url: 'file://' + filePath,
        saveToFiles: isDesktop,
      })
        .catch(error => {
          console.log(error);
          //presentAlert({ message: error.message });
        })
        .finally(() => {
          RNFS.unlink(filePath);
        });
    } else if (Platform.OS === 'android') {
      const granted = await request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE);
      if (granted === RESULTS.GRANTED) {
        console.log('Storage Permission: Granted');
        const filePath = RNFS.DownloadDirectoryPath + `/${fileName}`;
        try {
          await RNFS.writeFile(filePath, contents);
          presentAlert({ message: loc.formatString(loc.send.txSaved, { filePath: fileName }) });
        } catch (e) {
          console.log(e);
          presentAlert({ message: e.message });
        }
      } else {
        console.log('Storage Permission: Denied');
        marsAlert(loc.send.permission_storage_title, loc.send.permission_storage_denied_message, [
          {
            text: loc.send.open_settings,
            onPress: () => {
              Linking.openSettings();
            },
            style: 'default',
          },
          { text: loc._.cancel, onPress: () => {}, style: 'cancel' },
        ]);
      }
    }
  };

  const purgeTransactions = async () => {
    if (backdoorPressed < 10) return setBackdoorPressed(backdoorPressed + 1);
    setBackdoorPressed(0);
    const msg = 'Transactions purged. Pls go to main screen and back to rerender screen';

    if (wallet.type === HDSegwitBech32Wallet.type) {
      wallet._txs_by_external_index = {};
      wallet._txs_by_internal_index = {};
      presentAlert({ message: msg });
    }

    if (wallet._hdWalletInstance) {
      wallet._hdWalletInstance._txs_by_external_index = {};
      wallet._hdWalletInstance._txs_by_internal_index = {};
      presentAlert({ message: msg });
    }
  };

  const walletNameTextInputOnBlur = () => {
    if (walletName.trim().length === 0) {
      const walletLabel = wallet.getLabel();
      setWalletName(walletLabel);
    }
  };

  const onExportHistoryPressed = async () => {
    const csvFileArray = [
      loc.transactions.date,
      loc.transactions.txid,
      `${loc.send.create_amount} (${BitcoinUnit.BTC})`,
      loc.send.create_memo,
    ];
    if (wallet.chain === Chain.OFFCHAIN) {
      csvFileArray.push(loc.lnd.payment);
    }

    let csvFile = csvFileArray.join(','); // CSV header
    const transactions = wallet.getTransactions();

    for (const transaction of transactions) {
      const value = formatBalanceWithoutSuffix(transaction.value, BitcoinUnit.BTC, true);

      let hash = transaction.hash;
      let memo = txMetadata[transaction.hash]?.memo?.trim() ?? '';
      let status;

      if (wallet.chain === Chain.OFFCHAIN) {
        hash = transaction.payment_hash;
        memo = transaction.description;
        status = transaction.ispaid ? loc._.success : loc.lnd.expired;
        if (hash?.type === 'Buffer' && hash?.data) {
          const bb = Buffer.from(hash);
          hash = bb.toString('hex');
        }
      }

      const data = [new Date(transaction.received).toString(), hash, value, memo];

      if (wallet.chain === Chain.OFFCHAIN) {
        data.push(status);
      }

      csvFile += '\n' + data.join(','); // CSV line
    }

    await writeFileAndExport(`${wallet.label.replace(' ', '-')}-history.csv`, csvFile);
  };

  const handleDeleteButtonTapped = async () => {
    triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
    // A swap in progress is claimed or refunded with keys from this wallet.
    if (
      (await hasUnfinishedSwaps(wallet.getID()).catch(() => false)) ||
      (await hasUnfinishedMakerSwaps(wallet.getID()).catch(() => false))
    ) {
      marsAlert('Swap in progress', 'This wallet has a Bitcoin swap that has not finished. Wait until it completes or is refunded before deleting the wallet.');
      return;
    }
    marsAlert(
      loc.wallets.details_delete_wallet,
      loc.wallets.details_are_you_sure,
      [
        {
          text: loc.wallets.details_yes_delete,
          onPress: async () => {
            const isBiometricsEnabled = await Biometric.isBiometricUseCapableAndEnabled();

            if (isBiometricsEnabled) {
              if (!(await Biometric.unlockWithBiometrics())) {
                return;
              }
            }
            if (wallet.getBalance() > 0 && wallet.allowSend()) {
              presentWalletHasBalanceAlert();
            } else {
              navigateToOverviewAndDeleteWallet();
            }
          },
          style: 'destructive',
        },
        { text: loc.wallets.details_no_cancel, onPress: () => {}, style: 'cancel' },
      ],
      { cancelable: false },
    );
  };

  const plainAddress =
    [LegacyWallet.type, SegwitBech32Wallet.type, SegwitP2SHWallet.type].includes(wallet.type) ||
    (wallet.type === WatchOnlyWallet.type && !wallet.isHd())
      ? (() => {
          // gracefully handling faulty wallets, so at least user has an option to delete the wallet
          try {
            return wallet.getAddress();
          } catch (error) {
            return error.message;
          }
        })()
      : null;
  const unitLabel = wallet.chain === Chain.ONCHAIN ? 'MARS' : wallet.getPreferredBalanceUnit();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      centerContent={isLoading}
      style={m.screen}
      contentContainerStyle={m.content}
      testID="WalletDetailsScroll"
    >
      {isLoading ? (
        <BlueLoading />
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View>
            <View style={m.hero}>
              <View style={m.eyebrowRow}>
                <View style={m.tick} />
                <Text style={m.eyebrow}>{wallet.civic ? 'MCR / CIVIC WALLET' : 'MCR / WALLET'}</Text>
              </View>
              <Text style={m.heroName} numberOfLines={2}>
                {wallet.civic ? 'Civic wallet' : walletName || wallet.getLabel()}
              </Text>
              <Text style={m.heroBalance}>
                {formatBalanceWithoutSuffix(wallet.getBalance(), BitcoinUnit.BTC, true)} <Text style={m.heroUnit}>{unitLabel}</Text>
              </Text>
              <View style={m.badges}>
                <View style={m.badge}>
                  <Text style={m.badgeText}>{String(wallet.typeReadable).toUpperCase()}</Text>
                </View>
                {wallet.civic ? (
                  <View style={[m.badge, m.badgeAccent]}>
                    <Text style={[m.badgeText, m.badgeAccentText]}>YOUR IDENTITY</Text>
                  </View>
                ) : null}
              </View>
              {wallet.civic ? <Text style={m.heroNote}>This wallet is also your identity in the Republic. Its twelve words restore both.</Text> : null}
            </View>

            {!wallet.civic && (
              <View style={m.panel}>
                <Text style={m.label}>{loc.wallets.add_wallet_name.toUpperCase()}</Text>
                <KeyboardAvoidingView enabled={!Platform.isPad} behavior={Platform.OS === 'ios' ? 'position' : null}>
                  <TextInput
                    value={walletName}
                    onChangeText={setWalletName}
                    onBlur={walletNameTextInputOnBlur}
                    numberOfLines={1}
                    placeholderTextColor="#81868e"
                    style={m.input}
                    editable={!isLoading}
                    underlineColorAndroid="transparent"
                    testID="WalletNameInput"
                  />
                </KeyboardAvoidingView>
              </View>
            )}

            <View style={m.panel}>
              {plainAddress ? (
                <View style={m.row}>
                  <Text style={m.label}>{loc.wallets.details_address.toUpperCase()}</Text>
                  <Text style={m.mono} selectable>
                    {plainAddress}
                  </Text>
                </View>
              ) : null}

              {wallet.type === LightningLdkWallet.type && (
                <View style={m.row}>
                  <Text style={m.label}>{loc.wallets.identity_pubkey.toUpperCase()}</Text>
                  {lightningWalletInfo?.identityPubkey ? <Text style={m.mono}>{lightningWalletInfo.identityPubkey}</Text> : <ActivityIndicator />}
                </View>
              )}
              {wallet.type === MultisigHDWallet.type && (
                <>
                  <View style={m.row}>
                    <Text style={m.label}>{loc.wallets.details_multisig_type.toUpperCase()}</Text>
                    <Text style={m.value}>
                      {`${wallet.getM()} / ${wallet.getN()} (${
                        wallet.isNativeSegwit() ? 'native segwit' : wallet.isWrappedSegwit() ? 'wrapped segwit' : 'legacy'
                      })`}
                    </Text>
                  </View>
                  <View style={m.row}>
                    <Text style={m.label}>{loc.multisig.how_many_signatures_can_bluewallet_make.toUpperCase()}</Text>
                    <Text style={m.value}>{wallet.howManySignaturesCanWeMake()}</Text>
                  </View>
                </>
              )}
              {wallet.type === LightningCustodianWallet.type && (
                <View style={m.row}>
                  <Text style={m.label}>{loc.wallets.details_connected_to.toUpperCase()}</Text>
                  <Text style={m.value}>{wallet.getBaseURI()}</Text>
                </View>
              )}
              {wallet.type === HDAezeedWallet.type && (
                <View style={m.row}>
                  <Text style={m.label}>{loc.wallets.identity_pubkey.toUpperCase()}</Text>
                  <Text style={m.mono}>{wallet.getIdentityPubkey()}</Text>
                </View>
              )}

              <View style={[m.row, m.rowInline]}>
                <View style={m.flex}>
                  <Text onPress={exportInternals} style={m.label}>
                    {loc.transactions.list_title.toUpperCase()}
                  </Text>
                  <Text style={m.value} onPress={() => setBackdoorBip47Pressed(prevState => prevState + 1)}>
                    Show on the wallet list
                  </Text>
                </View>
                <Switch
                  style={m.toggle}
                  value={hideTransactionsInWalletsList}
                  onValueChange={setHideTransactionsInWalletsList}
                  trackColor={{ false: '#30353B', true: '#FF812D' }}
                  thumbColor="#F5F1EB"
                  ios_backgroundColor="#30353B"
                />
              </View>
              <View style={[m.row, m.rowInline, m.rowLast]}>
                <Text onPress={purgeTransactions} style={[m.label, m.labelInline]}>
                  {loc.transactions.transactions_count.toUpperCase()}
                </Text>
                <Text style={m.figure}>{wallet.getTransactions().length}</Text>
              </View>

              {backdoorBip47Pressed >= 10 && wallet.allowBIP47() ? (
                <View style={[m.row, m.rowInline, m.rowTop]}>
                  <View style={m.flex}>
                    <Text style={m.label}>{loc.bip47.payment_code.toUpperCase()}</Text>
                    <Text style={m.value}>{loc.bip47.purpose}</Text>
                  </View>
                  <Switch value={isBIP47Enabled} onValueChange={setIsBIP47Enabled} />
                </View>
              ) : null}

              {wallet.type === WatchOnlyWallet.type && wallet.isHd() && (
                <View style={[m.row, m.rowInline, m.rowTop]}>
                  <View style={m.flex}>
                    <Text style={m.label}>{loc.wallets.details_advanced.toUpperCase()}</Text>
                    <Text style={m.value}>{loc.wallets.details_use_with_hardware_wallet}</Text>
                  </View>
                  <Switch value={useWithHardwareWallet} onValueChange={setUseWithHardwareWallet} />
                </View>
              )}
              {isAdvancedModeEnabledRender && (
                <View style={[m.row, m.rowTop]}>
                  {wallet.allowMasterFingerprint() && (
                    <View style={m.pair}>
                      <Text style={m.label}>{loc.wallets.details_master_fingerprint.toUpperCase()}</Text>
                      <Text style={m.mono}>{masterFingerprint ?? <ActivityIndicator />}</Text>
                    </View>
                  )}
                  {derivationPath && (
                    <View style={m.pair}>
                      <Text style={m.label}>{loc.wallets.details_derivation_path.toUpperCase()}</Text>
                      <Text style={m.mono} testID="DerivationPath">
                        {derivationPath}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            <Text style={m.section}>Keys and records</Text>
            <View style={m.panel}>
              <DetailAction
                icon="shield"
                title="Back up this wallet"
                note="Show the twelve words that restore this wallet."
                onPress={navigateToWalletExport}
                testID="WalletExport"
              />
              {(wallet instanceof AbstractHDElectrumWallet || (wallet.type === WatchOnlyWallet.type && wallet.isHd())) && (
                <DetailAction icon="list" title={loc.wallets.details_show_addresses} note="Every address this wallet has used." onPress={navigateToAddresses} />
              )}
              {wallet.allowBIP47() && isBIP47Enabled && <DetailAction icon="at-sign" title="Show payment codes" onPress={navigateToPaymentCodes} />}
              {walletTransactionsLength > 0 && (
                <DetailAction
                  icon="download"
                  title="Export history"
                  note="A spreadsheet of this wallet's transactions."
                  onPress={onExportHistoryPressed}
                />
              )}
              {wallet.type === MultisigHDWallet.type && (
                <>
                  <DetailAction
                    icon="share-2"
                    title={loc.multisig.export_coordination_setup.replace(/^\w/, c => c.toUpperCase())}
                    onPress={navigateToMultisigCoordinationSetup}
                    testID="MultisigCoordinationSetup"
                  />
                  <DetailAction icon="users" title={loc.multisig.view_edit_cosigners} onPress={navigateToViewEditCosigners} testID="ViewEditCosigners" />
                </>
              )}
              {wallet.allowXpub() && (
                <DetailAction
                  icon="eye"
                  title="Read-only key (XPUB)"
                  note="A read-only key: it can watch this wallet but not spend."
                  onPress={navigateToXPub}
                  testID="XPub"
                />
              )}
              {wallet.type === LightningLdkWallet.type && (
                <DetailAction icon="file-text" title={loc.lnd.view_logs} onPress={navigateToLdkViewLogs} testID="LdkLogs" />
              )}
            </View>

            {!wallet.civic && (
              <TouchableOpacity accessibilityRole="button" onPress={handleDeleteButtonTapped} testID="DeleteButton" style={m.remove}>
                <Icon name="trash-2" type="feather" size={17} color="#F4A38A" />
                <Text textBreakStrategy="simple" style={m.removeText}>
                  {loc.wallets.details_delete}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableWithoutFeedback>
      )}
    </ScrollView>
  );
};

function DetailAction({ icon, title, note, onPress, testID }) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} testID={testID} style={m.action}>
      <View style={m.actionIcon}>
        <Icon name={icon} type="feather" size={18} color="#FF812D" />
      </View>
      <View style={m.flex}>
        <Text style={m.actionTitle}>{title}</Text>
        {note ? <Text style={m.actionNote}>{note}</Text> : null}
      </View>
      <Icon name="chevron-right" type="feather" size={20} color="#6B7178" />
    </TouchableOpacity>
  );
}

const m = StyleSheet.create({
  screen: { backgroundColor: '#080A0C' },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 150 },
  flex: { flex: 1 },
  toggle: { marginLeft: 12, marginRight: 6 },
  hero: { backgroundColor: '#14171B', borderRadius: 18, borderWidth: 1, borderColor: '#30353B', padding: 20, marginBottom: 14 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  tick: { width: 3, height: 13, backgroundColor: '#FF812D', marginRight: 9 },
  eyebrow: { color: '#ADB3BA', fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2 },
  heroName: { color: '#F5F1EB', fontFamily: 'ChakraPetch-Bold', fontSize: 26, lineHeight: 32 },
  heroBalance: { color: '#F5F1EB', fontFamily: 'ChakraPetch-SemiBold', fontSize: 20, marginTop: 6 },
  heroUnit: { color: '#FF812D', fontSize: 14 },
  heroNote: { color: '#ADB3BA', fontSize: 14, lineHeight: 20, marginTop: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  badge: { borderWidth: 1, borderColor: '#30353B', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8, marginBottom: 4 },
  badgeText: { color: '#ADB3BA', fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 1.2 },
  badgeAccent: { borderColor: '#FF812D' },
  badgeAccentText: { color: '#FF812D' },
  panel: { backgroundColor: '#14171B', borderRadius: 18, borderWidth: 1, borderColor: '#30353B', paddingHorizontal: 18, marginBottom: 14 },
  section: { color: '#F5F1EB', fontFamily: 'ChakraPetch-Bold', fontSize: 19, marginTop: 14, marginBottom: 12 },
  row: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#30353B' },
  rowInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLast: { borderBottomWidth: 0 },
  rowTop: { borderBottomWidth: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#30353B' },
  pair: { marginBottom: 10 },
  label: { color: '#8A9098', fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 1.6, marginBottom: 6, writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr' },
  labelInline: { marginBottom: 0 },
  value: { color: '#F5F1EB', fontSize: 16 },
  figure: { color: '#F5F1EB', fontFamily: 'ChakraPetch-SemiBold', fontSize: 18 },
  mono: { color: '#F5F1EB', fontSize: 14, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  input: { color: '#F5F1EB', fontSize: 17, paddingVertical: 12, marginBottom: 6 },
  action: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#30353B' },
  actionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1D2126', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionTitle: { color: '#F5F1EB', fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  actionNote: { color: '#8A9098', fontSize: 13, lineHeight: 18, marginTop: 2 },
  remove: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5A3A30', borderRadius: 12, minHeight: 50, marginTop: 10 },
  removeText: { color: '#F4A38A', fontFamily: 'ChakraPetch-SemiBold', fontSize: 15, marginLeft: 8 },
});

WalletDetails.navigationOptions = navigationStyle({}, opts => ({
  ...opts,
  headerTitle: loc.wallets.details_title,
  statusBarStyle: 'light',
}));

export default WalletDetails;
