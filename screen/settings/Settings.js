import React, { useContext, useState, useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Dialog from 'react-native-dialog';
import RNRestart from 'react-native-restart'; 
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import navigationStyle from '../../components/navigationStyle';
import { BlueHeaderDefaultSub } from '../../BlueComponents';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import ListItem from '../../components/ListItem';
const BlueApp = require('../../BlueApp');

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
    const token = await AsyncStorage.getItem('@auth_token');
    response = await axios.post("https://martianrepublic.org/api/scitizen", {
      }, {
      headers: {'Authorization': `Bearer ${token}`}
    })
    console.log('USER DATA', response.data);
    setUserData(response.data)
  }

  async function deleteUser(id) {
    console.log('DELETE USER id', id);
    const token = await AsyncStorage.getItem('@auth_token');
    response = await axios.post(`https://martianrepublic.org/api/user/delete/${id}`, {
      }, {
      headers: {'Authorization': `Bearer ${token}`}
    })
    console.log('DELETE USER RESPONSE', response);
  }

  useEffect(() => {
    fetchUser()
  }, []);  

  const openTermsOfService = () => {
    Linking.openURL('https://martianrepublic.org/tos').catch(err => console.error("Couldn't load page", err));
  };

  const deleteAllWallets = useCallback(async () => {
    await BlueApp.deleteAllWallets(); // Ensure this is awaited if asynchronous
    console.log('All wallets have been deleted.');
    RNRestart.Restart(); 
  }, []);

  const handleConfirmReset = useCallback(() => {
    if (confirmInput === 'Confirm') {
      deleteAllWallets()

    } else {
      alert('The confirmation text does not match. Please type "Confirm" to proceed.');
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
                console.error('Error deleting user:', error);
                alert('There was an error deleting the user. Please try again.');
            });
    } else {
        alert('The confirmation text does not match. Please type "Confirm" to proceed.');
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
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustContentInsets>
      {Platform.OS === 'android' ? <BlueHeaderDefaultSub leftText={loc.settings.header} /> : <></>}
      <ListItem title={'General'} onPress={() => navigate('GeneralSettings')} testID="GeneralSettings" chevron />
      <ListItem title={"Currency"} onPress={() => navigate('Currency')} testID="Currency" chevron />
      {/* <ListItem title={loc.settings.language} onPress={() => navigate('Language')} testID="Language" chevron /> */}
      <ListItem title={'Security'} onPress={() => navigate('EncryptStorage')} testID="SecurityButton" chevron />
      <ListItem title={'Network'} onPress={() => navigate('NetworkSettings')} testID="NetworkSettings" chevron />
      <ListItem title={"Tools"} onPress={() => navigate('Tools')} testID="Tools" chevron />
      <ListItem title={"Terms of service"} onPress={openTermsOfService} testID="TermsOfService" chevron />
      <ListItem title={'Complete App Reset'} onPress={showDialog} testID="ResetApp" chevron />
      <ListItem title={'Delete account'} onPress={showDialogDelete} testID="DeleteApp" chevron />
      {/* <ListItem title={loc.settings.about} onPress={() => navigate('About')} testID="AboutButton" chevron /> */}
    </ScrollView>

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
  headerTitle: Platform.select({ ios: loc.settings.header, default: '' }),
  headerLargeTitle: true,
});
