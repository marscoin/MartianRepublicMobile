import React, { useEffect, useState, useRef, useContext, useMemo } from 'react';
import { Platform, Alert, SafeAreaView, ScrollView, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';
import { BlueSpacing20 } from '../../BlueComponents';
import RNFS from 'react-native-fs';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import Snackbar from 'react-native-snackbar';
import sha256 from 'crypto-js/sha256';
import bitcoin from 'bitcoinjs-lib';
import { HDSegwitBech32Wallet, MultisigHDWallet, WatchOnlyWallet } from '../../class';
import { AbstractHDElectrumWallet } from '../../class/wallets/abstract-hd-electrum-wallet';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import BigNumber from 'bignumber.js';
import NetworkTransactionFees, { NetworkTransactionFee } from '../../models/networkTransactionFees';

const BlueElectrum = require('../../blue_modules/BlueElectrum');

const JoinGeneralPublicApplicationScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const { colors, fonts } = useTheme();
  const styles = getStyles(colors, fonts);

  const [networkTransactionFees, setNetworkTransactionFees] = useState(new NetworkTransactionFee(3, 2, 1));
  const {wallets} = useContext(BlueStorageContext);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [changeAddress, setChangeAddress] = useState();

  const [customFee, setCustomFee] = useState(null);
  const [feePrecalc, setFeePrecalc] = useState({ current: null, slowFee: null, mediumFee: null, fastestFee: null });
  const [feeUnit, setFeeUnit] = useState();

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

  //const {firstName, lastName, displayName, bio, photo, video} = route.params;
  //console.log('PARAMS',route.params )
  const params = route.params;
  //const params = {"bio": "TestNew", "address": 'MC1kMoACQZQwmR8tSSmSQzUBDUYhEKkbee', "displayName": "Test New", "firstName": "MobileTest New", "lastName": "test new", "photo": "https://ipfs.marscoin.org/ipfs/QmdGcEhQp862VDhxCHYo8vcAfMiQgwc8kYfkdM2F6vsdLT", "video": "https://ipfs.marscoin.org/ipfs/QmQ6ebHWPbhDpjrePbwV3PjUDxnMAMRHWDRhA56gU6BxxJ"}
  console.log('PARAMS Check', params )
  const [civic, setCivic] = useState('')

  const [formData, setFormData] = useState({
    firstName: params.firstName,
    lastName: params.lastName,
    displayName: params.displayName,
    bio: params.bio,
    photo: params.photo,
    video: params.video,
    //civic: civic
  });

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

  const toggleVerify = () => setIsVerified(!isVerified);

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
      //console.log('civic', civic)
      const civicTrimmed = civic.trim();
      // const lutxo = wallet._utxo.filter(utxo => utxo.address.trim() === civicTrimmed);
      const lutxo = utxos.filter(utxo => utxo.address.trim() === civicTrimmed);
      console.log('Filtered UTXOs:', lutxo);
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

      Snackbar.show({ text: 'Data published successfully!', duration: Snackbar.LENGTH_SHORT });
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to send metadata:", error);
      Snackbar.show({ text: `Error: ${error.message}`, duration: Snackbar.LENGTH_LONG });
      setIsLoading(false);
    }
  };

  const validateAndSubmit = async () => {
    const { firstName, lastName, displayName, bio, photo, video, civic } = formData;
    const token = await AsyncStorage.getItem('@auth_token');

    if (!firstName || !lastName || !displayName || !bio || !photo || !video) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    setIsPublishing(true);
    //Snackbar.show({ text: 'Publishing...', duration: Snackbar.LENGTH_INDEFINITE });

    try {
      const dataObject = { data: formData };
      const jsonString = JSON.stringify(dataObject.data);
      console.log('JSON:', jsonString)
      const hash = sha256(jsonString).toString();
      console.log('JSON hash:', hash)
      dataObject.meta = { hash };
      const completeData = JSON.stringify(dataObject);
      console.log('completeData:', completeData)
      const { data } = await axios.post('https://martianrepublic.org/api/pinjson', {
        type: 'data',
        payload: completeData,
        address: civic
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (data.Hash) {
        const cid = data.Hash;
        const message = "GP_" + cid;
        console.log('message: ', message)
        sendMetadata(message) 
      } else {
        throw new Error('Failed to pin data');
      }
    } catch (error) {
      Snackbar.show({ text: `Failed to publish: ${error.message}`, duration: Snackbar.LENGTH_SHORT });
      console.error('Publishing failed:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const copyToClipboard = (text) => {
    Clipboard.setString(text);
    console.log('copied to clipboard', text)
    Snackbar.show({
      text: `${text} copied to clipboard!`,
      duration: Snackbar.LENGTH_SHORT,
      numberOfLines: 5
    });
  };

  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
      <ScrollView 
        style={styles.root}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 200 }}
      >
        <TouchableOpacity 
          style={{flexDirection:'row', justifyContent:'space-between', marginTop: 20, marginLeft: 20}}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
        </TouchableOpacity>
    
        <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 30,}}>
          <Text style={{fontFamily: fonts.regular.fontFamily, marginLeft: 20,color: 'white', fontSize: 20,}}>APPLICATION</Text>
          <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>3/3</Text>
        </View>

        <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Check your application data: </Text>
        </View>

        <BlueSpacing20/>

        <View style={styles.orangeBox}>
          <View style={styles.headerBox}>
            <Text style={styles.headerText}>Full Name: </Text>
          </View> 
          <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(`${params.firstName} ${params.lastName}`)}>
            <Text style={styles.contentText}>{params.firstName}</Text>
            <Text style={styles.contentText}> {params.lastName} </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.orangeBox}>
            <View style={styles.headerBox}>
              <Text style={styles.headerText}>Display Name: </Text>
            </View>
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(params.displayName)}>
              <Text style={styles.contentText}>{params.displayName} </Text>
            </TouchableOpacity>
        </View>

        <View style={styles.orangeBox}>
            <View style={styles.headerBox}>
              <Text style={styles.headerText}>Short Bio: </Text>
            </View>
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(params.bio)}>
              <Text style={styles.contentText}>{params.bio} </Text>
            </TouchableOpacity>
        </View>

        <View style={styles.orangeBox}>
            <View style={styles.headerBox}>
              <Text style={styles.headerText}>Profile Picture: </Text>
            </View>
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(`/${params.photo}`)}>
              <Text style={styles.contentText}>{`${params.photo}`}</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.orangeBox}>
            <View style={styles.headerBox}>
              <Text style={styles.headerText}>Liveness Video Proof: </Text>
            </View>
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(`${params.video}`)}>
              <Text style={styles.contentText}>{`${params.video}`}</Text>
            </TouchableOpacity>
        </View>

        <View style={[styles.orangeBox, {borderBottomWidth: 1}]}>
            <View style={styles.headerBox}>
              <Text style={styles.headerText}>Civic Address: </Text>
            </View>
            {wallet && <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(params.address)}>
              <Text style={styles.contentText}>{wallet._address} </Text>
            </TouchableOpacity>}
        </View>

        {/* Checkbox for Verification */}
        <View style={styles.checkboxContainer}>
          <TouchableOpacity style={styles.checkbox} onPress={toggleVerify}>
            <Icon name={isVerified ? "check-square" : "square"} size={24} type="font-awesome-5" color={isVerified ? '#FF7400' : 'gray'} />
          </TouchableOpacity>
          <Text style={styles.checkboxLabel} onPress={toggleVerify}>{`I, ${params.firstName} ${params.lastName}, verify that all data is correct and final. I confirm publishing my application data in Marscoin blockchain. `}</Text>
        </View>

         <View style={{flex:1}}>
         <LinearGradient colors={ isVerified ? ['#FFB67D','#FF8A3E', '#FF7400']: ['gray', 'gray']} style={styles.joinButtonGradient}>
            <TouchableOpacity 
              style={styles.joinButton}
              onPress={validateAndSubmit} 
              disabled={isPublishing}
            >
                <Text style={styles.buttonText}>PUBLISH APPLICATION</Text>
            </TouchableOpacity>  
          </LinearGradient>

            {/* {!isFormValid &&
              <Text style={[styles.smallText, {marginTop: 10}]}>Notarize via a blockchain transaction</Text>} */}
        </View> 
      </ScrollView>  
    </SafeAreaView>
  );
};

