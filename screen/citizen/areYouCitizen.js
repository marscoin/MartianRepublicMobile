import React, { useEffect, useState, useContext , useRef, useLayoutEffect,  useReducer} from 'react';
import { ScrollView, Platform,ActivityIndicator, Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList, StatusBar } from 'react-native';
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
import axios from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const AreYouCitizenScreen = () => {
    const navigation = useNavigation();
    const isFocused = useIsFocused();

    //////hiding tabs//////
    useLayoutEffect(() => {
        navigation.setOptions({
          tabBarStyle: isFocused ? { display: 'none' } : {},
        });
      }, [isFocused, navigation]);
    
    const { colors } = useTheme();
    const route = useRoute();
    const imageLoadError = useRef({});

    const styles = StyleSheet.create({
        root: {
            flex:1,
        },
        imageLG: {
            position: 'absolute', // changed from 'relative' to 'absolute'
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: -1,
            resizeMode:'cover'
        },
        center: {
            marginTop: 20,
            height:80,
            flexDirection:'row',
            marginHorizontal: 16,
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
            fontFamily: 'Orbitron-SemiBold',
            letterSpacing: 1.5, 
        },
        largeText: {
            color:'white', 
            textAlign: 'center',
            justifyContent:'center',
            fontSize: 40,
            fontWeight:'800',
            fontFamily: 'Orbitron-SemiBold',
            letterSpacing: 1.5, 
            marginHorizontal: 30,
            marginVertical: 50,
            letterSpacing: 3
        },
        iconStyle: {
            width:80,
            maxHeight: 80,
            marginTop: 30,
        },
        buttonText: {
            color:'white', 
            textAlign: 'center',
            fontSize: 18,
            fontFamily: 'Orbitron-Black',
            letterSpacing: 1.5, 
        },
        joinButton: {
            height: 60,
            width: 100,
            borderRadius: 20,
            marginHorizontal: 20,
            justifyContent:'center',
        },
        joinButtonGradient: {
            height: 60,
            borderRadius: 20,
            marginHorizontal: 20,
        },
        noWalletText: {
            color:'white', 
            textAlign: 'center',
            fontSize: 22,
            fontWeight:"900",
            fontFamily: 'Orbitron-Regular',
            letterSpacing: 1.1, 
        },
    });

    
  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
        <Image style={styles.imageLG} source={require('../../img/mars1.png')} />
        <View style={styles.root}>    
            <View style={styles.center}>
                <Text style={styles.welcomeText}>Welcome to  </Text>
                <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
            </View>
            <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>

            <Text style={styles.largeText}>ARE YOU ALREADY A MCR CITIZEN?</Text>

            <View style={{flexDirection: 'row', alignItems:'center', justifyContent:'center'}}>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                    <TouchableOpacity 
                        style={[styles.joinButton]}
                        onPress={() => navigation.navigate('MainApp')}
                    >
                        <Text style={styles.noWalletText}>YES</Text>
                    </TouchableOpacity>
                </LinearGradient>

                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                    <TouchableOpacity 
                        style={[styles.joinButton]}
                        //onPress={() => navigation.navigate('JoinGeneralPublicApplicationScreen')}
                    >
                        <Text style={styles.noWalletText}>NO</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </View>

            
        </View>
   
    </SafeAreaView>
  );
};


export default AreYouCitizenScreen;
