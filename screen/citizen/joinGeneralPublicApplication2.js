import { marsAlert } from '../../components/MarsDialog';
import { saveCitizenshipDraft, ipfsURL } from '../../blue_modules/citizenship-draft';
import { getCivicToken } from '../../blue_modules/civic-api';
import { citizenshipVideoFile, citizenshipVideoUploadError } from '../../blue_modules/citizenship-media';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, ActivityIndicator, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import loc from '../../loc';
import { Icon } from 'react-native-elements';
import { useTheme } from '../../components/themes';
import Video from 'react-native-video';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import { Video as CompressorVideo } from 'react-native-compressor';
import { launchCamera } from 'react-native-image-picker';
import { recordCitizenshipVideo, spokenCodeText } from '../../blue_modules/citizenship-video';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JoinGeneralPublicApplication2Screen = ({params}) => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();
  const {firstName, lastName, displayName, bio, photo, video} = route.params;

  const [capturedVideo, setCapturedVideo] = useState(route.params.video);
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [isFormValid, setIsFormValid] = useState(false);
  const [videoIPFS, setVideoIPFS] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sayCode, setSayCode] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('civicAddress')
      .then(address => setSayCode(spokenCodeText(address)))
      .catch(() => {});
  }, []);
  
  const onVideoCaptured = (videoUri) => {
    setCapturedVideo(videoUri);
    setVideoIPFS(null);

  }; 

  async function openVideoCamera() {
    if (preparing) return;
    setPreparing(true);
    setIsVideoPaused(true);
    try {
      const recording = await recordCitizenshipVideo({
        launchCamera,
        compress: (uri, options) => CompressorVideo.compress(uri, options),
        fileSize: async uri => (await RNFS.stat(uri)).size,
      });
      if (recording) onVideoCaptured(recording.uri);
    } catch (error) {
      marsAlert('Recording not saved', error.message);
    } finally {
      setPreparing(false);
    }
  }

  async function postVideo() {
    if (capturedVideo === video && video) return ipfsURL(video);
    const token = await getCivicToken();
    const civicAddress = await AsyncStorage.getItem('civicAddress');
    const formData = new FormData();
    let file;
    try {
      const info = await RNFS.stat(capturedVideo);
      file = citizenshipVideoFile(capturedVideo, Number(info.size));
    } catch (error) {
      marsAlert('Recording not ready', error.code ? 'The recording could not be read. Please record it again.' : error.message);
      return null;
    }
    formData.append('file', file);
    formData.append('type', 'personal_video');
    formData.append('address', civicAddress);
    const response = await axios.post('https://martianrepublic.org/api/pinvideo', formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }, timeout: 120000,
    });
    const uploaded = ipfsURL(response.data.Hash);
    await saveCitizenshipDraft(civicAddress, { video: uploaded });
    setVideoIPFS(uploaded);
    return uploaded;
  }

  const handleSubmit = async () => {
    if (loading || !capturedVideo) return;
    setLoading(true);
    try {
      const uploaded = videoIPFS || await postVideo();
      if (!uploaded) return;
      navigation.navigate('JoinGeneralPublicApplication3Screen', { firstName, lastName, displayName, bio, photo, video: uploaded });
    } catch (error) {
      marsAlert('Video not uploaded', citizenshipVideoUploadError(error));
    } finally {
      setLoading(false);
    }
  };

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
      alignItems: 'center',
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
          {preparing ? (
            <View style={styles.cameraButton}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={[styles.smallText, { marginTop: 12 }]}>Preparing your recording…</Text>
            </View>
          ) : !capturedVideo ? (
            <TouchableOpacity style={styles.cameraButton} onPress={openVideoCamera} testID="RecordCitizenshipVideo" accessibilityRole="button" accessibilityLabel="Record your video">
              <Icon name="video" size={36} type="font-awesome-5" color={'lightgray'} />
              <Text style={[styles.smallText, { marginTop: 12 }]}>Tap to record</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <TouchableOpacity onPress={() => setIsVideoPaused(paused => !paused)} accessibilityRole="button" accessibilityLabel={isVideoPaused ? 'Play your recording' : 'Pause your recording'}>
                <Video
                  source={{ uri: capturedVideo }}
                  paused={isVideoPaused}
                  onEnd={() => setIsVideoPaused(true)}
                  style={styles.videoPlayerMain}
                  resizeMode='contain'
                />
                {isVideoPaused && (
                  <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
                    <Icon name="play-circle" size={48} type="font-awesome-5" color={'white'} />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={openVideoCamera} style={{ alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 20 }} testID="RecordCitizenshipVideoAgain">
                <Text style={[styles.medText, { color: '#FF7400' }]}>Record again</Text>
              </TouchableOpacity>
            </View>
          )}
          <View>
              <Text style={[styles.smallText, {marginTop: 20}]}>Please record a brief video to verify your identity.</Text>
              <Text style={[styles.medText, {marginTop: 20, color:'#FF7400' }]}>INSTRUCTIONS</Text>
              <Text style={[styles.medText, {marginTop: 20 }]}>1. Hold your phone horizontally (landscape) and keep your face in view.</Text>
              {sayCode ? (
                <View>
                  <Text style={[styles.medText, {marginTop: 20 }]}>2. Say your name, then read these four characters aloud. They are the end of your civic address, and they tie this recording to you.</Text>
                  <Text style={{ color: '#FF7400', fontSize: 34, letterSpacing: 6, textAlign: 'center', marginTop: 14, fontFamily: fonts.regular.fontFamily }} testID="SpokenCode">{sayCode}</Text>
                </View>
              ) : (
                <Text style={[styles.medText, {marginTop: 20 }]}>2. Say your name clearly at the start.</Text>
              )}
              <Text style={[styles.medText, {marginTop: 20 }]}>3. Describe your reasons for wanting to join the Martian Congressional Republic.</Text>
              <Text style={[styles.medText, {marginTop: 20, color:'#FF7400' }]}>Keep your recording under 60 seconds and 5 MB.</Text>
          </View>
        </View>

         <View style={{flex:1}}>
            <LinearGradient colors={ isFormValid ? ['#FFB67D','#FF8A3E', '#FF7400']: ['gray', 'gray']} style={styles.joinButtonGradient}>
                <TouchableOpacity 
                  style={styles.joinButton}
                  onPress={handleSubmit}
                  disabled={!isFormValid || loading}
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

      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplication2Screen;
