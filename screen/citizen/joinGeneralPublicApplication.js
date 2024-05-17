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

import React, { useEffect, useState, useRef, useContext } from 'react';
import { Platform, Alert, SafeAreaView, ScrollView, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
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
import bip39 from 'bip39';

const JoinGeneralPublicApplicationScreen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const styles = getStyles(colors, fonts);
  const route = useRoute();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  //const {firstName, lastName, displayName, bio, photo, video} = route.params;
  //console.log('PARAMS',route.params )

  const params = {"bio": "Love", "address": "MckshlbfvldrfLove", "displayName": "Hopefully ", "firstName": "Yana", "lastName": "Hope", "photo": "QmdGcEhQp862VDhxCHYo8vcAfMiQgwc8kYfkdM2F6vsdLT", "video": "QmQ6ebHWPbhDpjrePbwV3PjUDxnMAMRHWDRhA56gU6BxxJ"}
  console.log('PARAMS',params )
  const [formData, setFormData] = useState({
    firstName: params.firstName,
    lastName: params.lastName,
    displayName: params.displayName,
    bio: params.bio,
    photo: params.photo,
    video: params.video
  });
  const [civic, setCivic] = useState(params.address)

  const toggleVerify = () => setIsVerified(!isVerified);

  const getTxInputsOutputs = async (senderAddress, receiverAddress, amount) => {
    // API call to get UTXOs for senderAddress
    // This is a placeholder. You should replace it with actual API call
    return {
      inputs: [],
      outputs: [{address: receiverAddress, value: amount}],
    };
  };
  
  const sendMARS = async (marsAmount, receiverAddress) => {
    console.log(' SEND MARS START')
    //const senderAddress = await AsyncStorage.getItem("public_address");
  
    try {
      const txInputsOutputs = await getTxInputsOutputs(civic, receiverAddress, marsAmount);
      return txInputsOutputs;
    } catch (e) {
      console.error("Failed to get transaction inputs and outputs", e);
      throw e;
    }
  };

  const signMARS = async (message, marsAmount, txInputsOutputs) => {
    const mnemonic = await AsyncStorage.getItem("mnemonic_key");
    if (!mnemonic) {
      alert("No mnemonic key stored, please set up your wallet first.");
      return;
    }
  
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bitcoin.bip32.fromSeed(seed, bitcoin.networks.bitcoin); // Adjust for Marscoin network
    const child = root.derivePath("m/44'/2'/0'/0/0");
    const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey, network: bitcoin.networks.bitcoin });
  
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    psbt.setVersion(1);
    psbt.setMaximumFeeRate(10000000); // Satoshis per byte
  
    // Assume inputs and outputs are properly set up in txInputsOutputs
    txInputsOutputs.inputs.forEach(input => {
      psbt.addInput({
        hash: input.txId,
        index: input.vout,
        nonWitnessUtxo: Buffer.from(input.rawTx, 'hex'),
      });
    });
  
    txInputsOutputs.outputs.forEach(output => {
      psbt.addOutput({
        address: output.address,
        value: output.value,
      });
    });
  
    psbt.signInput(0, child);
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction().toHex();
  
    // Function to broadcast transaction
    try {
      const txId = await broadcastTx(tx);
      console.log('Transaction ID:', txId);
      return txId;
    } catch (error) {
      console.error("Failed to broadcast transaction", error);
      throw error;
    }
  };

  const sendMetadata = async (message) => {
    setIsLoading(true);
    try {
      const txids2watch = [];
      // Assuming message is the data you want to store on the blockchain
      const psbt = new bitcoin.Psbt(); // Initialize a new partially signed Bitcoin transaction (update with Marscoin specifics)
      psbt.addOutput({
        script: bitcoin.script.nullData.output.encode(Buffer.from(message)), // Use OP_RETURN to embed your message
        value: 0, // No Marscoin is being sent
      });
  
      // More code here to add inputs, sign the transaction etc.
      const txHex = psbt.finalizeAllInputs().extractTransaction().toHex();
      await broadcast(txHex);
      const txid = bitcoin.Transaction.fromHex(txHex).getId();
      txids2watch.push(txid);
  
      Notifications.majorTomToGroundControl([], [], txids2watch);
  
      triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
      navigate('SendSuccess', {
        message: 'Data published successfully',
        txid,
      });
  
      setIsLoading(false);
  
      await new Promise(resolve => setTimeout(resolve, 3000)); // sleep to make sure network propagates
      fetchAndSaveWalletTransactions(walletID);
    } catch (error) {
      triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
      setIsLoading(false);
      presentAlert({ message: error.message });
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
        
        // const io = await sendMARS(1, "<?=$public_address?>");
        const fee = 0.01
        const mars_amount = 0.01
        const total_amount = fee + parseInt(mars_amount)
        console.log('estimated-fee: ', fee)

        // try {
        //     const tx = await signMARS(message, mars_amount, io);
        //     $("#publish_progress_message").show().text("Published successfully...");
        //     $("#publish_progress_message").show().text(tx.tx_hash);
        //     const data = await doAjax("/api/setfeed", {"type": "GP", "txid": tx.tx_hash, "embedded_link": "https://ipfs.marscoin.org/ipfs/"+cid, "address": '<?=$public_address?>'});
        //     if(data.Hash){
        //         if(!alert('Submitted to Marscoin Blockchain successfully')){window.location.reload();}
        //     }

        // } catch (e) {
        //     throw e;
        // }
        ///////SENDING TRANSACTION TO SAVE MESSAGE IN BLOCKCHAIN////////
        const transactionResponse = await sendMARS(0.01, civic);
        console.error('transactionResponse', transactionResponse);
        if (transactionResponse.success) {
          Snackbar.show({ text: 'Published successfully!', duration: Snackbar.LENGTH_SHORT });
          Alert.alert('Success', `Published successfully! Transaction ID: ${transactionResponse.txId}`);
        } else {
          throw new Error('Transaction failed');
        }
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
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(`https://ipfs.marscoin.org/ipfs/${params.photo}`)}>
              <Text style={styles.contentText}>{`https://ipfs.marscoin.org/ipfs/${params.photo}`}</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.orangeBox}>
            <View style={styles.headerBox}>
              <Text style={styles.headerText}>Liveness Video Proof: </Text>
            </View>
            <TouchableOpacity style={styles.contentBox} onLongPress={() => copyToClipboard(`https://ipfs.marscoin.org/ipfs/${params.video}`)}>
              <Text style={styles.contentText}>{`https://ipfs.marscoin.org/ipfs/${params.video}`}</Text>
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
              //disabled={!isVerified}
              //onPress={handleSubmit}
              onPress={validateAndSubmit} disabled={isPublishing}
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
