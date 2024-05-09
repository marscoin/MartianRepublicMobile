import React, { useEffect, useState, useContext } from 'react';
import { Platform, SafeAreaView, ScrollView, Image, StyleSheet, View, Text, TouchableOpacity, TextInput, I18nManager, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import { Icon } from 'react-native-elements';
import Button from '../../components/Button';
import LinearGradient from 'react-native-linear-gradient';
import { CameraScreen } from 'react-native-camera-kit';

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

  const handleImageCaptured = (uri) => {
    setCapturedImage(uri);
    console.log('Image saved', uri);
  };

  useEffect(() => {
    console.log('photo taken: ', capturedImage)
  }, [capturedImage]);
  
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
        height: 60
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
    buttonContainer: {
      position: 'absolute',
      flexDirection:'row',
      bottom: 20,
      right: 46,
      justifyContent: 'center',
      alignItems: 'center',
    },
    captureButton: {
      width: 70, 
      height: 70,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonImage: {
      width: 100,
      height: 100,
    }

  });

  const CameraModal = ({ isVisible, onClose, onImageCaptured }) => {
    const [imageUri, setImageUri] = useState(null);
    const handleCapture = (event) => {
      console.log("Captured event: ", event);  
      if (event.capture) {  // Confirming the event structure
        setImageUri(event.capture.uri);
      }
    };
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '80%' }} />
          <TouchableOpacity onPress={handleSave} style={styles.button}>
            <Text>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRetake} style={styles.button}>
            <Text>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
          <CameraScreen
            actions={{ rightButtonText: 'Done', leftButtonText: 'Cancel' }}
            // onBottomButtonPressed={(event) => {
            //   console.log("Event from camera: ", event);  
            //   if (event.type === 'right') {
            //     handleCapture(event);
            //   } else {
            //     onClose();
            //   }
            // }}
            cameraFlipImage={require('../../img/flipCameraImg.png')}
            saveToCameraRoll={true}
            showCapturedImageCount={true}
          />
        )}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.captureButton} 
            onPress={(event) => {
              console.log("Event Type: ", event.type); // Check the type of the event
  if (event.type === 'capture') { // Assuming 'capture' is a valid type
    console.log("Captured Image URI: ", event.capture);
  }
            }}>
              <Image source={require('../../img/capture.png')} style={styles.buttonImage} />
            </TouchableOpacity>
          </View>
          
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
            {capturedImage && (
              <Image source={{ uri: capturedImage }} style={{ width: 100, height: 100 }} />
            )}
            <TouchableOpacity 
              style={styles.cameraButton}
              //onPress={() => navigation.navigate('MyCameraScreen')}
              onPress={() => setModalVisible(true)}
            >
              <Icon name="camera" size={36} type="font-awesome-5" color={'lightgray'} />
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
                    navigation.navigate('JoinGeneralPublicApplication2Screen', {
                      firstName: firstName,
                      lastName: lastName,
                      displayName: displayName, 
                      bio: bio
                    })
                   }
                >
            <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                    <Text style={styles.buttonText}>NEXT STEP</Text>
            </LinearGradient>
            </TouchableOpacity>  
        </View>  
      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplicationScreen;
