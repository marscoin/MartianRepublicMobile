import React, { useEffect, useState, useRef, useContext } from 'react';
import { Platform, SafeAreaView, ScrollView, Image, StyleSheet, View, Text, PermissionsAndroid, TouchableOpacity, TextInput, I18nManager, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import loc from '../../loc';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';
import LinearGradient from 'react-native-linear-gradient';
import RNFS from 'react-native-fs';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const JoinGeneralPublicApplication3Screen = () => {
  const navigation = useNavigation();
  const { colors, fonts } = useTheme();
  const route = useRoute();

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
    iconStyle: {
      width:80,
      maxHeight: 80,
      marginTop: 30,
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
          <Text style={[styles.buttonText, {alignSelf: 'flex-end', marginRight: 20,fontSize: 16}]}>3/3</Text>
        </View>

        <View style={{ marginTop: 30, marginHorizontal: 20 }}>
            <Text style={styles.medText}>Check your application data: </Text>
        </View>

         <View style={{flex:1}}>
          <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
            <TouchableOpacity 
              style={styles.joinButton}
              // onPress={}
            >
                <Text style={styles.buttonText}>PUBLISH APPLICATION</Text>
            </TouchableOpacity>  
          </LinearGradient>

            {!isFormValid &&
              <Text style={[styles.smallText, {marginTop: 10}]}>Notarize via a blockchain transaction</Text>}
        </View> 
      </ScrollView>  
    </SafeAreaView>
  );
};


export default JoinGeneralPublicApplication3Screen;
