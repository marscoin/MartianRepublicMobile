import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, Dimensions, Image, Alert, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import Snackbar from 'react-native-snackbar';
import sha256 from 'crypto-js/sha256';
import axios from 'axios';

const windowWidth = Dimensions.get('window').width;
const BlueElectrum = require('../../blue_modules/BlueElectrum');

const EndorseConfirmationScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const person = route.params.person;
  //console.log('PARAMS person',person )

  const goBackPressed = () => {navigation.navigate('CitizenScreen')};
  const endorsePressed = () => {navigation.navigate('EndorseSuccessScreen')};

  const { colors } = useTheme();
   const stylesHook = StyleSheet.create({
    root: {
      backgroundColor: colors.elevated,
    },
  });

  const bip39 = require("bip39");
  const { BIP32Factory } = require('bip32')
  const ecc = require('tiny-secp256k1')
  const bip32 = BIP32Factory(ecc)
  const bitcoin = require("bitcoinjs-lib");

  const MARSCOIN = {
    messagePrefix: "\x19Marscoin Signed Message:\n",
    bech32: "M",
    bip44: 2,
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    pubKeyHash: 0x32,
    scriptHash: 0x32,
    wif: 0x80,
  };

const [civic, setCivic] = useState('')
const [wallet, setWallet] = useState(null);

