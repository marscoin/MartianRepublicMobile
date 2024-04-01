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

const CitizenScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { wallets } = useContext(BlueStorageContext);
  console.log('wallets', wallets)
  const route = useRoute();
  
  const styles = StyleSheet.create({
    root: {
      paddingTop: 10,
      //flex:1
      //backgroundColor: colors.elevated,
    },
    center: {
      height:80,
      flexDirection:'row',
      marginHorizontal: 16,
      backgroundColor:'red',
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
    iconStyle: {
        width:80,
        maxHeight: 80,
        marginTop: 30,
    },
    itemRoot: {
        backgroundColor: 'transparent',
        padding: 10,
        marginVertical: 17,
    },
    image: {
        width: 50,
        height: 45,
        position: 'absolute',
        bottom: 0,
        right: 0,
    },
    transparentText: {
        backgroundColor: 'transparent',
    },
    label: {
        backgroundColor: 'transparent',
        fontSize: 14,
        color: '#fff',
        writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    },
    balance: {
        backgroundColor: 'transparent',
        fontWeight: 'bold',
        fontSize: 20,
        writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
        color: '#fff',
    },
    gradient: {
        padding: 15,
        borderRadius: 10,
        minHeight: 30,
        width: 120,
        elevation: 5,
    },
    noWallet: {
        height: 200,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#FF7400',
        borderStyle:'dashed',
        marginHorizontal: 20,
        alignItems:'center',
        justifyContent: 'center', 
        padding:30
    },
    noWalletText: {
        color:'white', 
        textAlign: 'center',
        fontSize: 18,
        fontWeight:"600",
    },
    // noWalletButton: {
    //     color:'white', 
    //     textAlign: 'center',
    //     fontSize: 18,
    //     fontWeight:"600",
    // },
    // joinButton: {
    //     height: 60,
    //     borderRadius: 20,
    //     marginHorizontal: 20,
    //     justifyContent:'center',
    // },
    // joinButtonGradient: {
    //     height: 60,
    //     borderRadius: 20,
    //     marginHorizontal: 20,
    // },
  });

  const renderWalletItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => {
        // Handle wallet selection if needed
      }}
      accessibilityRole="button"
    >
      <View style={styles.itemRoot}>
        <LinearGradient colors={WalletGradient.gradientsFor(item.type)} style={styles.gradient}>
            <Image
              source={(() => {
                switch (item.type) {
                  case LightningLdkWallet.type:
                  case LightningCustodianWallet.type:
                    return I18nManager.isRTL ? require('../../img/lnd-shape-rtl.png') : require('../../img/lnd-shape.png');
                  case MultisigHDWallet.type:
                    return I18nManager.isRTL ? require('../../img/vault-shape-rtl.png') : require('../../img/vault-shape.png');
                  default:
                    return I18nManager.isRTL ? require('../../img/btc-shape-rtl.png') : require('../../img/btc-shape.png');
                }
              })()}
              style={styles.image}
            />
            <Text style={styles.label}>{item.getLabel()}</Text>
            <Text style={styles.balance}>{item.getBalance()} BTC</Text>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
  
  return (
    <SafeArea style={styles.root}>
        <View style={styles.center}>
            <Text style={styles.welcomeText}>Welcome to  </Text>
            <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
        </View>
        <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
        
        <View style={{marginVertical: 5}}>
            <FlatList
                data={wallets}
                renderItem={renderWalletItem}
                keyExtractor={(item) => item.getID()}
                horizontal={true}
            />
        </View>

        {/* ///////////NO MARSCOIN WALLET BLOCK///////// */}
        {/* <View style={{flex:1, alignItems: 'center', justifyContent:'center'}}>    
            <View style={styles.noWallet}>
                <Text style={[styles.noWalletText, {marginBottom: 15}]}>TO JOIN GENERAL MARTIAN PUBLIC YOU NEED TO CREATE MARSCOIN WALLET</Text>
                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                    <TouchableOpacity style={[styles.joinButton]}>
                        <Text style={styles.noWalletText}>GENERATE WALLET</Text>
                    </TouchableOpacity>
                </LinearGradient>
            </View>  
        </View> */}

        {/* ///////////WALLET EXIST BLOCK///////// */}
        <View style={{flex:1, alignItems: 'center', justifyContent:'center'}}>   
            <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                <TouchableOpacity style={styles.joinButton}>
                    <Text style={styles.buttonText}>JOIN GENERAL MARTIAN PUBLIC</Text>
                </TouchableOpacity>  
            </LinearGradient>
        </View>
    </SafeArea>
  );
};


export default CitizenScreen;
