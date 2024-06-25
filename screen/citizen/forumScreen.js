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
    const initialState = {
        filterPublicSquare: true,
        filterProposals: false,
        filterAmendment: false,
        filterSupport: false,
        publicSquareData: [],
        proposalsData:[],
        amendmentData:[],
        supportData: [],
        isLoading: false,
        error: null,
      };

      function forumReducer(state, action) {
        switch (action.type) {
            case 'SET_FILTER_PUBLIC_SQUARE':
                return { ...state, filterPublicSquare: true, filterProposals: false, filterAmendment: false, filterSupport: false };
            case 'SET_FILTER_PROPOSALS':
                return { ...state, filterPublicSquare: false, filterProposals: true, filterAmendment: false, filterSupport: false };
            case 'SET_FILTER_AMENDMENT':
                return { ...state, filterPublicSquare: false, filterProposals: false, filterAmendment: true, filterSupport: false };
            case 'SET_FILTER_SUPPORT':
                return { ...state, filterPublicSquare: false, filterProposals: false, filterAmendment: false, filterSupport: true };  
            case 'SET_IS_LOADING':
                return { ...state, isLoading: true, error: null };
            case 'SET_PUBLIC_SQUARE_DATA':
                return { ...state, publicSquareData: action.payload };
            case 'SET_PROPOSALS_DATA':
                return { ...state, proposalsData: action.payload };
            case 'SET_AMENDMENT_DATA':
                return { ...state, amendmentData: action.payload };
            case 'SET_SUPPORT_DATA':
                return { ...state, supportData: action.payload };    
          default:
            throw new Error();
        }
      }  
    
    const [state, dispatch] = useReducer(forumReducer, initialState);

    
    async function fetchPublicSquareData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/1/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        console.log('PUBLIC SQUARE DATA', response.data);
        dispatch({ type: 'SET_PUBLIC_SQUARE_DATA', payload: response.data.threads });
    }

    async function fetchProposalsData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/2/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        //console.log('PROPOSALS DATA', response.data);
        dispatch({ type: 'SET_PROPOSALS_DATA', payload: response.data.threads });
    }

    async function fetchAmendmentData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/3/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        //console.log('AMENDMENT DATA', response.data);
        dispatch({ type: 'SET_AMENDMENT_DATA', payload: response.data.threads });
    }

    async function fetchSupportData() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.get(`https://martianrepublic.org/api/forum/category/3/threads`, { headers: {'Authorization': `Bearer ${token}`}})
        //console.log('SUPPORT DATA', response.data);
        dispatch({ type: 'SET_SUPPORT_DATA', payload: response.data.threads });
    }

    useEffect(() => {
        fetchPublicSquareData()
        fetchProposalsData()
        fetchAmendmentData()
        fetchSupportData()
    }, []);  
      
  return (
    <SafeAreaView style={{flex: 1}}> 
        <TouchableOpacity 
          style={{flexDirection:'row', marginVertical: 20, marginLeft: 20}}
          onPress={()=>navigation.goBack()}
        >
          <Icon name="chevron-left" size={20} type="font-awesome-5" color={'white'} />
          <View style={{flex: 1, justifyContent:'center'}}>
            <Text style={styles.header}>FORUM</Text>
          </View>
        </TouchableOpacity>

        <View >
            {/* ///////////FILTER BLOCK///////// */}
            <ScrollView 
                style={styles.filterBlock}
                horizontal={true}
            >
                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => {
                            dispatch({ type: 'SET_FILTER_PUBLIC_SQUARE' })
                        }}
                    >
                        <LinearGradient
                            colors={state.filterPublicSquare ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // Change to grey gradient if inactive
                            style={state.filterPublicSquare ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                        >
                            <Text style={styles.filterButtonText}>PUBLIC SQUARE</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => {
                            dispatch({ type: 'SET_FILTER_PROPOSALS' })
                        }}
                    >
                        <LinearGradient
                            colors={state.filterProposals ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // grey gradient if inactive
                            style={state.filterProposals ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                        >
                            <Text style={styles.filterButtonText}>PROPOSALS</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => {
                            dispatch({ type: 'SET_FILTER_AMENDMENT' })
                        }}
                    >
                        <LinearGradient
                            colors={state.filterAmendment ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // grey gradient if inactive
                            style={state.filterAmendment ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                        >
                            <Text style={styles.filterButtonText}>AMENDMENT</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.filterButton}
                        onPress={() => {
                            dispatch({ type: 'SET_FILTER_SUPPORT' })
                        }}
                    >
                        <LinearGradient
                            colors={state.filterSupport ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // grey gradient if inactive
                            style={state.filterSupport ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                        >
                            <Text style={styles.filterButtonText}>SUPPORT</Text>
                        </LinearGradient>
                    </TouchableOpacity>
            </ScrollView >

            <View style={{ alignItems: 'center', justifyContent:'center', margin: 10, backgroundColor: '#2F2D2B', padding : 8}}>
                {state.filterPublicSquare &&
                    <Text style={styles.filterDescriptionText}>General Public Discussion Forum</Text>
                }
                {state.filterProposals &&
                    <Text style={styles.filterDescriptionText}>Start discussing a new proposal</Text>
                }
                {state.filterAmendment &&
                    <Text style={styles.filterDescriptionText}>MCR Development Discussion</Text>
                }
                {state.filterSupport &&
                    <Text style={styles.filterDescriptionText}>Questions & Answers</Text>
                }
            </View>

            <ScrollView 
                style={styles.root}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 200 }}
            >
                {state.filterPublicSquare && state.publicSquareData && state.publicSquareData.map((thread) => (
                    <TouchableOpacity 
                        key={thread.id} 
                        style={styles.threadBlock}
                        onPress={() => navigation.navigate('ForumThreadScreen',{thread: thread})}
                    >
                        <Text style={styles.threadTitle}>{thread.title}</Text>
                        <Text style={styles.threadAuthor}>Author: {thread.author_name}</Text>
                        <Text style={styles.threadDate}>Created at: {new Date(thread.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.threadReplies}>Replies: {thread.reply_count}</Text>
                    </TouchableOpacity>
                ))}

                {state.filterProposals && state.proposalsData && state.proposalsData.map((thread) => (
                    <View key={thread.id} style={styles.threadBlock}>
                        <Text style={styles.threadTitle}>{thread.title}</Text>
                        <Text style={styles.threadAuthor}>Author: {thread.author_name}</Text>
                        <Text style={styles.threadDate}>Created at: {new Date(thread.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.threadReplies}>Replies: {thread.reply_count}</Text>
                    </View>
                ))}

                {state.filterAmendment && state.amendmentData && state.amendmentData.map((thread) => (
                    <View key={thread.id} style={styles.threadBlock}>
                        <Text style={styles.threadTitle}>{thread.title}</Text>
                        <Text style={styles.threadAuthor}>Author: {thread.author_name}</Text>
                        <Text style={styles.threadDate}>Created at: {new Date(thread.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.threadReplies}>Replies: {thread.reply_count}</Text>
                    </View>
                ))}

                {state.filterSupport && state.supportData && state.supportData.map((thread) => (
                    <View key={thread.id} style={styles.threadBlock}>
                        <Text style={styles.threadTitle}>{thread.title}</Text>
                        <Text style={styles.threadAuthor}>Author: {thread.author_name}</Text>
                        <Text style={styles.threadDate}>Created at: {new Date(thread.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.threadReplies}>Replies: {thread.reply_count}</Text>
                    </View>
                ))}

            </ScrollView>
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
    threadTitle: {
        fontSize: 17,
        color: 'white',
        fontWeight: 'bold',
        fontFamily: 'Orbitron-Regular',
        marginBottom: 10,
        letterSpacing: 1.1
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
    
});

export default ForumScreen;
