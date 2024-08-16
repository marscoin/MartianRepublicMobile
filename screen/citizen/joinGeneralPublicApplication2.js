import React, { useEffect, useState, useRef, useContext } from 'react';
import { Platform, SafeAreaView, ScrollView, ActivityIndicator, StyleSheet, Modal, View, Text, PermissionsAndroid, TouchableOpacity, TextInput, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import loc from '../../loc';
import { Icon } from 'react-native-elements';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import Video from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { Video as CompressorVideo } from 'react-native-compressor';
import { RNCamera } from 'react-native-camera';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JoinGeneralPublicApplication2Screen = ({params}) => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();
  const {firstName, lastName, displayName, bio, photo, video} = route.params;
  console.log('PARAMS',route.params )
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedVideo, setCapturedVideo] = useState(route.params.video);
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [isFormValid, setIsFormValid] = useState(false);
  const [videoIPFS, setVideoIPFS] = useState(null);
  const [capturedUri, setCapturedUri] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const onVideoCaptured = (videoUri) => {
    setCapturedVideo(videoUri);
    console.log('Video URI:', videoUri);
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
    console.log('POST VIDEO START');
    const token = await AsyncStorage.getItem('@auth_token');
    const civicAddress = await AsyncStorage.getItem('civicAddress');

    // Create an instance of FormData
    const formData = new FormData();
    
    // Add video file to the form data. 'file' is the field name the server expects
    formData.append('file', {
        uri: capturedVideo,
        type: 'video/mp4', // MIME type of the file
        name: 'upload.mp4' // Optional: file name if required by backend
    });

    // Add other data the server expects
    formData.append('type', 'personal_video');
    formData.append('address', civicAddress);

    try {
        const response = await axios.post("https://martianrepublic.org/api/pinvideo", formData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'multipart/form-data', // Important: Axios handles the boundary
            }
        });

        if (response.status === 200 && response.data) {
            console.log('Video pinned!!!! hash:', response.data.Hash);
            setVideoIPFS(response.data.Hash); 
        } else {
            console.log('Failed to upload video, status:', response.status);
        }
    } catch (error) {
        console.error('Error uploading video:', error.response ? error.response.data : error.message);
    }
}

  const handleSubmit = async () => {
    setLoading(true);
    try {
        await postVideo();
    } catch (error) {
        console.error("Error in submission video:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (videoIPFS) {
      navigation.navigate('JoinGeneralPublicApplication3Screen', {
        firstName,
        lastName,
        displayName,
        bio,
        photo,
        video: videoIPFS
      });
    }
  }, [videoIPFS]); 

  useEffect(() => {
    const validateForm = () => {
      return capturedVideo != null;
    };
    setIsFormValid(validateForm());
  }, [capturedVideo]);
  
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
      fontSize: 16,
      fontFamily: fonts.fontFamily,
      fontWeight:"400",
      fontFamily: 'Orbitron-Regular',
    },
    infoText: {
      color:'white', 
      fontSize: 26,
      fontFamily: fonts.fontFamily,
      fontWeight:"600",
      letterSpacing: 1.2,
      fontFamily: 'Orbitron-Regular',
      transform: [{ rotate: '90deg' }] ,
      alignSelf:'flex-end'
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
      transform: [{ rotate: '90deg' }] ,
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
    videoPlayerMain: {
      width: 240,
      height: 160,
      alignSelf: 'center'
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
        height: '40%',
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
    },
    buttonContainer1: {
      flexDirection:'row',
      width: '100%',
      justifyContent: 'space-around',
    },
    saveButton: {
      width: 120, 
      height: 44,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    controlBar: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    controlButton: {
      padding: 10,
      margin: 10,
      borderRadius: 5,
      },
  });

  const VideoCameraModal = ({ isVisible, onClose, onVideoCaptured, onRetake, onSave  }) => {
    const cameraRef = useRef(null);
    // const [capturedUri, setCapturedUri] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [videoPaused, setVideoPaused] = useState(true);
    const [videoEnded, setVideoEnded] = useState(false);
    const [remainingTime, setRemainingTime] = useState(60); // Countdown from 60 seconds

    const handleSave = () => {
      // compressed = compressImage(capturedUri)
       onVideoCaptured(capturedUri);
       setCapturedUri(null); // Reset after saving
       onClose(); // Close the modal
     };

     const handleRetake = () => {
       setCapturedVideo(null); // Reset the imageUri to go back to the camera screen
     };

     const stopRecording = () => {
      if (cameraRef.current && isRecording) {
          cameraRef.current.stopRecording();
          setIsRecording(false);
          setRemainingTime(60);
      }
  };

    const togglePlayPause = () => {
      if (videoEnded) { // If video has ended, replay from start
          setVideoPaused(false);
          setVideoEnded(false); // Reset video end status
      } else {
          setVideoPaused(!videoPaused);
      }
    };

    const onVideoEnd = () => {
        setVideoPaused(true);
        setVideoEnded(true); // Set video end status to true
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


    async function compressVideo(videoUri) {
      try {
        const options = {
          compressionMethod: 'auto', // or 'manual' for more control
          quality: 'low', // 'low', 'medium', 'high'
          bitrateMultiplier: 0.5, // Reduces bitrate to 75% of the original
          removeAudio: false,
        };
        const compressedVideoUri = await CompressorVideo.compress(videoUri, options);
        console.log('Compressed video path:', compressedVideoUri);
        return compressedVideoUri;
      } catch (error) {
        console.error('Error compressing video:', error);
      }
    }

    const handleRecord = async () => {
      if (cameraRef.current && !isRecording) {
        setIsRecording(true);
        setRemainingTime(60); // Reset the timer
        try {
          const options = {
            quality: RNCamera.Constants.VideoQuality["480p"],
          };
          const video = await cameraRef.current.recordAsync(options);
          const compressedVideoUri = await compressVideo(video.uri);
          onVideoCaptured(compressedVideoUri);
          setCapturedUri(compressedVideoUri);
        } catch (err) {
          console.error('Video capture error', err);
        }
      } else if (isRecording) {
        stopRecording();
      }
    };

    const handleModalClose = () => {
      setVideoPaused(true);
      setVideoEnded(false);
      onClose();
    };

    return (
        <Modal
            animationType="slide"
            transparent={false}
            visible={isVisible}
            onRequestClose={handleModalClose}
        >
          {capturedVideo ? (
              <View style={styles.videoReviewContainer}>
                  <TouchableOpacity 
                    style={{flexDirection:'row', justifyContent:'space-between', alignSelf:'flex-start', marginTop: 20, marginLeft: 20}}
                    onPress={()=>onClose()}
                  >
                    <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
                  </TouchableOpacity>
                  <Video
                        source={{ uri: capturedVideo }}
                        style={styles.videoPlayer}
                        paused={videoPaused}
                        resizeMode="contain"
                        onEnd={onVideoEnd} // Handle video end
                        repeat={true} // Control if the video should loop
                    />
                  <View style={styles.controlBar}>
                      <TouchableOpacity onPress={togglePlayPause} style={styles.controlButton}>
                          <Icon name={videoPaused ? 'play-circle-outline' : 'pause'} size={40} color={'white'} />
                      </TouchableOpacity>
                  </View>

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

                                {!isRecording &&
                                <Text style={[styles.infoText, {marginTop: 200 }]}>Please hold your phone horizontally (landscape) during the recording.</Text>}

                                {isRecording &&
                                <View style={{flexDirection:'row'}}>
                                  
                                  <Text style={[styles.infoText, {marginTop: 200 }]}>If you don't know what to say, read this: "I herewith declare that I, (your name), am human and a member of the Martian Republic."</Text>
                                </View>}

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
          <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>2/3</Text>
        </View>

        <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Liveness proof</Text>
        </View>

        <View style={{ marginTop: 30, marginHorizontal: 20 }}>   
          {!capturedVideo && 
            <TouchableOpacity 
              style={styles.cameraButton}
              onPress={() => setModalVisible(true)}
            >
              <Icon name="video" size={36} type="font-awesome-5" color={'lightgray'} />
            </TouchableOpacity>
          }
          {capturedVideo &&
            <TouchableOpacity 
              //style={styles.cameraButton}
              onPress={() => setModalVisible(true)}
            >
              <Video
                source={{ uri: capturedVideo }}
                paused={isVideoPaused}
                style={styles.videoPlayerMain}
                resizeMode='contain'
              />
            </TouchableOpacity>
          }
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
            <LinearGradient colors={ isFormValid ? ['#FFB67D','#FF8A3E', '#FF7400']: ['gray', 'gray']} style={styles.joinButtonGradient}>
                <TouchableOpacity 
                  style={styles.joinButton}
                  onPress={handleSubmit}
                  disabled={!isFormValid}
                >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.buttonText}>NEXT STEP</Text>
                    )}
                </TouchableOpacity>  
            </LinearGradient>
          
            { !isFormValid &&
                <Text style={[styles.smallText, {marginTop: 10}]}>Upload video to proceed</Text>
            }
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
