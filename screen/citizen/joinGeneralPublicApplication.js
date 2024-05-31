// import React, { useEffect, useState, useRef, useContext } from 'react';
// import { Platform, SafeAreaView, ScrollView, StyleSheet, View, TouchableWithoutFeedback, ActivityIndicator, Keyboard, Text,Image, KeyboardAvoidingView, TouchableOpacity, TextInput, I18nManager, Modal, Alert } from 'react-native';
// import { useNavigation, useRoute } from '@react-navigation/native';
// import loc from '../../loc';
// import { BlueStorageContext } from '../../blue_modules/storage-context';
// import { requestCameraAuthorization } from '../../helpers/scan-qr';
// import { useTheme } from '../../components/themes';
// import { Icon } from 'react-native-elements';
// import LinearGradient from 'react-native-linear-gradient';
// import RNFS from 'react-native-fs';
// import { Image as CompressorImage } from 'react-native-compressor';
// import { RNCamera } from 'react-native-camera';
// import axios from 'axios';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { address } from 'bitcoinjs-lib';
// import { get } from '../../__mocks__/react-native-tor';

// const JoinGeneralPublicApplicationScreen = () => {
//   const navigation = useNavigation();
//   const { colors, fonts } = useTheme();
//   const styles = getStyles(colors, fonts);
//   const route = useRoute();
//   const [firstName, setFirstName] = useState('');
//   const [lastName, setLastName] = useState('');
//   const [displayName, setDisplayName] = useState('');
//   const [bio, setBio] = useState('');
//   const [modalVisible, setModalVisible] = useState(false);
//   const [capturedImage, setCapturedImage] = useState(null);
//   const [photoIPFS, setPhotoIPFS] = useState(null);
//   const [isFormValid, setIsFormValid] = useState(false);
//   const {wallets} = useContext(BlueStorageContext);
//   const [loading, setLoading] = useState(false);

//   const scrollViewRef = useRef();
//   const firstNameRef = useRef();
//   const lastNameRef = useRef();
//   const displayNameRef = useRef();
//   const bioRef = useRef();

//   const handleImageCaptured = (uri) => {
//     setCapturedImage(uri);
//     console.log('Image saved', uri);
//   };

//   async function compressImage(imageUri) {
//     try {
//       const ofileInfo = await RNFS.stat(imageUri);
//       console.log('Original file size in bytes:', ofileInfo.size);
//       const compressedImage = await CompressorImage.compress(imageUri);
//       console.log('Compressed image URI:', compressedImage);
//       const fileInfo = await RNFS.stat(compressedImage);   // Get file info
//       console.log('File size in bytes:', fileInfo.size);
//       return compressedImage
//     } catch (error) {
//       console.error('Error compressing image:', error);
//     }
//   }
//   async function postName() {
//     const token = await AsyncStorage.getItem('@auth_token');
//     return axios.post("https://martianrepublic.org/api/scitizen", {
//       firstname: firstName,
//       lastname: lastName,
//       displayname: displayName,
//       shortbio: bio,
//     }, {
//       headers: {'Authorization': `Bearer ${token}`}
//     })
//     .then(response => {
//       console.log('Success, data posted to api:', response.status);
//     })
//     .catch(error => {
//       console.error('Error:', error.response);
//     });
//   }
  
//   async function postPhoto() {
//     const token = await AsyncStorage.getItem('@auth_token');
//     const civicAddress = await AsyncStorage.getItem('civicAddress');
//     const base64 = await RNFS.readFile(capturedImage, 'base64');
//     const imageData = `data:image/jpeg;base64,${base64}`;

//     try {
//         const response = await axios.post("https://martianrepublic.org/api/pinpic", {
//             picture: imageData,
//             type: 'profile_pic',
//             address: civicAddress,
//         }, {
//             headers: {'Authorization': `Bearer ${token}`}
//         });
//         console.log('Photo pinned!!!! hash:', response.data.Hash);
//         setPhotoIPFS(response.data.Hash);
//     } catch (error) {
//         console.error('Error posting photo:', error.response || error);
//     }
//   }

//   const handleSubmit = async () => {
//     if (!isFormValid) {
//         // If form is not valid, show an alert and do not proceed.
//         Alert.alert('Validation Error', 'Make sure all required fields are filled in and Photo ID is taken!');
//         return; // Stop execution if the form is not valid.
//     }

