import React, { useEffect, useContext ,useState, useRef, useReducer} from 'react';
import { ScrollView, Platform,ActivityIndicator, Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCodeComponent from '../../components/QRCodeComponent';

import Snackbar from 'react-native-snackbar';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const CivicIDScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const route = useRoute();
    const user = route.params.user;
    console.log ('YYYYYY', user)
    
      
  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
        {/* ////margin -80 sticks screen to the tabbar///// */}
        <TouchableOpacity 
          style={{flexDirection:'row', marginVertical: 20, marginLeft: 20}}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
        </TouchableOpacity>

        <View style={styles.civicBG}>
            <Image style={styles.marscoinLogo} source={require('../../img/marscoin.png')} />
            <Image style={styles.imageLG} source={require('../../img/gold3.jpeg')} />
            <Image
                source={ !user.citizen.avatar_link? require('../../img/genericprofile.png'):{ uri: user.citizen.avatar_link }}
                style={styles.profileImage} 
                //onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: user.citize.id} })}
            />
            <Text style={styles.txt}>Martian Congressional Republic Public Identifier</Text>
            <Text style={styles.userAddressLG}>{user.citizen.public_address.slice(0,8)}</Text>
            
   
            <Text style={styles.userName}>{`${user.citizen.firstname} ${user.citizen.lastname}`}</Text>
            <Text style={styles.userAddress}>{user.citizen.public_address}</Text>
            <Text style={styles.date}>{new Date(user.citizen.created_at).toLocaleDateString()}</Text>
            <View style={styles.qrStyle}>
                <QRCodeComponent
                    isLogoRendered={false}
                    value={user.citizen.public_address}
                    size={120}
                    isMenuAvailable={false}
                    ecl="L"
                    onError={this.onError}
                    style={styles.qrStyle}
                />
            </View>
        </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    center: {
        marginTop: 20,
        height:80,
        flexDirection:'row',
        marginHorizontal: 16,
        justifyContent:'center',
        alignItems:'center'
    },
    header: {
        fontSize: 18,
        color:  'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        alignSelf: 'center'
    },
    civicBG: {
        marginTop: 30,
        height:windowHeight * 0.6,
        width: windowWidth * 0.8,
        borderRadius: 20,  
        justifyContent:'center',
        alignItems:'center',
        alignSelf: 'center', 
        position: 'relative', 
        overflow: 'hidden', 
    },
    imageLG: {
        borderRadius: 20,  
        transform: [{ rotateZ: '90deg' }],
        resizeMode: 'stretch', 
    },
    profileImage: {
        height: 120, 
        width: 120,
        borderRadius:10,  
        transform: [{ rotateZ: '90deg' }],
        resizeMode: 'stretch', 
        position: 'absolute',
        top: 20, 
        right: 20, 
        zIndex: 1
    },
    qrStyle: {
        borderRadius: 20,  
        transform: [{ rotateZ: '90deg' }],
        resizeMode: 'stretch', 
        position: 'absolute',
        top: windowHeight * 0.42,
        left: 20, 
        zIndex: 1
    },
    marscoinLogo: {
        position: 'absolute',
        height: 70, 
        width: 70,
        bottom: 20, 
        right: 20, 
        opacity: 0.85,
        transform: [{ rotateZ: '90deg' }],
        zIndex: 1
    },
    userName: {
        fontSize: 34,
        color: 'black',
        fontFamily: 'Orbitron-Black',
        position: 'absolute',
        top: windowHeight * 0.16,
        left: 20,
        transform: [{ rotateZ: '90deg' }],
    },
    txt: {
        fontSize: 16,
        color: 'black',
        fontFamily: 'Orbitron-Regular',
        fontWeight:'500',
        position: 'absolute',
        top: 260,
        left: 140,
        transform: [{ rotateZ: '90deg' }],
        maxWidth: windowHeight * 0.28,
        letterSpacing: 1.1,
        //backgroundColor:'red'
    },
    date: {
        fontSize: 18,
        color: 'black',
        fontFamily: 'Orbitron-Black',
        position: 'absolute',
        top: windowHeight * 0.08,
        left: -7,
        transform: [{ rotateZ: '90deg' }],
    },
    userAddressLG: {
        fontSize: 44,
        color: 'black',
        fontFamily: 'Orbitron-Black',
        position: 'absolute',
        top: 270,
        left: 70,
        transform: [{ rotateZ: '90deg' }],
        letterSpacing: 2,
    },
    userAddress: {
        fontSize: 16,
        color: 'black',
        fontFamily: 'Orbitron-Regular',
        position: 'absolute',
        top: windowHeight * 0.19,
        left: -70,
        transform: [{ rotateZ: '90deg' }],
        letterSpacing: 1.1,
        //maxWidth: windowHeight * 0.98,
        //backgroundColor:'red'
    },
    
});

export default CivicIDScreen;
