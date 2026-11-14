import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { BlueCopyToClipboardButton } from '../../BlueComponents';
import loc from '../../loc';
import Notifications from '../../blue_modules/notifications';
import presentAlert from '../../components/Alert';
import { CivicButton } from '../../components/CivicUi';
import {
  SettingsCard,
  SettingsCardText,
  SettingsField,
  SettingsLoading,
  SettingsNote,
  SettingsRow,
  SettingsScreen,
  SettingsSection,
  SettingsSwitchRow,
  settingsNavigation,
} from '../../components/SettingsUi';

const NotificationSettings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isNotificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isShowTokenInfo, setShowTokenInfo] = useState(0);
  const [tokenInfo, setTokenInfo] = useState('<empty>');
  const [URI, setURI] = useState();

  const onNotificationsSwitch = async value => {
    setNotificationsEnabled(value); // so the slider is not 'jumpy'
    if (value) {
      // user is ENABLING notifications
      await Notifications.cleanUserOptOutFlag();
      if (await Notifications.getPushToken()) {
        // we already have a token, so we just need to reenable ALL level on groundcontrol:
        await Notifications.setLevels(true);
      } else {
        // ok, we dont have a token. we need to try to obtain permissions, configure callbacks and save token locally:
        await Notifications.tryToObtainPermissions();
      }
    } else {
      // user is DISABLING notifications
      await Notifications.setLevels(false);
    }

    setNotificationsEnabled(await Notifications.isNotificationsEnabled());
  };

  useEffect(() => {
    (async () => {
      setNotificationsEnabled(await Notifications.isNotificationsEnabled());
      setURI(await Notifications.getSavedUri());
      setTokenInfo(
        'token: ' +
          JSON.stringify(await Notifications.getPushToken()) +
          ' permissions: ' +
          JSON.stringify(await Notifications.checkPermissions()) +
          ' stored notifications: ' +
          JSON.stringify(await Notifications.getStoredNotifications()),
      );
      setIsLoading(false);
    })();
  }, []);

  const save = useCallback(async () => {
    setIsLoading(true);
    try {
      if (URI) {
        // validating only if its not empty. empty means use default
        if (await Notifications.isGroundControlUriValid(URI)) {
          await Notifications.saveUri(URI);
          presentAlert({ message: loc.settings.saved });
        } else {
          presentAlert({ message: loc.settings.not_a_valid_uri });
        }
      } else {
        await Notifications.saveUri('');
        presentAlert({ message: loc.settings.saved });
      }
    } catch (error) {
      console.warn(error);
    }
    setIsLoading(false);
  }, [URI]);

  const revealTokenInfo = () => setShowTokenInfo(isShowTokenInfo + 1);

  return isLoading ? (
    <SettingsLoading />
  ) : (
    <SettingsScreen overline="MCR / SETTINGS / NETWORK" title={loc.settings.notifications}>
      <SettingsSection first>
        <SettingsSwitchRow
          icon="bell"
          title={loc.settings.push_notifications}
          note="Be told when coins arrive in one of your wallets."
          value={isNotificationsEnabled}
          onValueChange={onNotificationsSwitch}
          switchTestID="NotificationsSwitch"
        />
      </SettingsSection>

      <SettingsSection label="NOTIFICATION SERVER" />
      <SettingsCard>
        <SettingsCardText>{loc.settings.groundcontrol_explanation}</SettingsCardText>
        <SettingsField
          placeholder={Notifications.getDefaultUri()}
          value={URI}
          onChangeText={setURI}
          editable={!isLoading}
          textContentType="URL"
          testID="NotificationsUri"
        />
        <View style={styles.save}>
          <CivicButton onPress={save} title={loc.settings.save} testID="NotificationsSave" />
        </View>
      </SettingsCard>

      <SettingsSection>
        <SettingsRow
          icon="github"
          title="GroundControl on GitHub"
          note="The open-source project behind the notification server."
          onPress={() => Linking.openURL('https://github.com/BlueWallet/GroundControl')}
        />
      </SettingsSection>

      <SettingsNote centered onPress={revealTokenInfo}>
        ♪ Ground Control to Major Tom ♪
      </SettingsNote>
      <SettingsNote centered onPress={revealTokenInfo}>
        ♪ Commencing countdown, engines on ♪
      </SettingsNote>

      {isShowTokenInfo >= 9 && (
        <View>
          <BlueCopyToClipboardButton stringToCopy={tokenInfo} displayText={tokenInfo} />
        </View>
      )}
    </SettingsScreen>
  );
};

NotificationSettings.navigationOptions = settingsNavigation(() => loc.settings.notifications);

const styles = StyleSheet.create({
  save: { marginTop: 8 },
});

export default NotificationSettings;