//     setLoading(true);
//     try {
//         await postName(); // Ensure name is posted before proceeding.
//         await postPhoto(); // Ensure photo is posted and hash is received before navigating.

//         // Check if photoIPFS has a value after posting photo
//         if (photoIPFS) {
//             navigation.navigate('JoinGeneralPublicApplication2Screen', {
//                 firstName,
//                 lastName,
//                 displayName,
//                 bio,
//                 photo: photoIPFS
//             });
//         } else {
//             //console.warn("Photo IPFS hash is not available yet.");
//         }
//     } catch (error) {
//         console.error("Error in submission:", error);
//         Alert.alert('Error', 'An error occurred during submission.');
//     } finally {
//       setLoading(false);
//     }
// };

//   useEffect(() => {
//     if (photoIPFS) {
//       navigation.navigate('JoinGeneralPublicApplication2Screen', {
//         firstName,
//         lastName,
//         displayName,
//         bio,
//         photo: photoIPFS
//       });
//     }
//   }, [photoIPFS]); 

//   const CameraModal = ({ isVisible, onClose, onImageCaptured }) => {
//     const cameraRef = useRef(null);
//     const [capturedUri, setCapturedUri] = useState(null);
  
//     const takePicture = async () => {
//       if (cameraRef.current) {
//         const options = { quality: 0.5, base64: true };
//         const data = await cameraRef.current.takePictureAsync(options);
//         console.log('Path to image: ' + data.uri);
//         setCapturedUri(data.uri);
//         //onImageCaptured(data.uri); 
//       }
//     };

//     const handleSave = () => {
//      // compressed = compressImage(capturedUri)
//       onImageCaptured(capturedUri);
//       setCapturedUri(null); // Reset after saving
//       onClose(); // Close the modal
//     };
//     const handleRetake = () => {
//       setCapturedUri(null); // Reset the imageUri to go back to the camera screen
//     };
  
//     return (
//       <Modal
//         animationType="slide"
//         transparent={false}
//         visible={isVisible}
//         onRequestClose={onClose}
//       >
//         <View style={{ flex: 1 }}>
//         {capturedUri ? (
//             <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor:'black' }}>
//              <TouchableOpacity 
//                       style={{flexDirection:'row', justifyContent:'space-between', alignSelf:'flex-start', marginTop: 100, marginLeft: 20}}
//                       onPress={()=>onClose()}
//                     >
//                       <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
//                     </TouchableOpacity>
//               <Image source={{ uri: capturedUri }} style={{ width: '70%', height: '40%', marginTop: 100, borderRadius: 20 }} />
//               <View style = {styles.buttonContainer1}>
//                 <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
//                   <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
//                     <Text style={styles.buttonText}>Save</Text>
//                   </TouchableOpacity>
//                 </LinearGradient>
//                 <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
//                   <TouchableOpacity onPress={handleRetake} style={styles.saveButton}>
//                     <Text style={styles.buttonText}>Retake</Text>
//                   </TouchableOpacity>
//                 </LinearGradient>
//               </View>
//             </View>
//           ) : (
//           <RNCamera
//             ref={cameraRef}
//             style={{ flex: 1 }}
//             type={RNCamera.Constants.Type.front}
//             flashMode={RNCamera.Constants.FlashMode.off}
//             captureAudio={false}
//           >
//             <View style={styles.buttonContainer}>
//               <TouchableOpacity 
//                 style={{flexDirection:'row', justifyContent:'space-between', marginTop: 90, marginLeft: 20}}
//                 onPress={()=>setModalVisible(false)}
//               >
//                   <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
//               </TouchableOpacity>
//               <TouchableOpacity 
//                 onPress={takePicture} 
//                 style={[styles.capture]}
//               />
//             </View>
//           </RNCamera>
//           )}
//         </View>
//       </Modal>
//     );
//   };

//   useEffect(() => {
//     const validateForm = () => {
//       return firstName.length > 0 && lastName.length > 0 && displayName.length > 0 && bio.length > 0 && capturedImage != null;
//     };
//     setIsFormValid(validateForm());
//   }, [firstName, lastName, displayName, bio, capturedImage]);
  
