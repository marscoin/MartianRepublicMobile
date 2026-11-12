import React, { useContext, useEffect, useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { openSettings } from 'react-native-permissions';

import {
  SettingsHeader,
  SettingsRow,
  SettingsScreen,
  SettingsSection,
  SettingsSwitchRow,
  settingsNavigation,
} from '../../components/SettingsUi';
import loc from '../../loc';
import DeviceQuickActions from '../../class/quick-actions';
import BlueClipboard from '../../blue_modules/clipboard';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import WidgetCommunication from '../../blue_modules/WidgetCommunication';

const A = require('../../blue_modules/analytics');

const SettingsPrivacy = () => {
  const { isStorageEncrypted, setDoNotTrack, isDoNotTrackEnabled, setIsPrivacyBlurEnabled } = useContext(BlueStorageContext);
  const sections = Object.freeze({ ALL: 0, CLIPBOARDREAD: 1, QUICKACTION: 2, WIDGETS: 3 });
  const [isLoading, setIsLoading] = useState(sections.ALL);
  const [isReadClipboardAllowed, setIsReadClipboardAllowed] = useState(false);
  const [doNotTrackSwitchValue, setDoNotTrackSwitchValue] = useState(false);

  const [isDisplayWidgetBalanceAllowed, setIsDisplayWidgetBalanceAllowed] = useState(false);
  const [isQuickActionsEnabled, setIsQuickActionsEnabled] = useState(false);
  const [storageIsEncrypted, setStorageIsEncrypted] = useState(true);
  const [isPrivacyBlurEnabledTapped, setIsPrivacyBlurEnabledTapped] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setDoNotTrackSwitchValue(await isDoNotTrackEnabled());
        setIsReadClipboardAllowed(await BlueClipboard().isReadClipboardAllowed());
        setStorageIsEncrypted(await isStorageEncrypted());
        setIsQuickActionsEnabled(await DeviceQuickActions.getEnabled());
        setIsDisplayWidgetBalanceAllowed(await WidgetCommunication.isBalanceDisplayAllowed());
      } catch (e) {
        console.log(e);
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onValueChange = async value => {
    setIsLoading(sections.CLIPBOARDREAD);
    try {
      await BlueClipboard().setReadClipboardAllowed(value);
      setIsReadClipboardAllowed(value);
    } catch (e) {
      console.log(e);
    }
    setIsLoading(false);
  };

  const onDoNotTrackValueChange = async value => {
    setIsLoading(sections.ALL);
    try {
      setDoNotTrackSwitchValue(value);
      A.setOptOut(value);
      await setDoNotTrack(value);
    } catch (e) {
      console.log(e);
    }
    setIsLoading(false);
  };

  const onQuickActionsValueChange = async value => {
    setIsLoading(sections.QUICKACTION);
    try {
      await DeviceQuickActions.setEnabled(value);
      setIsQuickActionsEnabled(value);
    } catch (e) {
      console.log(e);
    }
    setIsLoading(false);
  };

  const onWidgetsTotalBalanceValueChange = async value => {
    setIsLoading(sections.WIDGETS);
    try {
      await WidgetCommunication.setBalanceDisplayAllowed(value);
      setIsDisplayWidgetBalanceAllowed(value);
    } catch (e) {
      console.log(e);
    }
    setIsLoading(false);
  };

  const openApplicationSettings = () => {
    openSettings();
  };

  const onDisablePrivacyTapped = () => {
    setIsPrivacyBlurEnabled(!(isPrivacyBlurEnabledTapped >= 10));
    setIsPrivacyBlurEnabledTapped(prev => prev + 1);
  };

  const busy = isLoading === sections.ALL;
  const header = <SettingsHeader overline="MCR / SETTINGS / GENERAL" title={loc.settings.privacy} />;

  return (
    <SettingsScreen
      header={
        // Android only, as before: tapping the heading ten times switches the privacy blur off.
        Platform.OS === 'android' ? (
          <Pressable accessibilityRole="button" onPress={onDisablePrivacyTapped}>
            {header}
          </Pressable>
        ) : (
          header
        )
      }
    >
      <SettingsSection label="CLIPBOARD" first>
        <SettingsSwitchRow
          icon="clipboard"
          title={loc.settings.privacy_read_clipboard}
          note="Lets the app offer a shortcut, or paste for you, when an address or a payment code is on your clipboard."
          value={isReadClipboardAllowed}
          onValueChange={onValueChange}
          disabled={busy}
          switchTestID="ClipboardSwitch"
        />
      </SettingsSection>

      {!storageIsEncrypted && (
        <SettingsSection label="HOME SCREEN">
          <SettingsSwitchRow
            icon="zap"
            title={loc.settings.privacy_quickactions}
            note="Touch and hold the Martian Republic icon to see your wallet’s balance."
            value={isQuickActionsEnabled}
            onValueChange={onQuickActionsValueChange}
            disabled={busy}
            switchTestID="QuickActionsSwitch"
          />
          {Platform.OS === 'ios' ? (
            <SettingsSwitchRow
              icon="layout"
              title="Total balance in widgets"
              note="Show the total of all your wallets in home screen widgets."
              value={isDisplayWidgetBalanceAllowed}
              onValueChange={onWidgetsTotalBalanceValueChange}
              disabled={busy}
            />
          ) : null}
        </SettingsSection>
      )}

      <SettingsSection label="DIAGNOSTICS">
        <SettingsSwitchRow
          icon="bar-chart-2"
          title={loc.settings.privacy_do_not_track}
          note="When on, no performance or reliability information is sent for analysis."
          value={doNotTrackSwitchValue}
          onValueChange={onDoNotTrackValueChange}
          disabled={busy}
        />
      </SettingsSection>

      <SettingsSection label="THIS PHONE">
        <SettingsRow
          icon="settings"
          title={loc.settings.privacy_system_settings}
          note="Camera, photos and notifications are allowed or refused in the phone’s own Settings."
          onPress={openApplicationSettings}
          testID="PrivacySystemSettings"
        />
      </SettingsSection>
    </SettingsScreen>
  );
};

SettingsPrivacy.navigationOptions = settingsNavigation(() => loc.settings.privacy);

export default SettingsPrivacy;
