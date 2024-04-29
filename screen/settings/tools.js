import React, { useState, useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import Dialog from 'react-native-dialog';
import { useNavigation } from '@react-navigation/native';
import RNRestart from 'react-native-restart'; 

import navigationStyle from '../../components/navigationStyle';
import loc from '../../loc';
import ListItem from '../../components/ListItem';
const BlueApp = require('../../BlueApp');

const NetworkSettings = () => {
  const { navigate } = useNavigation();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const navigateToIsItMyAddress = () => {
    navigate('IsItMyAddress');
  };

  const navigateToBroadcast = () => {
    navigate('Broadcast');
  };

  const navigateToGenerateWord = () => {
    navigate('GenerateWord');
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

  const showDialog = () => {
    setDialogVisible(true);
  };

  const handleCancel = () => {
    setDialogVisible(false);
    setConfirmInput('');
  };


  return (
    <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustContentInsets>
      <ListItem title={loc.is_it_my_address.title} onPress={navigateToIsItMyAddress} testID="IsItMyAddress" chevron />
      <ListItem title={loc.settings.network_broadcast} onPress={navigateToBroadcast} testID="Broadcast" chevron />
      <ListItem title={loc.autofill_word.title} onPress={navigateToGenerateWord} testID="GenerateWord" chevron />
      <ListItem title={'Complete App Reset'} onPress={showDialog} testID="ResetApp" chevron />
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
  </>
  );
};

NetworkSettings.navigationOptions = navigationStyle({}, opts => ({ ...opts, headerTitle: loc.settings.tools }));

export default NetworkSettings;