//   return (
//     <SafeAreaView style={{flex: 1}}> 
//     {/* ////margin -80 sticks screen to the tabbar///// */}
//       <KeyboardAvoidingView
//         style={{flex: 1}}
//         behavior={Platform.OS === 'ios' ? 'padding' : null}
//         keyboardVerticalOffset={Platform.OS === 'ios' ? 5 : 0}
//       >
//         <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
//           <ScrollView 
//             style={styles.root}
//             showsVerticalScrollIndicator={false}
//             contentContainerStyle={{ paddingBottom: 200 }}
//             ref={scrollViewRef}
//           >
//             <View style={styles.center}>
//               <Text style={styles.welcomeText}>Welcome to  </Text>
//               <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
//             </View>
//             <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC </Text>

//             {/* <View style={{flexDirection:'row', justifyContent:'center', marginTop: 150,}}>
//               <Text style={{fontFamily: fonts.regular.fontFamily, marginHorizontal: 20, color: 'white', fontSize: 18, fontWeight: '700', textAlign:'center'}}>APPLICATION WILL BE AVAILABLE IN THE NEXT VERSION OF THE APP!</Text>
//             </View>
//             <View style={{flex:1}}>
//                 <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
//                     <TouchableOpacity style={styles.joinButton} onPress={() => navigation.goBack()}>
//                         <Text style={styles.buttonText}>GO BACK</Text>
//                     </TouchableOpacity>  
//                 </LinearGradient>
//             </View>  */}

//             <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 50}}>
//               <Text style={{fontFamily: fonts.regular.fontFamily, marginLeft: 20,color: 'white', fontSize: 20,}}>APPLICATION</Text>
//               <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>1/3</Text>
//             </View>

//             <View style={{ marginTop: 30, marginHorizontal: 20 }}>
//                 <Text style={styles.medText}>First Name *</Text>
//                 <TextInput
//                     value={firstName}
//                     placeholder=""
//                     placeholderTextColor="white"
//                     onChangeText={(text) => setFirstName(text)}
//                     style={styles.textFieldWrapStyle}
//                     ref={firstNameRef}
//                     onFocus={() => scrollViewRef.current.scrollTo({ y: 0, animated: true })}    
//                     maxLength={50}
//                 />
//               </View>

//               <View style={{ marginTop: 30, marginHorizontal: 20 }}>
//                 <Text style={styles.medText}>Last Name *</Text>
//                 <TextInput
//                     value={lastName}
//                     placeholder=""
//                     placeholderTextColor="white"
//                     onChangeText={(text) => setLastName(text)}
//                     style={styles.textFieldWrapStyle}
//                     ref={lastNameRef}
//                     onFocus={() => scrollViewRef.current.scrollTo({ y: 0, animated: true })}    
//                     maxLength={50}
//                 />
//               </View>

//               <View style={{ marginTop: 30, marginHorizontal: 20 }}>
//                 <Text style={styles.medText}>Display Name *</Text>
//                 <TextInput
//                     value={displayName}
//                     placeholder=""
//                     placeholderTextColor="white"
//                     onChangeText={(text) => setDisplayName(text)}
//                     style={styles.textFieldWrapStyle}
//                     ref={displayNameRef}
//                     onFocus={() => scrollViewRef.current.scrollTo({ y: 150, animated: true })}    
//                     maxLength={50}
//                 />
//               </View>

//               <View style={{ marginTop: 30, marginHorizontal: 20 }}>
//                 <Text style={styles.medText}>Short Bio *</Text>
//                 <TextInput
//                     value={bio}
//                     placeholder=""
//                     placeholderTextColor="white"
//                     onChangeText={(text) => setBio(text)}
//                     style={[styles.textFieldWrapStyle, {height: 100}]}
//                     ref={bioRef}
//                     onFocus={() => scrollViewRef.current.scrollTo({ y: 300, animated: true })}    
//                     maxLength={700}
//                     multiline={true}
//                 />
//               </View>

