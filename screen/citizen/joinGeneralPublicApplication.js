import React, { useEffect, useState, useRef, useContext } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, View, TouchableWithoutFeedback, ActivityIndicator, Keyboard, Text,Image, KeyboardAvoidingView, TouchableOpacity, TextInput, I18nManager, Modal, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import { Icon } from 'react-native-elements';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { Image as CompressorImage } from 'react-native-compressor';
import { RNCamera } from 'react-native-camera';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JoinGeneralPublicApplicationScreen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const styles = getStyles(colors, fonts);
  const route = useRoute();
  const [userData, setUserData] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [buttonPressed, setButtonPressed] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [photoIPFS, setPhotoIPFS] = useState(null);
  const [videoIPFS, setVideoIPFS] = useState(null);
  const [isPhotoChanged, setIsPhotoChanged] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);
  const {wallets} = useContext(BlueStorageContext);
  const [loading, setLoading] = useState(false);

  const scrollViewRef = useRef();
  const firstNameRef = useRef();
  const lastNameRef = useRef();
  const displayNameRef = useRef();
  const bioRef = useRef();

  const handleImageCaptured = (uri) => {
    setCapturedImage(uri);
    setIsPhotoChanged(true); // Indicate that a new photo has been taken
    console.log('Image saved', uri);
  };

  async function fetchUser() {
    const token = await AsyncStorage.getItem('@auth_token');
    response = await axios.post("https://martianrepublic.org/api/scitizen", {
        // firstname:'',
      }, {
      headers: {'Authorization': `Bearer ${token}`}
    })
    console.log('USER DATA', response.data);
    setUserData(response.data);
    if (response.data.citizen) {
      const { firstname, lastname, displayname, shortbio, avatar_link, liveness_link} = response.data.citizen;
      setFirstName(firstname || '');
      setLastName(lastname || '');
      setDisplayName(displayname || '');
      setBio(shortbio || '');
      if (avatar_link) {
        setCapturedImage(avatar_link);
        setPhotoIPFS(avatar_link); // Assuming avatar_link is the IPFS hash/link
        setIsPhotoChanged(false); // Photo is not new, it's from previous data
      }
      if (liveness_link) {
        setVideoIPFS(liveness_link);
      }
    }
  }
  useEffect(() => {
    fetchUser()
  }, []);  
  

  async function compressImage(imageUri) {
    try {
      const ofileInfo = await RNFS.stat(imageUri);
      console.log('Original file size in bytes:', ofileInfo.size);
      const compressedImage = await CompressorImage.compress(imageUri);
      console.log('Compressed image URI:', compressedImage);
      const fileInfo = await RNFS.stat(compressedImage);   // Get file info
      console.log('File size in bytes:', fileInfo.size);
      return compressedImage
    } catch (error) {
      console.error('Error compressing image:', error);
    }
  }
  async function postName() {
    const token = await AsyncStorage.getItem('@auth_token');
    return axios.post("https://martianrepublic.org/api/scitizen", {
      firstname: firstName,
      lastname: lastName,
      displayname: displayName,
      shortbio: bio,
    }, {
      headers: {'Authorization': `Bearer ${token}`}
    })
    .then(response => {
      console.log('Success, data posted to api:', response.status);
    })
    .catch(error => {
      console.error('Error:', error.response);
    });
  }
  
  async function postPhoto() {
    const token = await AsyncStorage.getItem('@auth_token');
    const civicAddress = await AsyncStorage.getItem('civicAddress');
    const base64 = await RNFS.readFile(capturedImage, 'base64');
    const imageData = `data:image/jpeg;base64,${base64}`;
    //console.log('image data', imageData)
    try {
        const response = await axios.post("https://martianrepublic.org/api/pinpic", {
            picture: imageData,
            type: 'profile_pic',
            address: civicAddress,
        }, {
            headers: {'Authorization': `Bearer ${token}`}
        });
        console.log('Photo pinned!!!! hash:', response.data.Hash);
        setPhotoIPFS(response.data.Hash);
    } catch (error) {
        console.error('Error posting photo:', error.response || error);
    }
  }

  const handleSubmit = async () => {
    if (!isFormValid) {
      Alert.alert('Validation Error', 'Make sure all required fields are filled in and Photo ID is taken!');
      return;
    }
    setLoading(true);
    try {
      await postName();
      let photoHash = photoIPFS; // Existing photo IPFS hash
      let videoHash = videoIPFS; // Existing video IPFS hash

      if (isPhotoChanged && capturedImage) {
        photoHash = await postPhoto(); // Upload and get new IPFS hash for the photo
      }
      // Assuming there's a scenario where the video might be updated or checked
      // This might include a function like postVideo() if you have video uploading logic

      setButtonPressed(true);
      if (photoHash) { // Also, consider checking videoHash if it's necessary for the navigation
        navigation.navigate('JoinGeneralPublicApplication2Screen', {
          firstName,
          lastName,
          displayName,
          bio,
          photo: photoHash,
          video: videoHash  // Include the video link here
        });
      }
    } catch (error) {
      console.error("Error in submission:", error);
      Alert.alert('Error', 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
};

useEffect(() => {
  // React only on changes to buttonPressed or photoIPFS (add videoIPFS if it affects the outcome)
  if (buttonPressed && photoIPFS) {
    navigation.navigate('JoinGeneralPublicApplication2Screen', {
      firstName,
      lastName,
      displayName,
      bio,
      photo: photoIPFS,
      video: videoIPFS  // Ensure video IPFS is included in navigation here as well
    });
    setButtonPressed(false); // Reset buttonPressed to prevent repeated navigation
  }
}, [buttonPressed, photoIPFS, videoIPFS]); // Include videoIPFS in the dependency array if it's relevant


  

  const CameraModal = ({ isVisible, onClose, onImageCaptured }) => {
    const cameraRef = useRef(null);
    const [capturedUri, setCapturedUri] = useState(null);
  
    const takePicture = async () => {
      if (cameraRef.current) {
        const options = { quality: 0.5, base64: true };
        const data = await cameraRef.current.takePictureAsync(options);
        console.log('Path to image: ' + data.uri);
        setCapturedUri(data.uri);
        //onImageCaptured(data.uri); 
      }
    };

    const handleSave = () => {
     // compressed = compressImage(capturedUri)
      onImageCaptured(capturedUri);
      setCapturedUri(null); // Reset after saving
      onClose(); // Close the modal
    };
    const handleRetake = () => {
      setCapturedUri(null); // Reset the imageUri to go back to the camera screen
    };
  
    return (
      <Modal
        animationType="slide"
        transparent={false}
        visible={isVisible}
        onRequestClose={onClose}
      >
        <View style={{ flex: 1 }}>
        {capturedUri ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor:'black' }}>
             <TouchableOpacity 
                      style={{flexDirection:'row', justifyContent:'space-between', alignSelf:'flex-start', marginTop: 100, marginLeft: 20}}
                      onPress={()=>onClose()}
                    >
                      <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
                    </TouchableOpacity>
              <Image source={{ uri: capturedUri }} style={{ width: '70%', height: '40%', marginTop: 100, borderRadius: 20 }} />
              <View style = {styles.buttonContainer1}>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                  <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
                    <Text style={styles.buttonText}>Save</Text>
                  </TouchableOpacity>
                </LinearGradient>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                  <TouchableOpacity onPress={handleRetake} style={styles.saveButton}>
                    <Text style={styles.buttonText}>Retake</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          ) : (
          <RNCamera
            ref={cameraRef}
            style={{ flex: 1 }}
            type={RNCamera.Constants.Type.front}
            flashMode={RNCamera.Constants.FlashMode.off}
            captureAudio={false}
          >
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={{flexDirection:'row', justifyContent:'space-between', marginTop: 90, marginLeft: 20}}
                onPress={()=>setModalVisible(false)}
              >
                  <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={takePicture} 
                style={[styles.capture]}
              />
            </View>
          </RNCamera>
          )}
        </View>
      </Modal>
    );
  };

  useEffect(() => {
    const validateForm = () => {
      return firstName.length > 0 && lastName.length > 0 && displayName.length > 0 && bio.length > 0 && capturedImage != null;
    };
    setIsFormValid(validateForm());
  }, [firstName, lastName, displayName, bio, capturedImage]);
  
  return (
    <SafeAreaView style={{flex: 1}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : null}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 5 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 200 }}
            ref={scrollViewRef}
          >
            <View style={styles.center}>
              <Text style={styles.welcomeText}>Welcome to  </Text>
              <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
            </View>
            <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC </Text>

            {/* <View style={{flexDirection:'row', justifyContent:'center', marginTop: 150,}}>
              <Text style={{fontFamily: fonts.regular.fontFamily, marginHorizontal: 20, color: 'white', fontSize: 18, fontWeight: '700', textAlign:'center'}}>APPLICATION WILL BE AVAILABLE IN THE NEXT VERSION OF THE APP!</Text>
            </View>
            <View style={{flex:1}}>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                    <TouchableOpacity style={styles.joinButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.buttonText}>GO BACK</Text>
                    </TouchableOpacity>  
                </LinearGradient>
            </View>  */}

            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 50}}>
              <Text style={{fontFamily: fonts.regular.fontFamily, marginLeft: 20,color: 'white', fontSize: 20,}}>APPLICATION</Text>
              <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>1/3</Text>
            </View>

            <View style={{ marginTop: 30, marginHorizontal: 20 }}>
                <Text style={styles.medText}>First Name *</Text>
                <TextInput
                    style={styles.textFieldWrapStyle}
                    value={firstName}
                    onChangeText={(text) => setFirstName(text)}
                    ref={firstNameRef}
                    onFocus={() => scrollViewRef.current.scrollTo({ y: 0, animated: true })}    
                    maxLength={50}
                />
              </View>

              <View style={{ marginTop: 30, marginHorizontal: 20 }}>
                <Text style={styles.medText}>Last Name *</Text>
                <TextInput
                    style={styles.textFieldWrapStyle}
                    value={lastName}
                    onChangeText={(text) => setLastName(text)}
                    ref={lastNameRef}
                    onFocus={() => scrollViewRef.current.scrollTo({ y: 0, animated: true })}    
                    maxLength={50}
                />
              </View>

              <View style={{ marginTop: 30, marginHorizontal: 20 }}>
                <Text style={styles.medText}>Display Name *</Text>
                <TextInput
                    style={styles.textFieldWrapStyle}
                    value={displayName}
                    onChangeText={(text) => setDisplayName(text)}
                    ref={displayNameRef}
                    onFocus={() => scrollViewRef.current.scrollTo({ y: 150, animated: true })}    
                    maxLength={50}
                />
              </View>

              <View style={{ marginTop: 30, marginHorizontal: 20 }}>
                <Text style={styles.medText}>Short Bio *</Text>
                <TextInput
                    style={[styles.textFieldWrapStyle, {height: 100}]}
                    value={bio}
                    onChangeText={(text) => setBio(text)}
                    ref={bioRef}
                    onFocus={() => scrollViewRef.current.scrollTo({ y: 300, animated: true })}    
                    maxLength={700}
                    multiline={true}
                />
              </View>

              <View style={{ marginTop: 30, marginHorizontal: 20 }}>
                <Text style={styles.medText}>Photo ID*</Text>         
                <TouchableOpacity 
                  style={styles.cameraButton}
                  onPress={() => setModalVisible(true)}
                >
                {capturedImage && (
                  <Image source={{ uri: capturedImage }} style={{ width: 118, height: 138, borderRadius: 8, }} />
                )}
                {!capturedImage &&
                  <Icon name="camera" size={36} type="font-awesome-5" color={'lightgray'} />
                }
                </TouchableOpacity>
                <Text style={[styles.smallText, {marginTop: 10}]}> - Your full face, eyes and hairline must be visible </Text>
                <Text style={[styles.smallText, {marginTop: 10}]}> - No hats, head coverings, sunglasses, earbuds, hands or other objects that obscure your face </Text>
              </View>

              <CameraModal
                isVisible={modalVisible}
                onClose={() => setModalVisible(false)}
                onImageCaptured={handleImageCaptured}
              />

            <View style={{flex:1}}>
            <TouchableOpacity 
              style={styles.joinButton}
              onPress={handleSubmit}
              disabled={!isFormValid}
            >
              <LinearGradient colors={isFormValid ? ['#FFB67D','#FF8A3E', '#FF7400'] : ['gray', 'gray']} style={styles.joinButtonGradient}>
              {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.buttonText}>NEXT STEP</Text>
                    )}
              </LinearGradient>
            </TouchableOpacity>
                { !isFormValid &&
                <Text style={styles.smallText}>All fields marked with * are required to proceed</Text>}
            </View>  
          </ScrollView> 
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView> 
    </SafeAreaView>
  );
};

