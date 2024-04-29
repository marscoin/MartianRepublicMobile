import React, { useEffect, useState, useContext , useRef, useReducer} from 'react';
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

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const CitizenScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const { wallets } = useContext(BlueStorageContext);
    const citizenPageRef = useRef(1);
    const publicPageRef = useRef(1);
    const applicantPageRef = useRef(1);
    const initialState = {
        filterCitizen: true,
        filterPublic: false,
        filterApplicants: false,
        citizens: [],
        generalPublic: [],
        applicants: [],
        lastPageApplicants: 1,
        imageLoadErrors: {},
        isCitizen: false
      };
    //console.log('wallets', wallets)
    const route = useRoute();
    const imageLoadError = useRef({});

    function martianReducer(state, action) {
        switch (action.type) {
            case 'SET_FILTER_CITIZEN':
                return { ...state, filterCitizen: true, filterPublic: false, filterApplicants: false };
            case 'SET_FILTER_PUBLIC':
                return { ...state, filterCitizen: false, filterPublic: true, filterApplicants: false };
            case 'SET_FILTER_APPLICANTS':
                return { ...state, filterCitizen: false, filterPublic: false, filterApplicants: true };
            case 'SET_CITIZENS':
                return { ...state, citizens: action.payload };
            case 'SET_IS_CITIZEN':
                return { ...state, isCitizen: true };    
            case 'SET_GENERAL_PUBLIC':
                return { ...state, generalPublic: action.payload };
            case 'SET_APPLICANTS':
                return { ...state, 
                    applicants: {
                        ...state.applicants,
                        data: [...(state.applicants?.data || []), ...action.payload.data],
                    }
                }
            case 'SET_LAST_PAGE_APPLICANTS':
                return { ...state, lastPageApplicants: action.payload }; 
            case 'SET_IMAGE_LOAD_ERROR':
                const newState = { ...state };
                newState.imageLoadErrors[action.payload.id] = true; // Use a unique ID for each image
                return newState;
          default:
            throw new Error();
        }
      }

    const [state, dispatch] = useReducer(martianReducer, initialState);
    
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
        buttonText: {
            color:'white', 
            textAlign: 'center',
            fontSize: 18,
            fontFamily: 'Orbitron-Black',
            letterSpacing: 1.5, 
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
        imageLG: {
            width: '100%',
            height: 100,
            marginTop: 0
        },
        transparentText: {
            backgroundColor: 'transparent',
            fontFamily: 'Orbitron-Black',
            letterSpacing: 1.5, 
        },
        label: {
            backgroundColor: 'transparent',
            fontSize: 14,
            color: '#fff',
            writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
            fontFamily: 'Orbitron-Black',
            letterSpacing: 1.5, 
        },
        balance: {
            backgroundColor: 'transparent',
            fontWeight: 'bold',
            fontSize: 20,
            writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
            color: '#fff',
            fontFamily: 'Orbitron-Black',
            letterSpacing: 1.1, 
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
            fontFamily: 'Orbitron-Regular',
            letterSpacing: 1.1, 
        },
        filterButton: {
            height: 24,
            borderRadius: 10,
            justifyContent:'center',
            alignItems:'center',
            padding: 5
        },
        filterButtonText: {
            color:'white', 
            fontSize: 10,
            fontFamily: 'Orbitron-Black',
            letterSpacing: 1.5, 
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
        filterBlock: {
            flex:1, 
            width:'100%',
            alignItems: 'center', 
            justifyContent:'space-around',
            flexDirection:'row',
            borderWidth: 1,
            borderBottomWidth: 0.5,
            borderColor: '#FF7400',
            padding: 10,
            borderTopRightRadius: 10,
            borderTopLeftRadius: 10
        },
        citizensContainer: {
            flex: 1, 
            width: windowWidth,
            borderWidth: 0.5,
            borderColor: '#FF7400',
            //backgroundColor: 'white'
          },
        citizenItem: {
            //height: 100,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 0.3,
            borderColor: '#FF7400',
            padding: 10,
            width: windowWidth,
            //backgroundColor: 'white'
        },
        citizenImage: {
            width: windowWidth * 0.19,
            height: windowWidth * 0.19,
            marginHorizontal: 5,
            borderRadius: 10
        },
        citizenAddress: {
            fontSize: 16,
            color: '#FFF',
            marginTop: 5,
        },
        citizenDate: {
            fontSize: 14,
            color: '#AAA',
            marginTop: 5
        },
        citizenName: {
            fontSize: 18,
            color:  '#FF7400',
            fontFamily: 'Orbitron-Regular',
            fontWeight:"500",
            letterSpacing: 1.1, 
            //marginRight: 50,
        },
        endorsTxt: {
            fontSize: 8,
            color:  '#FF7400',
            fontFamily: 'Orbitron-Regular',
            fontWeight:"500",
            // marginBottom: 5
        },
        endorseButton: {
            borderColor:  '#FF7400',
            borderWidth:1,
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 5,
            alignItems: 'center',
            justifyContent: 'center'
        },
    });

    const fetchGeneralPublic = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/public?page=${publicPageRef.current}`)
            //console.log('GENERAL PUBLIC', response.data) 
            dispatch({ type: 'SET_GENERAL_PUBLIC', payload: response.data });
        } catch (error) {
            console.error(`Error fetching genersal public:`, error);   
        } finally {
        }
    }

    const fetchCitizens = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/citizen?page=${citizenPageRef.current}`)
            console.log('CITIZENS', response.data)
            dispatch({ type: 'SET_CITIZENS', payload: response.data });
        } catch (error) {
            console.error(`Error fetching citizens:`, error);   
        } finally {
        }
    }

    const fetchApplicants = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/applicant?page=${applicantPageRef.current}`)
            //console.log('APPLICANTS', response.data)
            dispatch({ type: 'SET_APPLICANTS', payload: response.data });   
            dispatch({ type: 'SET_LAST_PAGE_APPLICANTS', payload: response.data.last_page });   
        } catch (error) {
            console.error(`Error fetching applicants:`, error);   
        } finally {
        }
    }

    useEffect(() => {
        // Check if any civic wallet matches a citizen's address
        const checkIfCitizen = () => {
            const isCitizen = wallets.some(wallet =>
                wallet.civic && state.citizens.some(citizen => citizen.address === wallet._address)
            );
            console.log('IS CITIZEN', isCitizen)
            if (isCitizen) {
                dispatch({ type: 'SET_IS_CITIZEN', payload: true });
            }
        };

        if (wallets.length > 0 && state.citizens.length > 0) {
            checkIfCitizen();
        }
    }, [wallets, state.citizens]);

    useEffect(() => {
        fetchGeneralPublic()
        fetchApplicants()
        fetchCitizens()
    }, []);

    const handleEndApplicantsReached = async () => {
        console.log('handleEndApplicantsReached')
        console.log('applicantPageRef', applicantPageRef)

        if (applicantPageRef.current < state.lastPageApplicants) {
          applicantPageRef.current += 1; // Prepare to fetch the next page
          console.log('applicantPageRef', applicantPageRef)
          await fetchApplicants(); // Fetch the next page of applicants
        } else {
          console.log("No more applicants to fetch.");
        }
    };
    
  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
        <View style={styles.root}>
        <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
        >
            
            <View style={styles.center}>
                <Text style={styles.welcomeText}>Welcome to  </Text>
                <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
            </View>
            <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
            

            {/* ///////////JOIN MARS BLOCK///////// */}
            {!state.isCitizen &&
            <View style={{flex:1, alignItems: 'center', justifyContent:'center', marginTop: 40}}>    
                <View style={styles.noWallet}>
                    <Text style={[styles.noWalletText, {marginBottom: 15}]}>SUBMIT YOUR APPLICATION TO JOIN THE GENERAL MARTIAN PUBLIC</Text>
                    <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                        <TouchableOpacity 
                            style={[styles.joinButton]}
                            onPress={() => navigation.navigate('JoinGeneralPublicApplicationScreen')}
                        >
                            <Text style={styles.noWalletText}>JOIN MARS!</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>  
            </View>
            }
            {state.isCitizen &&
            <View style={{flex:1, alignItems: 'center', justifyContent:'center', marginTop: 40}}>    
                <View style={styles.noWallet}>
                    <Text style={[styles.noWalletText, { fontSize: 34, letterSpacing: 4, fontWeight:'800'}]}>WELCOME CITIZEN</Text>
                </View>  
            </View>
            }

            <Image style={styles.imageLG} source={require('../../img/sunrise.png')} />

            {/* ///////////FILTER BLOCK///////// */}
            <View style={styles.filterBlock}>
                <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => {
                        dispatch({ type: 'SET_FILTER_CITIZEN' })
                    }}
                >
                    <LinearGradient
                        colors={state.filterCitizen ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // Change to grey gradient if inactive
                        style={state.filterCitizen ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                    >
                        <Text style={styles.filterButtonText}>CITIZENS</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => {
                        dispatch({ type: 'SET_FILTER_PUBLIC' })
                    }}
                >
                    <LinearGradient
                        colors={state.filterPublic ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // grey gradient if inactive
                        style={state.filterPublic ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                    >
                        <Text style={styles.filterButtonText}>PUBLIC</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => {
                        dispatch({ type: 'SET_FILTER_APPLICANTS' })
                    }}
                >
                    <LinearGradient
                        colors={state.filterApplicants ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // grey gradient if inactive
                        style={state.filterApplicants ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                    >
                        <Text style={styles.filterButtonText}>APPLICANTS</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {state.filterCitizen &&
                <View style={styles.citizensContainer}>
                    {state.citizens && state.citizens.filter(citizen => citizen.user.citizen).map((citizen, index) => (
                        <View key={index} style={styles.citizenItem}>
                          
                            <Image
                                source={state.imageLoadErrors[citizen.id] ? require('../../img/genericprofile.png') : !citizen.user.citizen.avatar_link ? require('../../img/genericprofile.png'):{ uri: citizen.user.citizen.avatar_link }}
                                style={styles.citizenImage} 
                                onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: citizen.id } })}
                            />
                          
                            <View style={{ marginHorizontal: 5, width: windowWidth * 0.45 }}>
                                <Text numberOfLines={2} style={styles.citizenName}>{citizen.user.fullname}</Text>
                                <Text numberOfLines={1} style={styles.citizenAddress}>Address: {citizen.address.slice(0,9)}</Text>
                                <Text numberOfLines={1} style={styles.citizenDate}>Citizen since: {new Date(citizen.mined).toLocaleDateString()}</Text>
                            </View>
                            {citizen.user.profile.endorse_cnt && 
                            <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'center' }}>
                                <Text numberOfLines={1} style={styles.endorsTxt}>ENDORSEMENTS</Text>
                                <Text style={[styles.citizenName, {fontSize: 22, marginTop:5}]}>{citizen.user.profile.endorse_cnt}</Text>
                            </View>}
                            {!citizen.user.profile.endorse_cnt && 
                            <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'space-evenly' }}>
                                <Text numberOfLines={1} style={[styles.endorsTxt, {marginBottom: 8}]}>FOUNDER</Text>
                                <Icon name="medal" type="material-community" color="#FF7400" />
                            </View>}
                        </View>
                    ))}
                </View>
            }

            {state.filterPublic &&
                <View style={styles.citizensContainer}>
                    {state.generalPublic &&  state.generalPublic.map((person, index) => (
                        <View key={index} style={[styles.citizenItem, {justifyContent:'flex-start'}]}>
                            <Image    
                                source={state.imageLoadErrors[person.id] ? require('../../img/genericprofile.png') : { uri: person.profile_image }}
                                style={styles.citizenImage} 
                                onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: person.id } })}
                            />
                            <View style={{ marginHorizontal: 5, width: windowWidth * 0.45 }}>
                                <Text numberOfLines={2} style={styles.citizenName}>{person.user.fullname}</Text>
                                <Text numberOfLines={1} style={styles.citizenAddress}>Address: {person.address.slice(0,9)}</Text>
                                <Text numberOfLines={1} style={styles.citizenDate}>Joined: {new Date(person.created_at).toLocaleDateString()}</Text>
                            </View>
                            {person.user.profile.citizen===0 &&
                            <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'center' }}>
                                <View style ={styles.endorseButton}>
                                    <Text style={styles.endorsTxt}>ENDORSE</Text>
                                </View>
                            
                                <Text style={[styles.citizenName, {fontSize: 20, marginTop: 10}]}>{person.user.profile.endorse_cnt}</Text>
                            </View>}
                            {person.user.profile.citizen===1 &&
                            <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'center' }}>
                                <Icon name="check-circle" type="material-community" color="#FF7400" />
                            </View>}
                        </View>
                    ))}
                </View>
            }

            {state.filterApplicants &&
                <View style={styles.citizensContainer}>
                    <FlatList
                        key={'applicants-list'}
                        data={state.applicants.data}
                        extraData={state.applicants.data}
                        renderItem={({ item }) => (
                            <View key={item.userid} style={styles.citizenItem}>
                                <View style={{ marginLeft: 10 }}>
                                    <Text style={styles.citizenName}>{item.fullname}</Text>
                                    {item.address &&
                                     <Text style={styles.citizenAddress}>Address: {item.address.slice(0,9)}</Text> 
                                    }
                                </View>
                            </View>
                        )}
                        keyExtractor={(item) => item.userid.toString()} // Use userid as the key
                        onEndReached={handleEndApplicantsReached}
                        onEndReachedThreshold={0.5} 
                        scrollEnabled={false}
                    />
                </View>
            }
           
        </ScrollView>
        </View>
   
    </SafeAreaView>
  );
};


export default CitizenScreen;
