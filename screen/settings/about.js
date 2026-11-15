import { marsAlert } from '../../components/MarsDialog';
import React, { useContext } from 'react';
import { Linking, View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getApplicationName, getVersion, getBundleId, getBuildNumber, getUniqueIdSync, hasGmsSync } from 'react-native-device-info';
import { openStoreReview } from '../../blue_modules/app-review';
import loc, { formatStringAddTwoWhiteSpaces } from '../../loc';
import Clipboard from '@react-native-clipboard/clipboard';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import presentAlert from '../../components/Alert';
import { HDSegwitBech32Wallet } from '../../class';
import { CivicButton } from '../../components/CivicUi';
import {
  SettingsCard,
  SettingsCardText,
  SettingsLink,
  SettingsRow,
  SettingsScreen,
  SettingsSection,
  settingsColors,
  settingsNavigation,
} from '../../components/SettingsUi';

const A = require('../../blue_modules/analytics');
const branch = require('../../current-branch.json');

const About = () => {
  const { navigate } = useNavigation();
  const { width, height } = useWindowDimensions();
  const { isElectrumDisabled } = useContext(BlueStorageContext);
  const handleOnReleaseNotesPress = () => {
    navigate('ReleaseNotes');
  };

  const handleOnSelfTestPress = () => {
    if (isElectrumDisabled) {
      presentAlert({ message: loc.settings.about_selftest_electrum_disabled });
    } else {
      navigate('Selftest');
    }
  };

  const handleOnLicensingPress = () => {
    navigate('Licensing');
  };

  const handleOnRepublicPress = () => {
    Linking.openURL('https://martianrepublic.org');
  };

  const handleOnMarscoinPress = () => {
    Linking.openURL('https://marscoin.org');
  };

  const handleOnGithubPress = () => {
    Linking.openURL('https://github.com/BlueWallet/BlueWallet');
  };
  const handleOnRatePress = () => openStoreReview();

  return (
    <SettingsScreen testID="AboutScrollView" title={loc.settings.about}>
      <SettingsCard>
        <SettingsCardText strong>{getApplicationName()}</SettingsCardText>
        <SettingsCardText>{loc.settings.about_free}</SettingsCardText>
        <SettingsCardText>{formatStringAddTwoWhiteSpaces(loc.settings.about_backup)}</SettingsCardText>
        {((Platform.OS === 'android' && hasGmsSync()) || Platform.OS !== 'android') && (
          <CivicButton onPress={handleOnRatePress} title={loc.settings.about_review} icon="star" />
        )}
      </SettingsCard>

      <SettingsSection label="ON THE WEB">
        <SettingsRow
          icon="globe"
          title="martianrepublic.org"
          note="The Republic: citizens, proposals and votes."
          onPress={handleOnRepublicPress}
        />
        <SettingsRow icon="circle" title="marscoin.org" note="The coin this wallet holds." onPress={handleOnMarscoinPress} />
      </SettingsSection>

      <SettingsSection label="BUILT WITH">
        <SettingsRow
          icon="github"
          title="BlueWallet"
          note="The open-source wallet this app grew from. Also: React Native, bitcoinjs-lib, Node.js and Electrum servers."
          onPress={handleOnGithubPress}
        />
      </SettingsSection>

      <SettingsSection label="MORE">
        <SettingsRow icon="book" onPress={handleOnReleaseNotesPress} title={loc.settings.about_release_notes} />
        <SettingsRow icon="file-text" onPress={handleOnLicensingPress} title={loc.settings.about_license} />
        <SettingsRow icon="check-circle" onPress={handleOnSelfTestPress} testID="RunSelfTestButton" title={loc.settings.about_selftest} />
        <SettingsRow
          icon="activity"
          onPress={async () => {
            const secret = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
            const w = new HDSegwitBech32Wallet();
            w.setSecret(secret);

            const start = Date.now();
            let num;
            for (num = 0; num < 1000; num++) {
              w._getExternalAddressByIndex(num);
              if (Date.now() - start > 10 * 1000) {
                break;
              }
            }

            marsAlert(loc.formatString(loc.settings.performance_score, { num }));
          }}
          title={loc.settings.run_performance_test}
        />
      </SettingsSection>

      <View style={styles.build}>
        <Text style={styles.buildText}>
          {getApplicationName()} ver {getVersion()} (build {getBuildNumber() + ' ' + branch})
        </Text>
        <Text style={styles.buildText}>{new Date(getBuildNumber() * 1000).toGMTString()}</Text>
        <Text style={styles.buildText}>{getBundleId()}</Text>
        <Text style={styles.buildText}>
          w, h = {width}, {height}
        </Text>
        <Text style={styles.buildText}>Unique ID: {getUniqueIdSync()}</Text>
        <SettingsLink
          title={loc.transactions.details_copy}
          onPress={() => {
            const stringToCopy = 'userId:' + getUniqueIdSync();
            A.logError('copied unique id');
            Clipboard.setString(stringToCopy);
          }}
        />
      </View>
    </SettingsScreen>
  );
};

const styles = StyleSheet.create({
  build: { marginTop: 28, alignItems: 'center' },
  buildText: { color: settingsColors.faint, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});

About.navigationOptions = settingsNavigation(() => loc.settings.about);
export default About;