const getStyles = (colors, fonts) => StyleSheet.create({
  root: {
    flex:1
  },
  center: {
    height:80,
    backgroundColor:'red',
    flexDirection:'row',
    marginHorizontal: 16,
    backgroundColor: colors.elevated,
    justifyContent:'center',
    alignItems:'center'
  },
  welcomeText: {
      color:'white', 
      textAlign: 'center',
      justifyContent:'center',
      fontSize: 24,
      fontFamily: 'Orbitron-Black',
      marginTop: 30
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
  buttonText: {
      color:'white', 
      textAlign: 'center',
      fontSize: 18,
      fontWeight:"600",
      fontFamily: fonts.regular.fontFamily
  },
  joinButton: {
      paddingVertical:10,
      width: '90%',
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
    marginTop: 50,
    height: 60,
  },
  iconStyle: {
    width:80,
    maxHeight: 80,
    marginTop: 30,
  },
  textFieldWrapStyle: {
    fontFamily: 'Orbitron-Regular',
    height: 40,
    marginTop: 10,
    borderRadius: 8,
    elevation: 2.0,
    backgroundColor: colors.inputBackgroundColor,
    borderColor: 'white',
    borderWidth: 0.7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    letterSpacing: 1.1,
    fontSize: 14,
    color: 'white'
  },
  cameraButton:{
    width: 120,
    height: 140,
    backgroundColor:colors.inputBackgroundColor,
    borderRadius: 8,
    borderWidth: 0.7,
    borderColor: 'white',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 10
  },
  capture: {
    flex: 0,
    width: 70,
    height: 70,
    borderRadius: 35,
    opacity: 0.8,
    borderWidth: 4,
    padding: 15,
    paddingHorizontal: 20,
    alignSelf: 'center',
    margin: 20,
    position: 'absolute',
    bottom: 60,
    backgroundColor: 'white',
    borderColor: 'gray'
  },
  buttonContainer: {
    flex: 1,
    width: '100%',
  },
  buttonContainer1: {
    flex: 1,
    flexDirection:'row',
    width: '100%',
    justifyContent: 'space-around',
    marginTop: 20
  },
  buttonText: {
    color:'white', 
    textAlign: 'center',
    fontSize: 16,
    fontWeight:"600",
    fontFamily: fonts.regular.fontFamily
},
  saveButton: {
    width: 120, 
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default JoinGeneralPublicApplicationScreen;

