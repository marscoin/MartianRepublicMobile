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
import Clipboard from '@react-native-clipboard/clipboard';
import Snackbar from 'react-native-snackbar';
import { title } from 'process';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const ForumThreadScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const route = useRoute();
    const threadTitle = route.params.thread.title;
    const threadId = route.params.thread.id;
    console.log('PARAMS', route.params)
    const [threadData, setThreadData] = useState('');

    const transformThreadData = (data) => {
        let messages = [];
        let messageMap = {};
    
        data.forEach(item => {
            // Copy the item to prevent modifying the original data
            const comment = {...item, comments: []};
    
            if (comment.pid === null) {
                // It's a main message
                messages.push(comment);
                messageMap[comment.id] = comment;
            } else {
                // It's a comment on a message
                if (messageMap[comment.pid]) {
                    messageMap[comment.pid].comments.push(comment);
                }
            }
        });
    
        return messages;
    };
    
    useEffect(() => {
        fetchThreadData();
    }, [threadId]);
    
    async function fetchThreadData() {
        console.log('THREAD ID for fetching', threadId);
        try {
            const token = await AsyncStorage.getItem('@auth_token');
            const response = await axios.get(`https://martianrepublic.org/api/forum/thread/${threadId}/comments`, {
                headers: {'Authorization': `Bearer ${token}`}
            });
            const formattedData = transformThreadData(response.data.comments.original.comments);
            setThreadData(formattedData);
            console.log('Formatted THREAD DATA', formattedData);
        } catch (error) {
            console.error('Error fetching thread data:', error);
        }
    }
      
  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
        {/* ////margin -80 sticks screen to the tabbar///// */}
        <TouchableOpacity 
          style={styles.header}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
          <View style={{flex: 1, justifyContent:'center'}}>
            <Text style={styles.headerTxt}> {threadTitle} </Text>
          </View>
        </TouchableOpacity>

        <FlatList
            data={threadData}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
                <View style={styles.threadBlock}>
                    <Text style={styles.threadAuthor}>{item.fullname}</Text>
                    <Text style={styles.threadDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                    <Text style={styles.threadTxt}>{item.content}</Text>
                    {/* Display comments if available */}
                    {item.comments.map(comment => (
                        <View key={comment.id} style={styles.commentBlock}>
                            <Text style={styles.threadReplies}>{comment.content}</Text>
                            <Text style={styles.threadAuthor}>By: {comment.fullname}</Text>
                            <Text style={styles.threadDate}>{new Date(comment.created_at).toLocaleDateString()}</Text>
                        </View>
                    ))}
                </View>
            )}
        />

     
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
        flexDirection:'row', 
        marginVertical: 20, 
        marginLeft: 20,
        //justifyContent:'center',
        alignItems: 'center'
    },
    headerTxt: {
        fontSize: 18,
        color:  'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
        marginHorizontal: 20,
        alignSelf: 'center',
        textAlign: 'center'
    },
    filterBlock: {
        width:'100%',
        flexDirection:'row',
        padding: 10,
    },
    filterButton: {
        height: 24,
        borderRadius: 10,
        justifyContent:'center',
        alignItems:'center',
        padding: 5, 
        marginHorizontal: 5
    },
    filterButtonText: {
        color:'white', 
        fontSize: 10,
        fontFamily: 'Orbitron-Black',
        letterSpacing: 1.2, 
    },
    filterDescriptionText: {
        color:'white', 
        fontSize: 15,
        fontFamily: 'Orbitron-Regular',
        letterSpacing: 1.2, 
    },
    filterButtonGradientActive: {
        height: 24,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
        justifyContent:'center',
        alignItems:'center',
    },
    filterButtonGradientInactive: {
        height: 24,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        justifyContent:'center',
        alignItems:'center',
        backgroundColor: '#B0B0B0', // Grey color for inactive state
    },
    threadBlock: {
        backgroundColor: '#2F2D2B',
        padding: 15,
        borderRadius: 5,
        marginVertical: 8,
        marginHorizontal: 10,
    },
    threadTxt: {
        fontSize: 14,
        color: 'white',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 10,
        letterSpacing: 1.1,
        lineHeight: 19
    },
    threadAuthor: {
        fontSize: 14,
        color: '#FF7400',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 3,
        letterSpacing: 1.1
    },
    threadDate: {
        fontSize: 14,
        color: 'grey',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 3,
        letterSpacing: 1.1
    },
    threadReplies: {
        fontSize: 14,
        color: 'white',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 3,
        letterSpacing: 1.1,
        marginTop: 5
    },
    commentBlock: {
        backgroundColor: '#444444', // Darker than threadBlock
        padding: 10,
        borderRadius: 5,
        marginVertical: 4,
        marginHorizontal: 20, // Indent comments to visually nest under the message
    },
});

export default ForumThreadScreen;
