import React from 'react';
import { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import navigationStyle from '../../components/navigationStyle';
import loc from '../../loc';
import ListItem from '../../components/ListItem';
import { BlueStorageContext } from '../../blue_modules/storage-context';
const BlueApp = require('../../BlueApp');

const NetworkSettings = () => {
  const { navigate } = useNavigation();

  const navigateToIsItMyAddress = () => {
    navigate('IsItMyAddress');
  };

  const navigateToBroadcast = () => {
    navigate('Broadcast');
  };

  const navigateToGenerateWord = () => {
    navigate('GenerateWord');
  };

  const deleteAllWallets = async () => {
    BlueApp.deleteAllWallets(); // This will clear the wallet array and save the empty array to disk
    // Assuming you have a state in your component that tracks the wallets
    console.log('All wallets have been deleted.');
    navigate('WalletList')
};

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustContentInsets>
      <ListItem title={loc.is_it_my_address.title} onPress={navigateToIsItMyAddress} testID="IsItMyAddress" chevron />
      <ListItem title={loc.settings.network_broadcast} onPress={navigateToBroadcast} testID="Broadcast" chevron />
      <ListItem title={loc.autofill_word.title} onPress={navigateToGenerateWord} testID="GenerateWord" chevron />
      <ListItem title={'Complete App Reset'} onPress={deleteAllWallets} testID="ResetApp" chevron />
    </ScrollView>
  );
};

NetworkSettings.navigationOptions = navigationStyle({}, opts => ({ ...opts, headerTitle: loc.settings.tools }));

export default NetworkSettings;