const getStyles = (colors, fonts) => StyleSheet.create({
  root: {
    flex:1
  },
  orangeBox: {
    width: '90%',
    flexDirection: 'row',
    marginHorizontal: '5%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor:'#FF7400', 
    alignSelf:'center',
  },
  headerBox: {
    width: '40%',
    height: '100%',
    borderRightWidth: 1,
    backgroundColor: '#2F2D2B',
    borderColor:'#FF7400', 
    padding: 10
  },
  contentBox: {
    flex:1,
    flexDirection: 'row',
    backgroundColor: 'black',  
    padding: 10,
  },
  smallText: {
    color:'white', 
    textAlign: 'center',
    justifyContent:'center',
    fontSize: 10,
    fontFamily: 'Orbitron-SemiBold'
  },
  medText: {
    color:'white', 
    fontSize: 16,
    fontFamily: fonts.fontFamily,
    fontWeight:"400",
    fontFamily: 'Orbitron-Regular',
  },
  headerText: {
    color:'#FF7400',
    fontSize: 14,
    fontFamily: fonts.fontFamily,
    fontWeight:"600",
    fontFamily: 'Orbitron-Regular',
    alignSelf: 'flex-start'
  },
  contentText: {
    color:'white', 
    fontSize: 14,
    fontFamily: fonts.fontFamily,
    fontWeight:"400",
    fontFamily: 'Orbitron-Regular',
    lineHeight:16
  },
  buttonText: {
    color:'white', 
    textAlign: 'center',
    fontSize: 18,
    fontWeight:"600",
    fontFamily: fonts.regular.fontFamily
  },
  joinButton: {
    paddingVertical:10,
    borderRadius: 20,
    marginHorizontal: 20,
    justifyContent:'center',
  },
  joinButtonGradient: {
    paddingVertical:10,
    alignItems:'center',
    justifyContent:'center',
    borderRadius: 20,
    marginHorizontal: 40,
    marginTop: 50
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    marginHorizontal: 20
  },
  checkbox: {
    marginRight: 12,
    backgroundColor: '#2F2D2B'
  },
  checkboxLabel: {
    fontSize: 14,
    color: 'white',
    fontFamily: fonts.regular.fontFamily,
    marginRight: 20,
    lineHeight: 18
  },
});
export default JoinGeneralPublicApplicationScreen;
