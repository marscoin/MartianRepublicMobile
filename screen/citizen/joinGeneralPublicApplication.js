import React, { useEffect, useState, useRef } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, View, Text,Image,TouchableOpacity, TextInput, I18nManager, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import { Icon } from 'react-native-elements';
import Button from '../../components/Button';
import LinearGradient from 'react-native-linear-gradient';
import { CameraScreen } from 'react-native-camera-kit';
import RNFS from 'react-native-fs';
import { Image as CompressorImage } from 'react-native-compressor';
import { RNCamera } from 'react-native-camera';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JoinGeneralPublicApplicationScreen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isFormValid, setIsFormValid] = useState(false);

  const handleImageCaptured = (uri) => {
    setCapturedImage(uri);
    console.log('Image saved', uri);
  };

  async function compressImage(imageUri) {
    try {
      const compressedImage = await CompressorImage.compress(imageUri);
      console.log('Compressed image URI:', compressedImage);
      // Get file info
    const fileInfo = await RNFS.stat(compressedImage);
    console.log('File size in bytes:', fileInfo.size);
      return compressedImage
    } catch (error) {
      console.error('Error compressing image:', error);
    }
  }

  async function postName() {
    const token = await AsyncStorage.getItem('@auth_token');
    response = await axios.post("https://martianrepublic.org/api/scitizen", {
      firstname: firstName,
      lastname: lastName,
      displayname: displayName,
      shortbio: bio, 
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      console.log('Success:', response);
    })
    .catch(error => {
      console.error('Error:', error.response);
    });
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
    // button: {
    //   padding: 15,
    //   backgroundColor: '#fff',
    //   borderRadius: 5,
    // },
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
    // buttonImage: {
    //   width: 100,
    //   height: 100,
    // }

  });

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
              <Image source={{ uri: capturedUri }} style={{ width: '70%', height: '40%', marginTop: 160, }} />
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
            //captureAudio={false}
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

  // const CameraModal = ({ isVisible, onClose, onImageCaptured }) => {
  //   const [imageUri, setImageUri] = useState(null);
  //   useEffect(() => {
  //     console.log('imageUri: ', imageUri)
  //   }, [imageUri]);
    

  //   const handleCapture = async (event) => {
  //     if (event.type === 'left') {
  //       onClose(); // Close the modal if the left button (Cancel) is pressed
  //     } else {
  //         console.log("Captured event: ", event);  
  //         const compressedUri = await compressImage(event.captureImages[0].uri);
  //         setImageUri(compressedUri)
  //   }};
  //   const handleSave = () => {
  //     onImageCaptured(imageUri);
  //     setImageUri(null); // Reset after saving
  //     onClose(); // Close the modal
  //   };
  //   const handleRetake = () => {
  //     setImageUri(null); // Reset the imageUri to go back to the camera screen
  //   };

  //   return (
  //     <Modal
  //       animationType="slide"
  //       transparent={false}
  //       visible={isVisible}
  //       onRequestClose={onClose}
  //     >
  //       <View style={{flex:1}}>
  //         {imageUri ? (
  //           <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor:'black' }}>
  //             <Image source={{ uri: imageUri }} style={{ width: '70%', height: '40%' }} />
  //             <View style = {styles.buttonContainer}>
  //               <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
  //                 <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
  //                   <Text style={styles.buttonText}>Save</Text>
  //                 </TouchableOpacity>
  //               </LinearGradient>
  //               <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
  //                 <TouchableOpacity onPress={handleRetake} style={styles.saveButton}>
  //                   <Text style={styles.buttonText}>Retake</Text>
  //                 </TouchableOpacity>
  //               </LinearGradient>
  //             </View>
  //           </View>
  //         ) : (
  //           <CameraScreen
  //             actions={{ leftButtonText: 'Go Back' }}
  //             cameraType="front" 
  //             onBottomButtonPressed={handleCapture}
  //             //cameraFlipImageStyle={{width:  60, height: 60}}
  //             captureButtonImage={require('../../img/capture.png')}
  //             captureButtonImageStyle={{width:  100, height: 100}}
  //             // flashImages={{
  //             //   // optional, images for flash state
  //             //   //on: require('path/to/image'),
  //             //   //off: require('path/to/image'),
  //             //   auto: require('../../img/flashAuto.png'),
  //             // }}
              
  //             cameraFlipImage={require('../../img/flipCameraImg1.png')}
  //             saveToCameraRoll={true}
  //             showCapturedImageCount={true}
  //           />
  //         )}
          
  //       </View>
  //     </Modal>
  //   );
  // };
  useEffect(() => {
    const validateForm = () => {
      return firstName.length > 0 && lastName.length > 0 && displayName.length > 0 && bio.length > 0 && capturedImage != null;
    };
  
    setIsFormValid(validateForm());
  }, [firstName, lastName, displayName, bio, capturedImage]);

  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
      <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 200 }}
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

        <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 50,}}>
          <Text style={{fontFamily: fonts.regular.fontFamily, marginLeft: 20,color: 'white', fontSize: 20,}}>APPLICATION</Text>
          <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>1/3</Text>
        </View>

        <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>First Name *</Text>
            <TextInput
                //selectionColor={Colors.primaryColor}
                value={firstName}
                placeholder=""
                placeholderTextColor="white"
                onChangeText={(text) => setFirstName(text)}
                style={styles.textFieldWrapStyle}
                 //ref={workRef}
                // onFocus={() => handleFocus(workRef)}
                maxLength={50}
            />
          </View>

          <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Last Name *</Text>
            <TextInput
                //selectionColor={Colors.primaryColor}
                value={lastName}
                placeholder=""
                placeholderTextColor="white"
                onChangeText={(text) => setLastName(text)}
                style={styles.textFieldWrapStyle}
                 //ref={workRef}
                // onFocus={() => handleFocus(workRef)}
                maxLength={50}
            />
          </View>

          <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Display Name *</Text>
            <TextInput
                //selectionColor={Colors.primaryColor}
                value={displayName}
                placeholder=""
                placeholderTextColor="white"
                onChangeText={(text) => setDisplayName(text)}
                style={styles.textFieldWrapStyle}
                 //ref={workRef}
                // onFocus={() => handleFocus(workRef)}
                maxLength={50}
            />
          </View>

          <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Short Bio *</Text>
            <TextInput
                value={bio}
                placeholder=""
                placeholderTextColor="white"
                onChangeText={(text) => setBio(text)}
                style={[styles.textFieldWrapStyle, {height: 100}]}
                 //ref={workRef}
                // onFocus={() => handleFocus(workRef)}
                maxLength={500}
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
                   onPress={ () =>
                    {
                      postName();
                    navigation.navigate('JoinGeneralPublicApplication2Screen', {
                      firstName: firstName,
                      lastName: lastName,
                      displayName: displayName, 
                      bio: bio
                    })
                   }}
                   disabled={!isFormValid}  // Disable the button if form is not valid
                >
            <LinearGradient colors={ isFormValid ? ['#FFB67D','#FF8A3E', '#FF7400']: ['gray', 'gray']} style={styles.joinButtonGradient}>
                    <Text style={styles.buttonText}>NEXT STEP</Text>
            </LinearGradient>
            </TouchableOpacity>  

            { !isFormValid &&
            <Text style={styles.smallText}>All fields marked with * are mandatory to proceed</Text>}
        </View>  
      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplicationScreen;
