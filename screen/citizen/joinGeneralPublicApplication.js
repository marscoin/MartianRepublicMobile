import React, { useEffect, useState, useContext } from 'react';
import { Platform, SafeAreaView, ScrollView, Image, StyleSheet, View, Text, TouchableOpacity, TextInput, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import LinearGradient from 'react-native-linear-gradient';


const JoinGeneralPublicApplicationScreen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  
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

  });

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

        <View style={{flexDirection:'row', justifyContent:'center', marginTop: 150,}}>
          <Text style={{fontFamily: fonts.regular.fontFamily, marginHorizontal: 20, color: 'white', fontSize: 18, fontWeight: '700', textAlign:'center'}}>APPLICATION WILL BE AVAILABLE IN THE NEXT VERSION OF THE APP!</Text>
        </View>
        <View style={{flex:1}}>
            <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                <TouchableOpacity style={styles.joinButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.buttonText}>GO BACK</Text>
                </TouchableOpacity>  
            </LinearGradient>
        </View> 

        {/* <View style={{flexDirection:'row', justifyContent:'space-between', marginTop: 50,}}>
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
                //selectionColor={Colors.primaryColor}
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
        </View>  */}
      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplicationScreen;
