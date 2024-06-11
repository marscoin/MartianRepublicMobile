import React, { useEffect, useContext ,useState, useRef, useReducer} from 'react';
import { ScrollView, Platform,ActivityIndicator, Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';
import { BlueText, BlueSpacing20, BluePrivateBalance } from '../../BlueComponents';
import { LightningLdkWallet, MultisigHDWallet, LightningCustodianWallet } from '../../class';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import Clipboard from '@react-native-clipboard/clipboard';
import Snackbar from 'react-native-snackbar';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const IndividualCitizenScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const route = useRoute();
    const person = route.params.person;
    console.log('PARAMS',person )
   
    const [userData, setUserData] = useState('');
    const [videoAvailable, setVideoAvailable] = useState(true);
    const [videoError, setVideoError] = useState(false);
    const imageLoadError = useRef({});

    const copyToClipboard = (text) => {
        Clipboard.setString(text);
        console.log('copied to clipboard', text)
        Snackbar.show({
          text: `${text} copied to clipboard!`,
          duration: Snackbar.LENGTH_SHORT,
          numberOfLines: 5
        });
    };
    
    async function fetchPersonDetails() {
       const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/citizen/${person.address}`, {
        }, {
        headers: {'Authorization': `Bearer ${token}`}
      })
        console.log('PERSONAL DATA', response.data);
        //setUserData(response.data)
    }

    useEffect(() => {
        fetchPersonDetails()
    }, []);  

    useEffect(() => {
        if (!person.user.citizen.liveness_link) {
          setVideoAvailable(false); // Automatically set to unavailable if link is empty
        }
      }, [person.user.citizen.liveness_link]);
      
  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
        {/* ////margin -80 sticks screen to the tabbar///// */}
        <TouchableOpacity 
          style={{flexDirection:'row', justifyContent:'space-between', marginVertical: 20, marginLeft: 20}}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
        </TouchableOpacity>
        <View style={styles.root}>
            <ScrollView 
                style={styles.root}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                <Image
                    source={ !person.profile_image? require('../../img/genericprofile.png'):{ uri: person.profile_image }}
                    style={styles.profileImage} 
                    onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: person.id} })}
                />

                <Text numberOfLines={2} style={styles.citizenName}>{person.user.fullname}</Text>
                
                <Text numberOfLines={1} style={styles.header}>Address</Text>
                <TouchableOpacity style={styles.txtCont} onLongPress={() => copyToClipboard(person.address)}>
                    <Text numberOfLines={2} style={styles.txt}>{person.address} </Text>
                </TouchableOpacity>

                <Text numberOfLines={1} style={styles.header}>MCR Citizen since </Text>
                <View style={styles.txtCont} >
                    <Text numberOfLines={2} style={styles.txt}>{new Date(person.mined).toLocaleDateString()} </Text>
                </View>

                <Text numberOfLines={1} style={styles.header}>Endorsements </Text>
                <View style={styles.txtCont} >
                    <Text numberOfLines={1} style={styles.txt}>{person.user.profile.endorse_cnt} </Text>
                </View>

                <Text numberOfLines={2} style={styles.header}>IPFS application link </Text>
                <TouchableOpacity style={styles.txtCont} onLongPress={() => copyToClipboard(person.embedded_link)}>
                    <Text numberOfLines={2} style={styles.txt}>{person.embedded_link} </Text>
                </TouchableOpacity>

                <Text numberOfLines={2} style={styles.header}>Liveness Video Proof </Text>

                {person.user.citizen.liveness_link && !videoError ?
                    <Video
                        source={{ uri: person.user.citizen.liveness_link }}
                        style={styles.videoPlayer}
                        resizeMode='contain'
                        controls={true}
                        onError={(e) => {
                            console.log("Video error:", e);
                            if (e.error.domain === "NSURLErrorDomain" && e.error.code === -1008) {
                            setVideoError(true); // Set video error state to true if the resource is unavailable
                            }
                        }}
                    />
                :
                    <View style={styles.videoPlaceholder}>
                        <Text style={styles.placeholderText}>VIDEO UNAVAILABLE</Text>
                    </View>
                }

                <Text numberOfLines={1} style={styles.header}>Video link </Text>
                <TouchableOpacity style={styles.txtCont} onLongPress={() => copyToClipboard(person.user.citizen.liveness_link)}>
                    <Text numberOfLines={2} style={styles.txt}>{person.user.citizen.liveness_link} </Text>
                </TouchableOpacity>
                
            </ScrollView>
        </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    root: {
        flex:1,
    },
    center: {
        marginTop: 20,
        height:80,
        flexDirection:'row',
        marginHorizontal: 16,
        justifyContent:'center',
        alignItems:'center'
    },
    profileImage: {
        width: windowWidth * 0.9,
        height: windowWidth * 0.7,
        borderRadius: 10,
        marginHorizontal: 20,
        alignSelf: 'center'
    },
    citizenName: {
        fontSize: 28,
        color:  '#FF7400',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        marginTop: 20
    },
    header: {
        fontSize: 18,
        color:  'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        marginTop: 20
    },
    txt: {
        fontSize: 14,
        color:  'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"400",
        letterSpacing: 1.1, 
    },
    txtCont: {
        backgroundColor: '#2F2D2B',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"400",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        marginTop: 7,
        padding: 10
    },
    videoPlayer: {
        width: 240,
        height: 160,
        alignSelf: 'center'
    },
    videoPlaceholder: {
        width: 240,
        height: 160,
        backgroundColor: '#2F2D2B',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginTop: 10
      },
      placeholderText: {
        color: 'white',
        fontSize: 16,
        textAlign: 'center',
      },
});

export default IndividualCitizenScreen;
