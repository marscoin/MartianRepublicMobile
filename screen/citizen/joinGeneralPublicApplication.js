import React, { useEffect, useState, useContext } from 'react';
import { Platform, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList } from 'react-native';
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
  const { colors } = useTheme();
  //const { wallets } = useContext(BlueStorageContext);
  //console.log('wallets', wallets)
  const route = useRoute();
  
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
        fontWeight:"600",
        marginTop: 30
    },
    smallText: {
        color:'white', 
        textAlign: 'center',
        justifyContent:'center',
        fontSize: 10,
        fontWeight:"400",
    },
    buttonText: {
        color:'white', 
        textAlign: 'center',
        fontSize: 18,
        fontWeight:"600",
    },
    joinButton: {
        height: 60,
        borderRadius: 20,
        marginHorizontal: 20,
        justifyContent:'center',
    },
    joinButtonGradient: {
        height: 60,
        borderRadius: 20,
        marginHorizontal: 20,
    },
    
  });

  
  
  return (
    <SafeArea style={styles.root}>
        <View style={styles.center}>
            <Text style={styles.welcomeText}>Welcome to  </Text>
            <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
        </View>
        <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>



         <View style={{flex:1}}>
            <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                <TouchableOpacity style={styles.joinButton}>
                    <Text style={styles.buttonText}>PUBLISH APPLICATION</Text>
                </TouchableOpacity>  
            </LinearGradient>
        </View> 
    </SafeArea>
  );
};


export default JoinGeneralPublicApplicationScreen;
