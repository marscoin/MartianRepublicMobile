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

const ForumScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const route = useRoute();
    const [userData, setUserData] = useState('');

    
    async function fetchPublicSquareData() {
        const token = await AsyncStorage.getItem('@auth_token');
        // response = await axios.get(`https://martianrepublic.org/api/forum/categories/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        response = await axios.get(`https://martianrepublic.org/api/forum/category/1/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        console.log('PUBLIC SQUARE DATA', response.data);
    }

    async function fetchProposalsData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/2/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        console.log('PROPOSALS DATA', response.data);
    }

    async function fetchAmendmentData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/3/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        console.log('AMENDMENTS DATA', response.data);
    }

    async function fetchSupportData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/3/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        console.log('SUPPORT DATA', response.data);
    }

    useEffect(() => {
        fetchPublicSquareData()
        fetchProposalsData()
        fetchAmendmentData()
        fetchSupportData()
    }, []);  

      
  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
        {/* ////margin -80 sticks screen to the tabbar///// */}
        <TouchableOpacity 
          style={{flexDirection:'row', marginVertical: 20, marginLeft: 20}}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
          <View style={{flex: 1, justifyContent:'center'}}>
            <Text style={styles.header}>FORUM</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.root}>
            <ScrollView 
                style={styles.root}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
            >
               
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
    header: {
        fontSize: 18,
        color:  'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        alignSelf: 'center'
    },
    
});

export default ForumScreen;
