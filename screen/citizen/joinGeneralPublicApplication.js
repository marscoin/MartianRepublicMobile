import React, { useEffect, useState, useContext } from 'react';
import { Platform, ScrollView, Image, StyleSheet, View, Text, TouchableOpacity, TextInput, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import loc from '../../loc';
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
      paddingTop: 10,
      //flex:1
      //backgroundColor: colors.elevated,
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
      //borderColor: colors.buttonBackgroundColor,
      borderColor: 'white',
      borderWidth: 0.7,
      paddingHorizontal: 5,
      paddingVertical: 5,
      // ...Fonts.blackColor16Regular
      fontSize: 14,
      color: 'white'
    },

  });

  return (
    <SafeArea style={styles.root}>
      <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
      >
        <View style={styles.center}>
            <Text style={styles.welcomeText}>Welcome to  </Text>
            <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
        </View>
        <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC </Text>

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
                onChangeText={(text) => setFirstName({ firstName: text })}
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
                onChangeText={(text) => setLastName({ firstName: text })}
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
                onChangeText={(text) => setDisplayName({ firstName: text })}
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
                onChangeText={(text) => setBio({ firstName: text })}
                style={[styles.textFieldWrapStyle, {height: 100}]}
                 //ref={workRef}
                // onFocus={() => handleFocus(workRef)}
                maxLength={500}
                multiline={true}
            />
          </View>

         <View style={{flex:1}}>
            <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                <TouchableOpacity style={styles.joinButton}>
                    <Text style={styles.buttonText}>NEXT STEP</Text>
                </TouchableOpacity>  
            </LinearGradient>
        </View> 
      </ScrollView>  
    </SafeArea>
  );
};


export default JoinGeneralPublicApplicationScreen;
