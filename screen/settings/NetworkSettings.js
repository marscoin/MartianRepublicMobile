import React from 'react';
import { useNavigation } from '@react-navigation/native';
import Notifications from '../../blue_modules/notifications';
import { SettingsNote, SettingsRow, SettingsScreen, SettingsSection, settingsNavigation } from '../../components/SettingsUi';
import loc from '../../loc';

const NetworkSettings = () => {
  const { navigate } = useNavigation();

  const navigateToElectrumSettings = () => {
    navigate('ElectrumSettings');
  };

  const navigateToLightningSettings = () => {
    navigate('LightningSettings');
  };

  return (
    <SettingsScreen title={loc.settings.network}>
      <SettingsSection first>
        <SettingsRow
          icon="server"
          title="Marscoin server"
          note="See which server your wallet is connected to."
          onPress={navigateToElectrumSettings}
          testID="ElectrumSettings"
        />
        {/* <ListItem title={loc.settings.lightning_settings} onPress={navigateToLightningSettings} testID="LightningSettings" chevron /> */}
        {Notifications.isNotificationsCapable && (
          <SettingsRow
            icon="bell"
            title={loc.settings.notifications}
            note="Be told when coins arrive."
            onPress={() => navigate('NotificationSettings')}
            testID="NotificationSettings"
          />
        )}
      </SettingsSection>
      <SettingsNote>The app finds a Marscoin server and reconnects by itself. There is nothing here you need to set up.</SettingsNote>
    </SettingsScreen>
  );
};

NetworkSettings.navigationOptions = settingsNavigation(() => loc.settings.network);

export default NetworkSettings;