//               <View style={{ marginTop: 30, marginHorizontal: 20 }}>
//                 <Text style={styles.medText}>Photo ID*</Text>         
//                 <TouchableOpacity 
//                   style={styles.cameraButton}
//                   onPress={() => setModalVisible(true)}
//                 >
//                 {capturedImage && (
//                   <Image source={{ uri: capturedImage }} style={{ width: 118, height: 138, borderRadius: 8, }} />
//                 )}
//                 {!capturedImage &&
//                   <Icon name="camera" size={36} type="font-awesome-5" color={'lightgray'} />
//                 }
//                 </TouchableOpacity>
//                 <Text style={[styles.smallText, {marginTop: 10}]}> - Your full face, eyes and hairline must be visible </Text>
//                 <Text style={[styles.smallText, {marginTop: 10}]}> - No hats, head coverings, sunglasses, earbuds, hands or other objects that obscure your face </Text>
//               </View>

//               <CameraModal
//                 isVisible={modalVisible}
//                 onClose={() => setModalVisible(false)}
//                 onImageCaptured={handleImageCaptured}
//               />

//             <View style={{flex:1}}>
//             <TouchableOpacity 
//               style={styles.joinButton}
//               // onPress={()=>
//               //   navigation.navigate('JoinGeneralPublicApplication2Screen', {
//               //     firstName,
//               //     lastName,
//               //     displayName,
//               //     bio,
//               //     photo: photoIPFS
//               // })}
//               onPress={handleSubmit}
//               disabled={!isFormValid}
//             >
//               <LinearGradient colors={isFormValid ? ['#FFB67D','#FF8A3E', '#FF7400'] : ['gray', 'gray']} style={styles.joinButtonGradient}>
//               {loading ? (
//                       <ActivityIndicator size="small" color="#FFFFFF" />
//                     ) : (
//                       <Text style={styles.buttonText}>NEXT STEP</Text>
//                     )}
//               </LinearGradient>
//             </TouchableOpacity>
//                 { !isFormValid &&
//                 <Text style={styles.smallText}>All fields marked with * are required to proceed</Text>}
//             </View>  
//           </ScrollView> 
//         </TouchableWithoutFeedback>
//       </KeyboardAvoidingView> 
//     </SafeAreaView>
//   );
// };

// const getStyles = (colors, fonts) => StyleSheet.create({
//   root: {
//     flex:1
//   },
//   center: {
//     height:80,
//     backgroundColor:'red',
//     flexDirection:'row',
//     marginHorizontal: 16,
//     backgroundColor: colors.elevated,
//     justifyContent:'center',
//     alignItems:'center'
//   },
//   welcomeText: {
//       color:'white', 
//       textAlign: 'center',
//       justifyContent:'center',
//       fontSize: 24,
//       fontFamily: 'Orbitron-Black',
//       marginTop: 30
//   },
//   smallText: {
//       color:'white', 
//       textAlign: 'center',
//       justifyContent:'center',
//       fontSize: 10,
//       fontFamily: 'Orbitron-SemiBold'
//   },
//   medText: {
//     color:'white', 
//     fontSize: 16,
//     fontFamily: fonts.fontFamily,
//     fontWeight:"400",
//     fontFamily: 'Orbitron-Regular',
//   },
//   buttonText: {
//       color:'white', 
//       textAlign: 'center',
//       fontSize: 18,
//       fontWeight:"600",
//       fontFamily: fonts.regular.fontFamily
//   },
//   joinButton: {
//       paddingVertical:10,
//       width: '90%',
//       borderRadius: 20,
//       marginHorizontal: 20,
//       justifyContent:'center',
//   },
//   joinButtonGradient: {
//       paddingVertical:10,
//       alignItems:'center',
//       justifyContent:'center',
//       borderRadius: 20,
//       marginHorizontal: 40,
//       marginTop: 50,
//       height: 60,
//   },
//   iconStyle: {
//     width:80,
//     maxHeight: 80,
//     marginTop: 30,
//   },
//   textFieldWrapStyle: {
//     height: 40,
//     marginTop: 10,
//     borderRadius: 8,
//     elevation: 2.0,
//     backgroundColor:colors.inputBackgroundColor,
//     borderColor: 'white',
//     borderWidth: 0.7,
//     paddingHorizontal: 5,
//     paddingVertical: 5,
//     fontFamily: 'Orbitron-Regular', 
//     letterSpacing: 1.1,
//     fontSize: 14,
//     color: 'white'
//   },
//   cameraButton:{
//     width: 120,
//     height: 140,
//     backgroundColor:colors.inputBackgroundColor,
//     borderRadius: 8,
//     borderWidth: 0.7,
//     borderColor: 'white',
//     alignSelf: 'center',
//     justifyContent: 'center',
//     marginTop: 10
//   },
//   capture: {
//     flex: 0,
//     width: 70,
//     height: 70,
//     borderRadius: 35,
//     opacity: 0.8,
//     borderWidth: 4,
//     padding: 15,
//     paddingHorizontal: 20,
//     alignSelf: 'center',
//     margin: 20,
//     position: 'absolute',
//     bottom: 60,
//     backgroundColor: 'white',
//     borderColor: 'gray'
//   },
//   buttonContainer: {
//     flex: 1,
//     width: '100%',
//   },
//   buttonContainer1: {
//     flex: 1,
//     flexDirection:'row',
//     width: '100%',
//     justifyContent: 'space-around',
//     marginTop: 20
//   },
//   buttonText: {
//     color:'white', 
//     textAlign: 'center',
//     fontSize: 16,
//     fontWeight:"600",
//     fontFamily: fonts.regular.fontFamily
// },
//   saveButton: {
//     width: 120, 
//     height: 44,
//     borderRadius: 8,
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
// });

