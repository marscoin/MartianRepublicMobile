import React, { useEffect, useState, useRef, useContext } from 'react';
import { Platform, SafeAreaView, ScrollView, Image, StyleSheet, Modal, View, Text, PermissionsAndroid, TouchableOpacity, TextInput, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import loc from '../../loc';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';
import usePrivacy from '../../hooks/usePrivacy';
import LinearGradient from 'react-native-linear-gradient';
import WalletGradient from '../../class/wallet-gradient';
import { BlueText, BlueSpacing20, BluePrivateBalance } from '../../BlueComponents';
import { LightningLdkWallet, MultisigHDWallet, LightningCustodianWallet } from '../../class';
import { CameraScreen } from 'react-native-camera-kit';
import RNFS from 'react-native-fs';
import { Image as CompressorImage } from 'react-native-compressor';
import { RNCamera } from 'react-native-camera';
import axios from 'axios';
import { ViewPropTypes } from 'deprecated-react-native-prop-types'

const JoinGeneralPublicApplication2Screen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);

  const handleImageCaptured = (uri) => {
    setCapturedImage(uri);
    console.log('Image saved', uri);
  };

  async function requestPermissions() {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }
  
  useEffect(() => {
    requestPermissions();
  }, []);

  async function compressImage(imageUri) {
    try {
      const compressedImage = await CompressorImage.compress(imageUri);
      console.log('Compressed video URI:', compressedImage);
      // Get file info
    const fileInfo = await RNFS.stat(compressedImage);
    console.log('File size in bytes:', fileInfo.size);
      return compressedImage
    } catch (error) {
      console.error('Error compressing video:', error);
    }
  }
  
  const styles = StyleSheet.create({
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
      //textAlign: 'center',
      //justifyContent:'center',
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
    iconStyle: {
      width:80,
      maxHeight: 80,
      marginTop: 30,
    },
    textFieldWrapStyle: {
      height: 40,
      marginTop: 10,
      borderRadius: 8,
      elevation: 2.0,
      backgroundColor:colors.inputBackgroundColor,
      borderColor: 'white',
      borderWidth: 0.7,
      paddingHorizontal: 5,
      paddingVertical: 5,
      fontFamily: 'Orbitron-Regular', 
      letterSpacing: 1.1,
      fontSize: 14,
      color: 'white'
    },
    cameraButton:{
      width: 240,
      height: 140,
      backgroundColor:colors.inputBackgroundColor,
      borderRadius: 8,
      borderWidth: 0.7,
      borderColor: 'white',
      alignSelf: 'center',
      justifyContent: 'center',
      marginTop: 10
    },
    container: {
      flex: 1,
      flexDirection: 'column',
      backgroundColor: 'black',
    },
    preview: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    captureContainer: {
      flex: 1,
      width: '100%',
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
      bottom: 40
    },
  });

  const CameraModal = ({ isVisible, onClose, onImageCaptured }) => {
    const [imageUri, setImageUri] = useState(null);
    useEffect(() => {
      console.log('imageUri: ', imageUri)
    }, [imageUri]);
    

    const handleCapture = async (event) => {
      if (event.type === 'left') {
        onClose(); // Close the modal if the left button (Cancel) is pressed
      } else {
          console.log("Captured event: ", event);  
          const compressedUri = await compressImage(event.captureImages[0].uri);
          setImageUri(compressedUri)
    }};
    const handleSave = () => {
      onImageCaptured(imageUri);
      setImageUri(null); // Reset after saving
      onClose(); // Close the modal
    };
    const handleRetake = () => {
      setImageUri(null); // Reset the imageUri to go back to the camera screen
    };

    return (
      <Modal
        animationType="slide"
        transparent={false}
        visible={isVisible}
        onRequestClose={onClose}
      >
        <View style={{flex:1}}>
          {imageUri ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor:'black' }}>
              <Image source={{ uri: imageUri }} style={{ width: '70%', height: '40%' }} />
              <View style = {styles.buttonContainer}>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                  <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
                    <Text style={styles.buttonText}>Save</Text>
                  </TouchableOpacity>x
                </LinearGradient>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                  <TouchableOpacity onPress={handleRetake} style={styles.saveButton}>
                    <Text style={styles.buttonText}>Retake</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          ) : (
            <CameraScreen
              actions={{ leftButtonText: 'Go Back' }}
              cameraType="front" 
              onBottomButtonPressed={handleCapture}
              //cameraFlipImageStyle={{width:  60, height: 60}}
              captureButtonImage={require('../../img/capture.png')}
              captureButtonImageStyle={{width:  100, height: 100}}
              // flashImages={{
              //   // optional, images for flash state
              //   //on: require('path/to/image'),
              //   //off: require('path/to/image'),
              //   auto: require('../../img/flashAuto.png'),
              // }}
              
              cameraFlipImage={require('../../img/flipCameraImg1.png')}
              saveToCameraRoll={true}
              showCapturedImageCount={true}
            />
          )}
          
        </View>
      </Modal>
    );
  };

  const VideoCameraModal = ({ isVisible, onClose, onVideoCaptured }) => {
    const cameraRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
  
    const handleRecord = async () => {
      if (cameraRef.current && !isRecording) {
        setIsRecording(true);
        const promise = cameraRef.current.recordAsync();
  
        promise.then(video => {
          console.log('Video captured', video.uri);
          onVideoCaptured(video.uri);
          setIsRecording(false);
        }).catch(err => console.error('Video capture error', err));
      } else {
        cameraRef.current.stopRecording();  // this will trigger the promise resolution above
      }
    };
  
    return (
      <Modal
        animationType="slide"
        transparent={false}
        visible={isVisible}
        onRequestClose={onClose}
      >
        <View style={styles.container}>
          <RNCamera
            ref={cameraRef}
            //captureAudio={false}
            style={styles.preview}
            type={RNCamera.Constants.Type.front}
            flashMode={RNCamera.Constants.FlashMode.off}
            androidCameraPermissionOptions={{
              title: 'Permission to use camera',
              message: 'We need your permission to use your camera',
              buttonPositive: 'Ok',
              buttonNegative: 'Cancel',
            }}
            androidRecordAudioPermissionOptions={{
              title: 'Permission to use audio recording',
              message: 'We need your permission to use your microphone',
              buttonPositive: 'Ok',
              buttonNegative: 'Cancel',
            }}
          >
            {({ camera, status }) => {
              if (status !== 'READY') return <View/>;
              return (
                <View style={styles.captureContainer}>
                  <TouchableOpacity 
                    style={{flexDirection:'row', justifyContent:'space-between', marginTop: 90, marginLeft: 20}}
                    onPress={()=>setModalVisible(false)}
                  >
                    <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={handleRecord} 
                    style={[
                      styles.capture, 
                      { backgroundColor: isRecording ? '#FF7400' : 'white' },  
                      { borderColor: isRecording ? 'white' : 'gray' }
                    ]}
                  />
                </View>
              );
            }}
          </RNCamera>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
      <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
      >

        <TouchableOpacity 
          style={{flexDirection:'row', justifyContent:'space-between', marginTop: 20, marginLeft: 20}}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
        </TouchableOpacity>
    
        <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 30,}}>
          <Text style={{fontFamily: fonts.regular.fontFamily, marginLeft: 20,color: 'white', fontSize: 20,}}>APPLICATION</Text>
          <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>2/3</Text>
        </View>


        <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Liveness proof</Text>
        </View>

        <View style={{ marginTop: 30, marginHorizontal: 20 }}>   
            <TouchableOpacity 
              style={styles.cameraButton}
              onPress={() => setModalVisible(true)}
            >
              <Icon name="video" size={36} type="font-awesome-5" color={'lightgray'} />
            </TouchableOpacity>
            <Text style={[styles.smallText, {marginTop: 20}]}>Please film a short video clip to prove that you are a human</Text>
          </View>

         <View style={{flex:1}}>
            <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                <TouchableOpacity 
                  style={styles.joinButton}
                  // onPress={}
                >
                    <Text style={styles.buttonText}>NEXT STEP</Text>
                </TouchableOpacity>  
            </LinearGradient>
        </View> 

        <VideoCameraModal
            isVisible={modalVisible}
            onClose={() => setModalVisible(false)}
            //onImageCaptured={handleImageCaptured}
        />
      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplication2Screen;
