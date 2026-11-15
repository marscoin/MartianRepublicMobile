import React, { useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { clearUseURv1, isURv1Enabled, setUseURv1 } from '../../blue_modules/ur';
import { SettingsLoading, SettingsRow, SettingsScreen, SettingsSection, SettingsSwitchRow } from '../../components/SettingsUi';
import loc from '../../loc';

const GeneralSettings: React.FC = () => {
  const { isAdvancedModeEnabled, setIsAdvancedModeEnabled, wallets, isHandOffUseEnabled, setIsHandOffUseEnabledAsyncStorage } =
    useContext(BlueStorageContext);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancedModeSwitchEnabled, setIsAdvancedModeSwitchEnabled] = useState(false);
  const [isURv1SwitchEnabled, setIsURv1SwitchEnabled] = useState(false);
  const { navigate } = useNavigation();
  const onAdvancedModeSwitch = async (value: boolean) => {
    await setIsAdvancedModeEnabled(value);
    setIsAdvancedModeSwitchEnabled(value);
  };
  const onLegacyURv1Switch = async (value: boolean) => {
    setIsURv1SwitchEnabled(value);
    return value ? setUseURv1() : clearUseURv1();
  };

  useEffect(() => {
    (async () => {
      setIsAdvancedModeSwitchEnabled(await isAdvancedModeEnabled());
      setIsURv1SwitchEnabled(await isURv1Enabled());
      setIsLoading(false);
    })();
  });

  const navigateToPrivacy = () => {
    // @ts-ignore: Fix later
    navigate('SettingsPrivacy');
  };

  return isLoading ? (
    <SettingsLoading />
  ) : (
    <SettingsScreen title={loc.settings.general}>
      <SettingsSection label="START AND PRIVACY" first>
        {wallets.length > 1 && (
          <SettingsRow
            icon="home"
            title={loc.settings.default_title}
            note="Open on all your wallets, or straight into one of them."
            // @ts-ignore: Fix later
            onPress={() => navigate('DefaultView')}
          />
        )}
        <SettingsRow
          icon="shield"
          title={loc.settings.privacy}
          note="The clipboard, home screen shortcuts and diagnostics."
          onPress={navigateToPrivacy}
          testID="SettingsPrivacy"
        />
      </SettingsSection>

      {Platform.OS === 'ios' ? (
        <SettingsSection label="YOUR OTHER DEVICES">
          <SettingsSwitchRow
            icon="monitor"
            title={loc.settings.general_continuity}
            note="See the wallets and transactions you pick on your other Apple devices signed in to iCloud."
            value={isHandOffUseEnabled}
            onValueChange={setIsHandOffUseEnabledAsyncStorage}
          />
        </SettingsSection>
      ) : null}

      <SettingsSection label="FOR EXPERIENCED USERS">
        <SettingsSwitchRow
          icon="sliders"
          title={loc.settings.general_adv_mode}
          note="Shows extra options, such as more wallet types and adding your own randomness when a wallet is created."
          value={isAdvancedModeSwitchEnabled}
          onValueChange={onAdvancedModeSwitch}
          switchTestID="AdvancedMode"
        />
        <SettingsSwitchRow
          icon="grid"
          title="Older multi-part QR codes"
          note="Show multi-part QR codes in the first format (URv1), for devices that cannot read the current one."
          value={isURv1SwitchEnabled}
          onValueChange={onLegacyURv1Switch}
        />
      </SettingsSection>
    </SettingsScreen>
  );
};

export default GeneralSettings;
