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
import Video from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import WalletGradient from '../../class/wallet-gradient';
import { BlueText, BlueSpacing20, BluePrivateBalance } from '../../BlueComponents';
import { LightningLdkWallet, MultisigHDWallet, LightningCustodianWallet } from '../../class';
import { CameraScreen } from 'react-native-camera-kit';
import RNFS from 'react-native-fs';
import { Image as CompressorImage } from 'react-native-compressor';
import { RNCamera } from 'react-native-camera';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ViewPropTypes } from 'deprecated-react-native-prop-types'

const JoinGeneralPublicApplication2Screen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedVideo, setCapturedVideo] = useState(null);
  const [civicAddress, setCivicAddress] = useState(null);
  const {wallets} = useContext(BlueStorageContext);

  function getCivicAddress(wallets) {
    // Loop through the wallets array
    for (let wallet of wallets) {
        // Check if the wallet has the civic property set to true
        if (wallet.civic) {
            console.log('CIVIC ADDRESS:', wallet._address );
            setCivicAddress(wallet._address);
        }
    }
    return null;  // Return null if no civic wallet is found
  }  
  useEffect(() => {
    getCivicAddress(wallets)
  }, []);

  const handleImageCaptured = (uri) => {
    setCapturedImage(uri);
    console.log('Image saved', uri);
  };
  
  const onVideoCaptured = (videoUri) => {
    setCapturedVideo(videoUri);
    console.log('Video URI:', videoUri);
    // You can handle further logic here, such as updating state or posting the video
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

  async function postVideo() {
    const token = await AsyncStorage.getItem('@auth_token');
    // Convert the image to Base64
    const base64 = await RNFS.readFile(capturedVideo, 'base64');
    const videoData = `data:image/jpeg;base64,${base64}`;

    response = await axios.post("https://martianrepublic.org/api/pinvideo", {
      file: videoData,
      type: 'profile_video',
      address: civicAddress,
    }, {
      headers: {'Authorization': `Bearer ${token}`}
    })
    .then(response => {
      console.log('Video pinned!!!! hash:', response.data.hash);
    })
    .catch(error => {
      console.error('Error:', error.response);
    });
  }

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
    timerText: {
      color:'white', 
      textAlign: 'center',
      fontSize: 16,
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
      width: 74,
      height: 74,
      borderRadius: 35,
      opacity: 0.8,
      borderWidth: 4,
      padding: 15,
      paddingHorizontal: 20,
      alignSelf: 'center',
      justifyContent:'center',
      alignItems: 'center',
      margin: 20,
      position: 'absolute',
      bottom: 40
    },
    videoReviewContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'black',
  },
  videoPlayer: {
      width: '90%',
      height: '50%',
      //marginHorizontal: 20,
  },
  preview: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
  },
  actionButton: {
    padding: 10,
    margin: 10,
    backgroundColor: 'lightgray',
}
  });

  const VideoCameraModal = ({ isVisible, onClose, onVideoCaptured, onRetake, onSave  }) => {
    const cameraRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const [remainingTime, setRemainingTime] = useState(60); // Countdown from 60 seconds

    const handleSave = () => {
      // compressed = compressImage(capturedUri)
       onVideoCaptured(capturedUri);
       setCapturedVideo(null); // Reset after saving
       onClose(); // Close the modal
     };
     const handleRetake = () => {
       setCapturedVideo(null); // Reset the imageUri to go back to the camera screen
     };

    useEffect(() => {
        let interval;
        if (isRecording && remainingTime > 0) {
            interval = setInterval(() => {
                setRemainingTime(remainingTime => remainingTime - 1);
            }, 1000);
        } else if (remainingTime <= 0) {
            stopRecording(); // Function to stop recording
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isRecording, remainingTime]);

    const handleRecord = async () => {
        if (cameraRef.current && !isRecording) {
            setIsRecording(true);
            setRemainingTime(60); // Reset the timer
            try {
                const video = await cameraRef.current.recordAsync();
                onVideoCaptured(video.uri);
            } catch (err) {
                console.error('Video capture error', err);
            }
        } else if (isRecording) {
            stopRecording();
        }
    };

    const stopRecording = () => {
        if (cameraRef.current && isRecording) {
            cameraRef.current.stopRecording();
            setIsRecording(false);
            setRemainingTime(60); // Reset timer when stopped
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={false}
            visible={isVisible}
            onRequestClose={onClose}
        >
          {capturedVideo ? (
                <View style={styles.videoReviewContainer}>
                   <TouchableOpacity 
                      style={{flexDirection:'row', justifyContent:'space-between', alignSelf:'flex-start', marginTop: 20, marginLeft: 20}}
                      onPress={()=>onClose()}
                    >
                      <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
                    </TouchableOpacity>
                    <Video source={{ uri: capturedVideo }} style={styles.videoPlayer} />
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity onPress={handleRetake} style={styles.actionButton}>
                            <Text>Retake</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleSave} style={styles.actionButton}>
                            <Text>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (    
                <RNCamera
                    ref={cameraRef}
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
                                    onPress={() => {
                                        onClose();
                                        setIsRecording(false);
                                    }}
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
                                >
                                    {isRecording ? <Text style={styles.timerText}>{remainingTime}</Text> : <Text/>}
                                </TouchableOpacity>
                            </View>
                        );
                    }}
                </RNCamera>
            )}
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
            <View>
              <Text style={[styles.smallText, {marginTop: 20}]}>Please record a brief video to verify your identity.</Text>
              <Text style={[styles.medText, {marginTop: 20, color:'#FF7400' }]}>INSTRUCTIONS</Text>
              <Text style={[styles.medText, {marginTop: 20 }]}>1. Hold your phone horizontally (landscape) during the recording.</Text>
              <Text style={[styles.medText, {marginTop: 20 }]}>2. Display your CIVIC ADDRESS clearly on a piece of paper within the video frame.</Text>
              <Text style={[styles.medText, {marginTop: 20 }]}>3. Describe your reasons for wanting to join the Martian Congressional Republic.</Text>
              <Text style={[styles.medText, {marginTop: 20, color:'#FF7400' }]}>Note: Your recording should not exceed 60 seconds.</Text>
            </View>
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
            onVideoCaptured={onVideoCaptured}
        />
      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplication2Screen;