const {wallets} = useContext(BlueStorageContext);
function getCivicWallet(wallets) {
    // Loop through the wallets array
    for (let wallet of wallets) {
        // Check if the wallet has the civic property set to true
        if (wallet.civic) {
            console.log('CIVIC WALLET IS SET!' );
            setWallet(wallet)
            setCivic(wallet._address)
            return wallet;
        }
    }
    return null;  // Return null if no civic wallet is found
  }  

  useEffect(() => {
    getCivicWallet(wallets)
  }, []);

  const broadcast = async transaction => {
    /////SENDING TX TO BLOCKCHAIN/////
    await BlueElectrum.ping();
    await BlueElectrum.waitTillConnected();
    const result = await wallet.broadcastTx(transaction);
    if (!result) {
      throw new Error(loc.errors.broadcast);
    }
    return result;
  };

  const sendMetadata = async (message) => {
    console.log('SEND METADATA!!! START')
    setIsLoading(true);
    try {
      const utxos = wallet.getUtxo(); 
      //console.log('wallet._utxo!!!', wallet._utxo)
      const civicTrimmed = civic.trim();
      // const lutxo = wallet._utxo.filter(utxo => utxo.address.trim() === civicTrimmed);
      const lutxo = utxos.filter(utxo => utxo.address.trim() === civicTrimmed);

      // Calculate the total balance for the civic address
      const totalBalance = lutxo.reduce((sum, utxo) => sum + utxo.value, 0);
      
      // Check if the total balance is sufficient
        if (totalBalance === 0 ) {
        Alert.alert(
            'Not enough balance',
            `Your balance of your CIVIC address is too low for this transaction. Available: ${totalBalance} M. Please fund ${civic}.`
        );
        setIsLoading(false);
        return;
        }
      //console.log('Filtered UTXOs:', lutxo);
      const targets = [];
      targets.push({ address: civic, value: 0 });
      // console.log('targets', targets)
      
      const feeRate = 50
      //const feeRate = String(networkTransactionFees.mediumFee);
      console.log('FEEEEEEE::::', feeRate);
      const requestedSatPerByte = Number(feeRate);
      console.log('requestedSatPerByte::::', requestedSatPerByte);
      const change = civic;
  
      const { tx, outputs, psbt, fee } = await wallet.createTransaction(
        lutxo,
        targets,
        requestedSatPerByte,
        change,
        undefined, // sequence
        false,     // skipSigning
        undefined, // masterFingerprint
        message    // message
      );
 
      const txHex = tx.toHex();
      broadcastResult = await broadcast(txHex);
      console.log('Broadcast result:', broadcastResult);

      // Snackbar.show({ text: 'Data published successfully!', duration: Snackbar.LENGTH_SHORT });
      setIsLoading(false);
      navigation.navigate('EndorseSuccessScreen', {person: person})

    } catch (error) {
      console.error("Failed to send metadata:", error);
      Snackbar.show({ text: `Error: ${error.message}`, duration: Snackbar.LENGTH_LONG });
      setIsLoading(false);
    }
  };

  const validateAndSubmit = async () => {
    setIsLoading(true); 
    const token = await AsyncStorage.getItem('@auth_token');
    yourAddress = civic;
    userAddress = person.address

    const messageText = `Citizen ${yourAddress} herewith endorses ${userAddress}. May you live long and prosper!`;
    console.log('messageText', messageText)
    setIsPublishing(true);
    //Snackbar.show({ text: 'Publishing...', duration: Snackbar.LENGTH_INDEFINITE });

    try {
        const dataObject = {
            data: {
              message: messageText
            }
          };
    
    // Hash the data.message string
    const jsonString = JSON.stringify(dataObject.data);
    const hash = sha256(jsonString).toString();
    dataObject.meta = { hash };

    // Convert the entire object to JSON
    const completeData = JSON.stringify(dataObject);
    console.log('Complete Data:', completeData);

    // Send to the IPFS and cache API
    const { data } = await axios.post(
      'https://martianrepublic.org/api/pinjson',
      {
        type: 'endorsement',
        payload: completeData,
        address: yourAddress
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    console.log('data', data)
      if (data.Hash) {
        const cid = data.Hash;
        const message = "ED_" + cid;
        console.log('Message:', message);
        sendMetadata(message) 
      } else {
        throw new Error('Failed to pin data');
      }
    } catch (error) {
      Snackbar.show({ text: `Failed to publish: ${error.message}`, duration: Snackbar.LENGTH_SHORT });
      console.error('Publishing failed:', error);
    } 
    finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <Text style={styles.mainText}>CONFIRM ENDORSING THE USER:</Text>
      <View style={styles.userContainer}>
            <Image    
                source={
                     !person.user.citizen || !person.user.citizen.avatar_link
                    ? require('../../img/genericprofile.png')
                    : { uri: person.user.citizen.avatar_link }
                }
                style={styles.userImage} 
                onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: item.id } })}
            />
            <View style={{ marginHorizontal: 10, width: windowWidth * 0.45 }}>
                <Text numberOfLines={2} style={styles.userName}>{person.user.fullname}</Text>
                <Text numberOfLines={1} style={styles.userAddress}>Address: {person.address.slice(0,9)}</Text>
                <Text numberOfLines={1} style={styles.userDate}>Joined: {new Date(person.created_at).toLocaleDateString()}</Text>
                </View>
            </View>

        <View style={styles.buttonContainer}>
            {isLoading ? (
                <ActivityIndicator size="large" color="white" />
                ) : (
                <Button onPress={validateAndSubmit} title={'ENDORSE'} />)
            }
            <View style={{ width: 20 }} />
            <Button onPress={goBackPressed} title={'GO BACK'} />
        </View>
        {isLoading ? (
            <Text textAlign='center' style={[styles.userAddress,{marginHorizontal:20, alignSelf:'center'}]}>Please wait! Endorsement transaction is in process.</Text>
        ) : (
            <></>
        )}
    </SafeArea>
  );
};

export default EndorseConfirmationScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 19,
  },
  mainText: {
    color:'white', 
    textAlign: 'center',
    fontSize: 24,
    fontWeight:"600",
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.1, 
    marginHorizontal:16,
    marginTop: 30, 
},
  buttonContainer: {
    paddingHorizontal: 30,
    paddingBottom: 16,
    flexDirection: 'row',
  },
  userContainer: {
    padding: 16,
    borderWidth: 0.5,
    borderColor: '#FFF',
    marginVertical: 50,
    marginHorizontal: 20,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  userImage: {
    width: windowWidth * 0.3,
    height: windowWidth * 0.3,
    marginHorizontal: 5,
    borderRadius: 10
},
userAddress: {
    fontSize: 12,
    color: '#FFF',
    marginTop: 5,
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2,
},
userDate: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 5,
    fontFamily: 'Orbitron-Regular',
},
userName: {
    fontSize: 18,
    color:  '#FF7400',
    fontFamily: 'Orbitron-Regular',
    fontWeight:"500",
    letterSpacing: 1.1, 
},
});
