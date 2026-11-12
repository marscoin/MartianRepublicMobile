import { marsAlert } from '../../components/MarsDialog';
import React, { useEffect, useState, useCallback, useContext } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  SettingsLoading,
  SettingsNote,
  SettingsRow,
  SettingsScreen,
  SettingsSection,
  SettingsSwitchRow,
  settingsNavigation,
} from '../../components/SettingsUi';
import Biometric from '../../class/biometrics';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import presentAlert from '../../components/Alert';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
const prompt = require('../../helpers/prompt');

const EncryptStorage = () => {
  const { isStorageEncrypted, encryptStorage, decryptStorage, saveToDisk } = useContext(BlueStorageContext);
  const [isLoading, setIsLoading] = useState(true);
  const [biometrics, setBiometrics] = useState({ isDeviceBiometricCapable: false, isBiometricsEnabled: false, biometricsType: '' });
  const [storageIsEncryptedSwitchEnabled, setStorageIsEncryptedSwitchEnabled] = useState(false);
  const { navigate, popToTop } = useNavigation();

  const initialState = useCallback(async () => {
    const isBiometricsEnabled = await Biometric.isBiometricUseEnabled();
    const isDeviceBiometricCapable = await Biometric.isDeviceBiometricCapable();
    const biometricsType = (await Biometric.biometricType()) || loc.settings.biometrics;
    const isStorageEncryptedSwitchEnabled = await isStorageEncrypted();
    setStorageIsEncryptedSwitchEnabled(isStorageEncryptedSwitchEnabled);
    setBiometrics({ isBiometricsEnabled, isDeviceBiometricCapable, biometricsType });
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    initialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDecryptStorage = async () => {
    const password = await prompt(loc.settings.password, loc._.storage_is_encrypted).catch(() => {
      setIsLoading(false);
    });
    try {
      await decryptStorage(password);
      await saveToDisk();
      popToTop();
    } catch (e) {
      if (password) {
        triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
        presentAlert({ message: loc._.bad_password });
      }

      setIsLoading(false);
      setStorageIsEncryptedSwitchEnabled(await isStorageEncrypted());
    }
  };

  const onEncryptStorageSwitch = async value => {
    setIsLoading(true);
    if (value === true) {
      let p1 = await prompt(loc.settings.password, loc.settings.password_explain).catch(() => {
        setIsLoading(false);
        p1 = undefined;
      });
      if (!p1) {
        setIsLoading(false);
        return;
      }
      const p2 = await prompt(loc.settings.password, loc.settings.retype_password).catch(() => {
        setIsLoading(false);
      });
      if (p1 === p2) {
        await encryptStorage(p1);
        setIsLoading(false);
        setStorageIsEncryptedSwitchEnabled(await isStorageEncrypted());
        saveToDisk();
      } else {
        setIsLoading(false);
        triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
        presentAlert({ message: loc.settings.passwords_do_not_match });
      }
    } else {
      marsAlert(
        loc.settings.encrypt_decrypt,
        loc.settings.encrypt_decrypt_q,
        [
          {
            text: loc._.cancel,
            style: 'cancel',
            onPress: () => setIsLoading(false),
          },
          {
            text: loc._.ok,
            style: 'destructive',
            onPress: handleDecryptStorage,
          },
        ],
        { cancelable: false },
      );
    }
  };

  const onUseBiometricSwitch = async value => {
    const isBiometricsEnabled = {
      isDeviceBiometricCapable: biometrics.isDeviceBiometricCapable,
      isBiometricsEnabled: biometrics.isBiometricsEnabled,
      biometricsType: biometrics.biometricsType,
    };
    if (await Biometric.unlockWithBiometrics()) {
      isBiometricsEnabled.isBiometricsEnabled = value;
      await Biometric.setBiometricUseEnabled(value);
      setBiometrics(isBiometricsEnabled);
    }
  };

  const navigateToPlausibleDeniability = () => {
    navigate('PlausibleDeniability');
  };

  const renderPasscodeExplanation = () => {
    let isCapable = true;

    if (Platform.OS === 'android') {
      if (Platform.Version < 30) {
        isCapable = false;
      }
    }

    return isCapable ? (
      <SettingsNote>{loc.formatString(loc.settings.biometrics_fail, { type: biometrics.biometricsType })}</SettingsNote>
    ) : null;
  };

  return isLoading ? (
    <SettingsLoading />
  ) : (
    <SettingsScreen title={loc.settings.encrypt_title}>
      {biometrics.isDeviceBiometricCapable && (
        <>
          <SettingsSection label={String(loc.settings.biometrics).toUpperCase()} first>
            <SettingsSwitchRow
              icon="user-check"
              title={loc.formatString(loc.settings.encrypt_use, { type: biometrics.biometricsType })}
              note={loc.formatString(loc.settings.encrypt_use_expl, { type: biometrics.biometricsType })}
              value={biometrics.isBiometricsEnabled}
              onValueChange={onUseBiometricSwitch}
            />
          </SettingsSection>
          {renderPasscodeExplanation()}
        </>
      )}
      <SettingsSection label={String(loc.settings.encrypt_tstorage).toUpperCase()} first={!biometrics.isDeviceBiometricCapable}>
        <SettingsSwitchRow
          testID="EncyptedAndPasswordProtected"
          icon="lock"
          title={loc.settings.encrypt_enc_and_pass}
          note="Locks everything this app keeps on the phone behind a password you choose."
          value={storageIsEncryptedSwitchEnabled}
          onValueChange={onEncryptStorageSwitch}
        />
        {storageIsEncryptedSwitchEnabled && (
          <SettingsRow
            icon="eye-off"
            onPress={navigateToPlausibleDeniability}
            title={loc.settings.plausible_deniability}
            note="A second password that opens a separate, decoy storage."
            testID="PlausibleDeniabilityButton"
          />
        )}
      </SettingsSection>
      <SettingsNote>
        The password is not kept anywhere else. If you forget it, you will need your recovery words to get your wallets back.
      </SettingsNote>
    </SettingsScreen>
  );
};

export default EncryptStorage;
EncryptStorage.navigationOptions = settingsNavigation(() => loc.settings.encrypt_title);