// export default JoinGeneralPublicApplicationScreen;

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
  const { wallets} = useContext(BlueStorageContext);
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

  const params = {"bio": "Test", "address": 'MC1kMoACQZQwmR8tSSmSQzUBDUYhEKkbee', "displayName": "Test ", "firstName": "MobileTest", "lastName": "test", "photo": "https://ipfs.marscoin.org/ipfs/QmdGcEhQp862VDhxCHYo8vcAfMiQgwc8kYfkdM2F6vsdLT", "video": "https://ipfs.marscoin.org/ipfs/QmQ6ebHWPbhDpjrePbwV3PjUDxnMAMRHWDRhA56gU6BxxJ"}
  //console.log('PARAMS',params )
  const [formData, setFormData] = useState({
    firstName: params.firstName,
    lastName: params.lastName,
    displayName: params.displayName,
    bio: params.bio,
    photo: params.photo,
    video: params.video
  });

  const [civic, setCivic] = useState(params.address)

  function getCivicWallet(wallets) {
    // Loop through the wallets array
    for (let wallet of wallets) {
        // Check if the wallet has the civic property set to true
        if (wallet.civic) {
            console.log('CIVIC WALLET IS SET!' );
            setWallet(wallet)
            return wallet;
        }
    }
    return null;  // Return null if no civic wallet is found
  }  

  useEffect(() => {
    getCivicWallet(wallets)
  }, []);

  const toggleVerify = () => setIsVerified(!isVerified);
  
 // if cutomFee is not set, we need to choose highest possible fee for wallet balance
  // if there are no funds for even Slow option, use 1 sat/vbyte fee
    // const feeRate = useMemo(() => {
    //   if (customFee) return customFee;
    //   if (feePrecalc.slowFee === null) return '1'; // wait for precalculated fees
    //   let initialFee;
    //   if (feePrecalc.fastestFee !== null) {
    //     initialFee = String(networkTransactionFees.fastestFee);
    //   } else if (feePrecalc.mediumFee !== null) {
    //     initialFee = String(networkTransactionFees.mediumFee);
    //   } else {
    //     initialFee = String(networkTransactionFees.slowFee);
    //   }
    //   return initialFee;
    // }, [customFee, feePrecalc, networkTransactionFees]);

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
    console.log(' SEND METADATA!!! START')
    setIsLoading(true);
    try {
      //const utxos = wallet.fetchUtxo(); 
      const lutxo = wallet._utxo;
      //const lutxo = wallet._utxo.filter(utxo => utxo.address === civic);
      console.log('wallet._utxo', lutxo)
      const targets = [];
      targets.push({ address: civic, value: 0 });
      
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
    Snackbar.show({ text: 'Publishing...', duration: Snackbar.LENGTH_INDEFINITE });

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
        //sendMetadata(null) 
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
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(params.address)}>
              <Text style={styles.contentText}>{params.address} </Text>
            </TouchableOpacity>
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
