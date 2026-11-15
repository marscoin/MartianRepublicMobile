import { marsAlert } from '../../components/MarsDialog';
import { readCitizenshipDraft, saveCitizenshipDraft } from '../../blue_modules/citizenship-draft';
import { prepareCitizenshipPublication, publishCitizenshipTransaction } from '../../blue_modules/citizenship-publication';
import { fetchGrantOffer, claimGrantOffer, waitForGrant } from '../../blue_modules/welcome-grant';
import { startPublishing, acceptGift, giftAmountText, GIFT_PROGRESS } from '../../blue_modules/welcome-gift';
import WelcomeGift from '../../components/WelcomeGift';
import { getCivicToken } from '../../blue_modules/civic-api';
import React, { useEffect, useState, useRef, useContext, useMemo } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList } from 'react-native';
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

const MARSConnection = require('../../blue_modules/MARSConnection');

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
  const [progress, setProgress] = useState('');
  // The welcome gift: the offer on show, how far accepting it has got, and
  // whether it was turned down this visit.
  const [gift, setGift] = useState(null);
  const [giftStep, setGiftStep] = useState('');
  const [stopping, setStopping] = useState(false);
  const [declined, setDeclined] = useState(false);
  const gaveUp = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const [wallet, setWallet] = useState(null);
  const [changeAddress, setChangeAddress] = useState();

  const [customFee, setCustomFee] = useState(null);
  const [feePrecalc, setFeePrecalc] = useState({ current: null, slowFee: null, mediumFee: null, fastestFee: null });
  const [feeUnit, setFeeUnit] = useState();

  const bip39 = require("bip39");
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

            setWallet(wallet)
            setCivic(wallet._getExternalAddressByIndex(0))
            return wallet;
        }
    }
    return null;  // Return null if no civic wallet is found
  }  

  useEffect(() => {
    getCivicWallet(wallets)
  }, []);

  const toggleVerify = () => setIsVerified(!isVerified);

  const publishApplication = async publication => {
    setIsPublishing(true);
    try {
      await MARSConnection.waitTillConnected();
      const submitted = await publishCitizenshipTransaction({
        wallet, publication, saveDraft: saveCitizenshipDraft, findTransaction: MARSConnection.getTxHex,
      });
      navigation.navigate('JoinGeneralPublicApplicationSuccessScreen', { txid: submitted.txid });
    } catch (error) {
      marsAlert('Submission pending', error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const preparePublication = async () => {
    const fees = await NetworkTransactionFees.recommendedFees();
    return prepareCitizenshipPublication({
      wallet, form: formData, feeRate: Number(fees.mediumFee), readDraft: readCitizenshipDraft, saveDraft: saveCitizenshipDraft,
      pin: async (payload, address) => {
        const token = await getCivicToken();
        const response = await axios.post('https://martianrepublic.org/api/pinjson', {
          type: 'data', payload: JSON.stringify(payload), address,
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 90000 });
        return response.data.Hash;
      },
    });
  };

  // The civic wallet cannot pay the fee and no grant is coming: say why, and
  // offer the two real ways to get Marscoin.
  const offerWaysToGetMarscoin = why => {
    marsAlert(
      'You need a little Marscoin',
      `${why}\n\nPublishing your application costs a small network fee, a tiny fraction of one Marscoin.\n\nYou can swap a little Bitcoin for Marscoin, or show your address to someone who can send you some. Your application stays saved on this phone.`,
      [
        { text: 'Get Marscoin with Bitcoin', onPress: () => navigation.navigate('SwapHome') },
        {
          text: 'Show my address',
          onPress: () => navigation.navigate('ReceiveDetailsRoot', { screen: 'ReceiveDetails', params: { walletID: wallet.getID() } }),
        },
        { text: 'Not now', style: 'cancel' },
      ],
    );
  };

  const confirmFee = publication => {
    marsAlert('Publish your application',
      `Network fee: ${new BigNumber(publication.fee).dividedBy(100000000).toFixed(8)} MARS. Your application will be public. Blockchain confirmation may take time.`,
      [{ text: 'Review later', style: 'cancel' }, { text: publication.status === 'pending' ? 'Retry submission' : 'Confirm publication', onPress: () => publishApplication(publication) }]);
  };

  // Does what the welcome-gift flow decided. See blue_modules/welcome-gift.js.
  const follow = outcome => {
    switch (outcome.next) {
      case 'published':
        navigation.navigate('JoinGeneralPublicApplicationSuccessScreen', { txid: outcome.txid });
        break;
      case 'confirm':
        confirmFee(outcome.publication);
        break;
      case 'gift':
        setGift(outcome.offer);
        break;
      case 'fund':
        offerWaysToGetMarscoin(outcome.reason || 'A welcome gift is not available right now.');
        break;
      case 'later':
        marsAlert(
          'Your welcome gift is on its way',
          'The Republic has sent your welcome gift to your civic wallet, but it has not arrived yet. Nothing has been published.\n\nMarscoin blocks can take a while, sometimes more than half an hour.\n\nYour application is saved on this phone. Come back in a little while and tap the button again to publish it.',
        );
        break;
      case 'pending':
        marsAlert('Submission pending', outcome.message);
        break;
      default:
        // 'blocked' (the box is not ticked) and 'stopped' (the screen was left).
        break;
    }
  };

  const fetchOffer = () => fetchGrantOffer({ wallet, http: axios, getToken: getCivicToken });
  const left = () => !mounted.current;

  // The publish button. A wallet that can pay goes to the fee confirmation;
  // one that cannot is shown the welcome gift when the Republic offers one.
  // Asking about the gift sends no coins; only "Accept and publish" claims it.
  const validateAndSubmit = async () => {
    if (!isVerified || isPublishing) return;
    setIsPublishing(true);
    setDeclined(false);
    try {
      await MARSConnection.waitTillConnected();
      const outcome = await startPublishing({
        verified: isVerified,
        prepare: preparePublication,
        fetchOffer,
        waitForGrant: options => waitForGrant({ wallet, ...options, shouldStop: left }),
        onProgress: step => mounted.current && setProgress(GIFT_PROGRESS[step]),
        shouldStop: left,
      });
      if (mounted.current) follow(outcome);
    } catch (error) {
      if (mounted.current) marsAlert('Application not published', error.message || 'Please check your connection and try again.');
    } finally {
      if (mounted.current) {
        setIsPublishing(false);
        setProgress('');
      }
    }
  };

  // "Accept and publish" on the welcome gift: claim it, wait for it to arrive,
  // then publish. The verification box was ticked to get here, and the flow
  // checks it again.
  const acceptWelcomeGift = async () => {
    if (!isVerified || isPublishing || !gift) return;
    setIsPublishing(true);
    gaveUp.current = false;
    try {
      const outcome = await acceptGift({
        verified: isVerified,
        offer: gift,
        claim: offer => claimGrantOffer({ wallet, offer, http: axios, getToken: getCivicToken }),
        fetchOffer,
        waitForGrant: options => waitForGrant({ wallet, ...options, shouldStop: () => !mounted.current || gaveUp.current }),
        prepare: preparePublication,
        publish: publication => publishCitizenshipTransaction({
          wallet, publication, saveDraft: saveCitizenshipDraft, findTransaction: MARSConnection.getTxHex,
        }),
        onProgress: step => mounted.current && setGiftStep(step),
        shouldStop: left,
      });
      if (!mounted.current) return;
      setGift(null);
      follow(outcome);
    } catch (error) {
      if (!mounted.current) return;
      setGift(null);
      marsAlert('Application not published', error.message || 'Please check your connection and try again.');
    } finally {
      if (mounted.current) {
        setIsPublishing(false);
        setGiftStep('');
        setStopping(false);
      }
    }
  };

  // "Not now": nothing was requested and nothing is sent. The draft stays.
  const declineWelcomeGift = () => {
    setGift(null);
    setDeclined(true);
  };

  const stopWaitingForGift = () => {
    gaveUp.current = true;
    setStopping(true);
  };

  const copyToClipboard = (text) => {
    Clipboard.setString(text);

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
              disabled={!isVerified || isPublishing}
            >
                <Text style={styles.buttonText}>{isPublishing ? 'PLEASE WAIT…' : 'CONTINUE TO PUBLISH'}</Text>
            </TouchableOpacity>
          </LinearGradient>

            {!!progress && <Text style={styles.progressText}>{progress}</Text>}

            {declined && !isPublishing && (
              <View style={styles.declinedBox} testID="WelcomeGiftDeclined">
                <Text style={styles.declinedText}>
                  No gift was requested and no Marscoin was sent. Your application is saved on this phone. Tap the button above when you
                  would like to accept the welcome gift, or pay the small network fee yourself.
                </Text>
                <TouchableOpacity accessibilityRole="button" style={styles.declinedAction} onPress={() => navigation.navigate('SwapHome')}>
                  <Text style={styles.declinedActionText}>Get Marscoin with Bitcoin</Text>
                </TouchableOpacity>
                {wallet && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.declinedAction}
                    onPress={() => navigation.navigate('ReceiveDetailsRoot', { screen: 'ReceiveDetails', params: { walletID: wallet.getID() } })}
                  >
                    <Text style={styles.declinedActionText}>Show my address</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* {!isFormValid &&
              <Text style={[styles.smallText, {marginTop: 10}]}>Notarize via a blockchain transaction</Text>} */}
        </View>
      </ScrollView>
      <WelcomeGift
        visible={!!gift}
        amountText={giftAmountText(gift?.amountZubrins)}
        progress={giftStep ? GIFT_PROGRESS[giftStep] : ''}
        canStop={giftStep === 'waiting'}
        stopping={stopping}
        onAccept={acceptWelcomeGift}
        onDecline={declineWelcomeGift}
        onStop={stopWaitingForGift}
      />
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
  progressText: {
    fontSize: 14,
    color: 'white',
    fontFamily: fonts.regular.fontFamily,
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 40,
    lineHeight: 18
  },
  declinedBox: {
    marginTop: 24,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#30353B',
    backgroundColor: '#14171B',
  },
  declinedText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#ADB3BA',
  },
  declinedAction: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  declinedActionText: {
    fontSize: 15,
    color: '#FF812D',
    fontFamily: 'ChakraPetch-SemiBold',
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
