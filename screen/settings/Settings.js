import { getCivicToken } from '../../blue_modules/civic-api';
import React, { useContext, useState, useCallback, useEffect } from 'react';
import { StyleSheet, Platform, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { marsAlert } from '../../components/MarsDialog';
import { useNavigation } from '@react-navigation/native';
import Dialog from 'react-native-dialog';
import RNRestart from 'react-native-restart'; 
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import navigationStyle from '../../components/navigationStyle';
import { SettingsHeader, SettingsRow, SettingsScreen, SettingsSection } from '../../components/SettingsUi';
import { BlueHeaderDefaultSub } from '../../BlueComponents';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
const BlueApp = require('../../BlueApp');

const styles = StyleSheet.create({
  content: { paddingBottom: 150 },
  androidTop: { height: 24 },
  flex: { flex: 1 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14171B',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FF812D',
    padding: 16,
  },
  featureIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1D2126', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  featureTitle: { color: '#F5F1EB', fontFamily: 'ChakraPetch-Bold', fontSize: 18 },
  note: { color: '#8A9098', fontSize: 13, lineHeight: 18, marginTop: 2 },
});

const Settings = () => {
  const { navigate } = useNavigation();
  // By simply having it here, it'll re-render the UI if language is changed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { language } = useContext(BlueStorageContext);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogDeleteVisible, setDialogDeleteVisible] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [userData, setUserData] = useState('');

  async function fetchUser() {
    const token = await getCivicToken();
    const response = await axios.post("https://martianrepublic.org/api/scitizen", {
      }, {
      headers: {'Authorization': `Bearer ${token}`}
    })

    setUserData(response.data)
  }

  async function deleteUser(id) {

    const token = await getCivicToken();
    const response = await axios.post(`https://martianrepublic.org/api/user/delete/${id}`, {
      }, {
      headers: {'Authorization': `Bearer ${token}`}
    })

  }

  useEffect(() => {
    fetchUser()
  }, []);  

  const openTermsOfService = () => {
    Linking.openURL('https://martianrepublic.org/tos').catch(err => console.error("Couldn't load page", err));
  };

  const deleteAllWallets = useCallback(async () => {
    await BlueApp.deleteAllWallets(); // Ensure this is awaited if asynchronous

    RNRestart.Restart(); 
  }, []);

  const handleConfirmReset = useCallback(() => {
    if (confirmInput === 'Confirm') {
      deleteAllWallets()

    } else {
      marsAlert('Not confirmed', 'The text did not match. Type "Confirm" to proceed.');
      setConfirmInput(''); // Reset input
    }
    setDialogVisible(false); // Close dialog regardless of input after attempt
  }, [confirmInput]);

  const handleDeleteUser = useCallback(() => {
    if (confirmInput === 'Confirm') {
        deleteUser(userData.citizen.userid)
            .then(() => {
                // Only call deleteAllWallets after deleteUser is done
                deleteAllWallets();
            })
            .catch(error => {

                marsAlert('Account not deleted', 'Something went wrong. Please try again.');
            });
    } else {
        marsAlert('Not confirmed', 'The text did not match. Type "Confirm" to proceed.');
        setConfirmInput(''); // Reset input
    }
    setDialogVisible(false); // Close dialog regardless of input after attempt
}, [confirmInput]);


  const showDialog = () => {
    setDialogVisible(true);
  };
  const showDialogDelete = () => {
    setDialogDeleteVisible(true);
  };

  const handleCancel = () => {
    setDialogVisible(false);
    setDialogDeleteVisible(false);
    setConfirmInput('');
  };

  return (
    <>
    <SettingsScreen
      contentStyle={styles.content}
      header={
        <>
          {Platform.OS === 'android' ? <View style={styles.androidTop} /> : null}
          {Platform.OS === 'android' ? <BlueHeaderDefaultSub leftText={loc.settings.header} /> : null}
          <SettingsHeader overline="MCR / SETTINGS" title="Settings" />
        </>
      }
    >
      <TouchableOpacity accessibilityRole="button" style={styles.feature} onPress={() => navigate('NetworkLive')} testID="NetworkLive">
        <View style={styles.featureIcon}>
          <Icon name="activity" type="feather" size={22} color="#FF812D" />
        </View>
        <View style={styles.flex}>
          <Text style={styles.featureTitle}>The network, live</Text>
          <Text style={styles.note}>See every service your phone is talking to, and how fast each one answers.</Text>
        </View>
        <Icon name="chevron-right" type="feather" size={20} color="#6B7178" />
      </TouchableOpacity>

      <SettingsSection label="THIS APP">
        <SettingsRow icon="sliders" title="General" note="Start screen, advanced mode and other preferences." onPress={() => navigate('GeneralSettings')} testID="GeneralSettings" />
        <SettingsRow icon="dollar-sign" title="Currency" note="The currency amounts are also shown in." onPress={() => navigate('Currency')} testID="Currency" />
        <SettingsRow icon="lock" title="Security" note="Password, Face ID and encrypted storage." onPress={() => navigate('EncryptStorage')} testID="SecurityButton" />
        <SettingsRow icon="server" title="Network" note="The Marscoin server your wallet is connected to, and notifications." onPress={() => navigate('NetworkSettings')} testID="NetworkSettings" />
        <SettingsRow icon="tool" title="Tools" note="Broadcast a transaction, check an address and more." onPress={() => navigate('Tools')} testID="Tools" />
      </SettingsSection>

      <SettingsSection label="THE REPUBLIC">
        <SettingsRow icon="file-text" title="Terms of service" note="Opens martianrepublic.org." onPress={openTermsOfService} testID="TermsOfService" />
      </SettingsSection>

      <SettingsSection label="START OVER">
        <SettingsRow icon="refresh-ccw" title="Reset this app" note="Removes every wallet from this phone. Your coins stay on the chain; you need your twelve words to get back to them." onPress={showDialog} testID="ResetApp" danger />
        <SettingsRow icon="user-x" title="Delete account" note="Deletes your Republic account and removes every wallet from this phone." onPress={showDialogDelete} testID="DeleteApp" danger />
      </SettingsSection>
    </SettingsScreen>

    <Dialog.Container visible={dialogVisible}>
        <Dialog.Title>App Reset Confirmation</Dialog.Title>
        <Dialog.Description>
          This action will delete all wallets from this app. Before proceeding, please be aware that you will not be able to recover the funds without these wallets' seed phrases. Please type "Confirm" to proceed.
        </Dialog.Description>
        <Dialog.Input 
          placeholder="Type here..."
          value={confirmInput}
          onChangeText={setConfirmInput}
        />
        <Dialog.Button label="Cancel" onPress={handleCancel} />
        <Dialog.Button label="Confirm" onPress={handleConfirmReset} />
    </Dialog.Container>

    <Dialog.Container visible={dialogDeleteVisible}>
        <Dialog.Title>Delete your account? </Dialog.Title>
        <Dialog.Description>
          This action will delete your account. Before proceeding, please be aware that you will not be able to recover the funds without these wallets' seed phrases. Please type "Confirm" to proceed.
        </Dialog.Description>
        <Dialog.Input 
          placeholder="Type here..."
          value={confirmInput}
          onChangeText={setConfirmInput}
        />
        <Dialog.Button label="Cancel" onPress={handleCancel} />
        {/* <Dialog.Button label="Confirm" onPress={handleConfirmReset} /> */}
        <Dialog.Button label="Confirm" onPress={handleDeleteUser} />
    </Dialog.Container>
</>
  );
};

export default Settings;
Settings.navigationOptions = navigationStyle({
  headerTransparent: true,
  headerTitle: '',
});
