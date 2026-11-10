import { marsAlert } from '../blue_modules/mars-alert';
import { Linking } from 'react-native';
import { getSystemName } from 'react-native-device-info';
import loc from '../loc';

const isDesktop: boolean = getSystemName() === 'Mac OS X';

export const openPrivacyDesktopSettings = () => {
  if (isDesktop) {
    Linking.openURL('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
  } else {
    Linking.openSettings();
  }
};

export const presentCameraNotAuthorizedAlert = (error: string) => {
  marsAlert(
    loc.errors.error,
    error,
    [
      {
        text: loc.send.open_settings,
        onPress: openPrivacyDesktopSettings,
        style: 'default',
      },
      {
        text: loc._.ok,
        onPress: () => {},
        style: 'cancel',
      },
    ],
    { cancelable: true },
  );
};
