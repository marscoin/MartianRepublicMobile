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

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const CitizenScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const { wallets } = useContext(BlueStorageContext);
    const citizenPageRef = useRef(1);
    const publicPageRef = useRef(1);
    const applicantPageRef = useRef(1);
    const [userData, setUserData] = useState('');
    const initialState = {
        filterCitizen: true,
        filterPublic: false,
        filterApplicants: false,
        citizens: [],
        generalPublic: [],
        applicants: [],
        imageLoadErrors: {},
        isCitizen: false
      };
    const lastFetchedCitizens = useRef([]);
    const lastFetchedPublic = useRef([]);
    const route = useRoute();
    const imageLoadError = useRef({});

    async function fetchUser() {
        const token = await AsyncStorage.getItem('@auth_token');
        response = await axios.post("https://martianrepublic.org/api/scitizen", {
          }, {
          headers: {'Authorization': `Bearer ${token}`}
        })
        console.log('USER DATA', response.data);
        setUserData(response.data)
      }
      useEffect(() => {
        fetchUser()
      }, []);  

    function martianReducer(state, action) {
        switch (action.type) {
            case 'SET_FILTER_CITIZEN':
                return { ...state, filterCitizen: true, filterPublic: false, filterApplicants: false };
            case 'SET_FILTER_PUBLIC':
                return { ...state, filterCitizen: false, filterPublic: true, filterApplicants: false };
            case 'SET_FILTER_APPLICANTS':
                return { ...state, filterCitizen: false, filterPublic: false, filterApplicants: true };
            case 'SET_CITIZENS':
                return {
                    ...state,
                    citizens: {
                        ...state.citizens, 
                        data: [...(state.citizens.data || []), ...action.payload]}
                };
            case 'SET_IS_CITIZEN':
                return { ...state, isCitizen: true };    
            case 'SET_GENERAL_PUBLIC':
                return {
                    ...state,
                    generalPublic: {
                        ...state.generalPublic, 
                        data: [...(state.generalPublic.data || []), ...action.payload]}
                };
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

    const fetchGeneralPublic = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/public?page=${publicPageRef.current}`)
            console.log('GENERAL PUBLIC', response.data) 

            // Check if new data is the same as the last fetched data
            if (JSON.stringify(lastFetchedPublic.current) === JSON.stringify(response.data)) {
                console.log("No new public data to fetch.");
                return; // Stop the fetching process as data is repeated
            }
            // Update the last fetched data
            lastFetchedPublic.current = response.data;
            // Dispatch new data to the reducer
            dispatch({ type: 'SET_GENERAL_PUBLIC', payload: response.data });
        } catch (error) {
            console.error(`Error fetching genersal public:`, error);   
        } finally {
        }
    }

    const fetchCitizens = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/citizen?page=${citizenPageRef.current}`);
            //console.log('CITIZENS', response.data);
            // Check if new data is the same as the last fetched data
            if (JSON.stringify(lastFetchedCitizens.current) === JSON.stringify(response.data)) {
                console.log("No new citizens data to fetch.");
                return; // Stop the fetching process as data is repeated
            }
            // Update the last fetched data
            lastFetchedCitizens.current = response.data;
    
            // Dispatch new data to the reducer
            dispatch({ type: 'SET_CITIZENS', payload: response.data });
    
        } catch (error) {
            console.error(`Error fetching citizens:`, error);   
        }
    };

    const fetchApplicants = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/applicant?page=${applicantPageRef.current}`);
            //console.log('APPLICANTS', response.data);
            const sortedApplicants = response.data.data.sort((a, b) => {
                const countA = countMissingFields(a);
                const countB = countMissingFields(b);
                return countA - countB;
            });
            // Prepare the whole response object with the sorted data
            const updatedResponse = {
                ...response.data,
                data: sortedApplicants
            };
            dispatch({ type: 'SET_APPLICANTS', payload: updatedResponse });
            dispatch({ type: 'SET_LAST_PAGE_APPLICANTS', payload: response.data.last_page });
        } catch (error) {
            console.error(`Error fetching applicants:`, error);
        } finally {
        }
    };

    const getMissingFields = (applicant) => {
        const allFields = ["name", "shortbio", "avatar_link", "liveness_link"];
        const missingFields = new Set();
    
        if (!applicant || !applicant.citizen) {
            allFields.forEach(field => missingFields.add(field));
            return missingFields;
        }
    
        // Check if any part of the name is missing
        if (!applicant.citizen.firstname || !applicant.citizen.lastname || !applicant.citizen.displayname) {
            missingFields.add("name");
        }
    
        // Add field to missingFields if it's empty or missing
        allFields.forEach(field => {
            if (field !== "name" && !applicant.citizen[field]) {
                missingFields.add(field);
            }
        });
    
        return missingFields;
    };

    const countMissingFields = (applicant) => {
        let count = 0;
        // Check if the citizen object is present and proceed accordingly
        if (!applicant.citizen) {return 4}
        // Check each field in the citizen object and increment the count if the field is missing
        if (!applicant.citizen.firstname || !applicant.citizen.lastname || !applicant.citizen.displayname) {
            count++; // Treating any missing part of the name as one missing field
        }
        if (!applicant.citizen.shortbio) {count++}
        if (!applicant.citizen.avatar_link) {count++}
        if (!applicant.citizen.liveness_link) {count++}
        return count;
    };

    const hasAllFields = (applicant) => {
        if (!applicant.citizen) return false;
        return applicant.citizen.firstname && 
               applicant.citizen.lastname && 
               applicant.citizen.displayname && 
               applicant.citizen.shortbio && 
               applicant.citizen.avatar_link && 
               applicant.citizen.liveness_link;
    };
      
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

    const handleEndCitizensReached = async () => {
        console.log('handleEndCitizensReached')
        console.log('citizenPageRef', citizenPageRef)
        if (citizenPageRef.current < state.lastPageCitizenss) {
          citizenPageRef.current += 1; // Prepare to fetch the next page
          console.log('citizenPageRef', citizenPageRef)
          await fetchCitizens(); // Fetch the next page of applicants
        } else {
          console.log("No more citizens to fetch.");
        }
    };

    const handleEndPublicReached = async () => {
        console.log('handleEndPublicReached')
        console.log('publicPageRef', publicPageRef)
        if (publicPageRef.current < state.lastPageCitizenss) {
          citizenPageRef.current += 1; // Prepare to fetch the next page
          console.log('citizenPageRef', citizenPageRef)
          await fetchCitizens(); // Fetch the next page of applicants
        } else {
          console.log("No more citizens to fetch.");
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
                
                {/* ///////////APPLICATION BLOCK - JOIN MARS if new, CONTINUE if has application, WELCOME CITIZEN for ciitzens///////// */}
                {userData && (
                    <>
                    {/* ///////CITIZEN BLOCK//////// */}
                    {userData.profile.citizen === 1 ? (
                        <View style={{flex:1, alignItems: 'center', justifyContent:'center', marginTop: 40, marginHorizontal: 20}}>    
                            {/* <View style={styles.citizenID}>
                                <Image
                                    source={state.imageLoadErrors[userData.citizen.id] ? require('../../img/genericprofile.png') : !userData.citizen.avatar_link? require('../../img/genericprofile.png'):{ uri: userData.citizen.avatar_link }}
                                    style={[styles.citizenImageID,{marginLeft: 20}]} 
                                    onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: userData.citizen.id} })}
                                />
                                
                                
                                <View style={styles.citizenItemID}>
                                    <View style={{borderColor: '#EEE9E4', borderWidth: 1, borderRadius: 8, padding: 8, alignItems: 'center', justifyContent:'center', marginBottom: 10}}>
                                        <Text style={[styles.noWalletText, { fontSize: 20, letterSpacing: 2, fontWeight:'800', color: 'white' }]}>CITIZEN ID</Text>
                                    </View>
                                    <View style={{ marginHorizontal: 15, width: windowWidth * 0.45 }}>
                                        <Text numberOfLines={1} style={[styles.citizenName, {lineHeight:26}]}>{userData.citizen.firstname} </Text>
                                        <Text numberOfLines={1} style={[styles.citizenName, {lineHeight:26}]}>{userData.citizen.lastname}</Text>
                                        <Text numberOfLines={1} style={[styles.citizenAddress, {fontSize:10}]}>Address: {userData.citizen.public_address.slice(0,9)}</Text>
                                      
                                        <Text numberOfLines={1} style={[styles.citizenAddress, {fontSize:10}]}>Citizen since: {new Date(userData.citizen.created_at).toLocaleDateString()}</Text>
                                        
                                    </View>
                                </View>
                            </View>   */}
                                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                                    <TouchableOpacity 
                                        style={[styles.joinButton]}
                                        onPress={() => navigation.navigate('CivicIDScreen', {user: userData})}
                                    >
                                        <Text style={[styles.noWalletText, {paddingHorizontal: 8}]}>OPEN CIVIC ID</Text>
                                    </TouchableOpacity>
                                </LinearGradient>
                                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={[styles.joinButtonGradient, {marginTop: 20}]}>
                                    <TouchableOpacity 
                                        style={[styles.joinButton]}
                                        onPress={() => navigation.navigate('ForumScreen')}
                                    >
                                        <Text style={styles.noWalletText}>CITIZEN FORUM</Text>
                                    </TouchableOpacity>
                                </LinearGradient>

                        </View>
                    /* ///////NEWCOMMERS//////// */
                    ) : userData.profile.has_application === 0 ? (
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
                    ) : (
                    /* ///////CONTINUE APPLICATION//////// */    
                        <View style={{flex:1, alignItems: 'center', justifyContent:'center', marginTop: 40}}>    
                            <View style={styles.noWallet}>
                                <Text style={[styles.noWalletText, {marginBottom: 15}]}>CONTINUE YOUR APPLICATION TO JOIN THE GENERAL MARTIAN PUBLIC</Text>
                                <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                                    <TouchableOpacity 
                                        style={[styles.joinButton]}
                                        onPress={() => navigation.navigate('JoinGeneralPublicApplicationScreen')}
                                    >
                                        <Text style={styles.noWalletText}>CONTINUE</Text>
                                    </TouchableOpacity>
                                </LinearGradient>
                            </View>  
                        </View>
                    )}
                    </>
                )}

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
                        {state.citizens.data && 
                        <FlatList
                            key={'citizens-list'}
                            data={state.citizens.data}
                            extradata={state.citizens.data}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    key={item.userid} 
                                    style={styles.citizenItem}
                                    onPress={() => navigation.navigate('IndividualCitizenScreen',{person: item})}
                                >
                                    <Image
                                        source={state.imageLoadErrors[item.id] ? require('../../img/genericprofile.png') : !item.user.citizen.avatar_link ? require('../../img/genericprofile.png'):{ uri: item.user.citizen.avatar_link }}
                                        style={styles.citizenImage} 
                                        onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: citizen.id } })}
                                    />
                                    <View style={{ marginHorizontal: 5, width: windowWidth * 0.45 }}>
                                        <Text numberOfLines={2} style={styles.citizenName}>{item.user.fullname}</Text>
                                        <Text numberOfLines={1} style={styles.citizenAddress}>Address: {item.address.slice(0,9)}</Text>
                                        <Text numberOfLines={1} style={styles.citizenDate}>Citizen since: {new Date(item.mined).toLocaleDateString()}</Text>
                                    </View>
                                    {item.user.profile.endorse_cnt && 
                                        <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'center' }}>
                                            <Text numberOfLines={1} style={styles.endorsTxt1}>ENDORSEMENTS</Text>
                                            <Text style={[styles.citizenName, {fontSize: 22, marginTop:5}]}>{item.user.profile.endorse_cnt}</Text>
                                        </View>
                                    }
                                    {!item.user.profile.endorse_cnt && 
                                        <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'space-evenly' }}>
                                            <Text numberOfLines={1} style={[styles.endorsTxt1, {marginBottom: 8}]}>FOUNDER</Text>
                                            <Icon name="medal" type="material-community" color="#FF7400" />
                                        </View>
                                    }
                                </TouchableOpacity>
                            )}
                            keyExtractor={(item) => item.userid.toString()} // Use userid as the key
                            onEndReached={handleEndCitizensReached}
                            onEndReachedThreshold={0.5} 
                            scrollEnabled={false}
                        />
                        }
                    </View>
                }

                {state.filterPublic &&
                    <View style={styles.citizensContainer}>
                        {state.generalPublic.data &&  
                        <FlatList
                            key={'public-list'}
                            data={state.generalPublic.data}
                            extradata={state.generalPublic.data}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={[styles.citizenItem, {justifyContent:'flex-start'}]}
                                    //onPress={() => navigation.navigate('IndividualPublicScreen',{person: item})}
                                    onPress={() => navigation.navigate('IndividualCitizenScreen',{person: item})}
                                >
                                    <Image    
                                        source={state.imageLoadErrors[item.id] ? require('../../img/genericprofile.png') : { uri: item.profile_image }}
                                        style={styles.citizenImage} 
                                        onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: item.id } })}
                                    />
                                    <View style={{ marginHorizontal: 5, width: windowWidth * 0.45 }}>
                                        <Text numberOfLines={2} style={styles.citizenName}>{item.user.fullname}</Text>
                                        <Text numberOfLines={1} style={styles.citizenAddress}>Address: {item.address.slice(0,9)}</Text>
                                        <Text numberOfLines={1} style={styles.citizenDate}>Joined: {new Date(item.created_at).toLocaleDateString()}</Text>
                                    </View>
                                    {item.user.profile.citizen === 0 &&  ////if user is a citizen - show ENDORSE button
                                    <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'center' }}>
                                        <View style ={styles.endorseButton}>
                                            <Text style={styles.endorsTxt}>ENDORSE</Text>
                                        </View>
                                    
                                        <Text style={[styles.citizenName, {fontSize: 20, marginTop: 10}]}>{item.user.profile.endorse_cnt}</Text>
                                    </View>}
                                    {item.user.profile.citizen === 1 && ////if user is not a citizen - show checkbox
                                    <View style={{ marginHorizontal: 10, width: windowWidth * 0.20, alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon name="check-circle" type="material-community" color="#FF7400" />
                                    </View>}
                                </TouchableOpacity>
                            )}
                            keyExtractor={(item) => item.userid.toString()} // Use userid as the key
                            onEndReached={handleEndPublicReached}
                            onEndReachedThreshold={0.5} 
                            scrollEnabled={false}
                        />
                        }
                    </View>
                } 

                {state.filterApplicants &&
                    <View style={styles.citizensContainer}>
                        <FlatList
                            key={'applicants-list'}
                            data={state.applicants.data}
                            extraData={state.applicants.data}
                            renderItem={({ item }) => {
                                const missingFields = getMissingFields(item);
                                const allFieldsPresent = hasAllFields(item);
                                return (
                                    <TouchableOpacity 
                                        key={item.userid} 
                                        style={styles.citizenItem}
                                        //onPress={() => navigation.navigate('IndividualApplicantScreen',{person: item})}
                                        onPress={() => navigation.navigate('IndividualCitizenScreen',{person: item})}
                                    >
                                        <View style={{ flex: 1, flexDirection: 'row' }}>
                                            <View style={{justifyContent: 'center', width: '56%', marginLeft: 10 }}>
                                                <Text numberOfLines={2} style={styles.citizenName}>{item.fullname}</Text>
                                                {item.citizen && item.citizen.public_address &&  <Text numberOfLines={2} style={styles.citizenAddress}>Address: {item.citizen.public_address.slice(0,9)}</Text>}
                                                {item.citizen && item.citizen.updated_at && <Text numberOfLines={2} style={styles.citizenAddress}>Last update: {new Date(item.citizen.updated_at).toLocaleDateString()}</Text>}
                                            </View>
                                            <View style={{ alignItems: 'flex-start', marginLeft: 5 }}>
                                                {["name", "shortbio", "avatar_link", "liveness_link"].map((field, index) => (
                                                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                                                        <View style={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: 3,
                                                            backgroundColor: missingFields.has(field) ? 'white' : '#67FC58',
                                                        }}/>
                                                        <Text numberOfLines={1} style={[styles.missingFieldsText, { marginLeft: 5 }]}>
                                                            {field.charAt(0).toUpperCase() + field.slice(1).replace("_link", "").replace("_", " ")}
                                                        </Text>
                                                    </View>
                                                ))}
                                            </View>
                                            {allFieldsPresent && (
                                                    <TouchableOpacity 
                                                        style={styles.completeButton}
                                                        onPress={() => navigation.navigate('SendWithAddress',{address: item.address, name: item.fullname})}
                                                    >
                                                        <Text style={styles.donateText}>
                                                            DONATE
                                                        </Text>
                                                        <Image style={styles.marscoinStyle} source={require('../../img/marscoin.png')} accessible={false} />
                                                    </TouchableOpacity>
                                                )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            keyExtractor={(item) => item.userid.toString()}
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
    marscoinStyle: {
        width: 33,
        maxHeight: 33,
        marginTop: 3
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
        padding:30,
        marginBottom: 30,
    },
    citizenID: {
        height: 170,
        flexDirection:'row',
        width: windowWidth * 0.9,
        borderRadius: 20,
        //borderColor: '#FF7400',
        backgroundColor: '#684526',
        marginHorizontal: 20,
        alignItems:'center',
        justifyContent: 'center', 
        padding:30,
        shadowColor: "#000",
                  shadowOffset: {
                    width: 0,
                    height: 3,
                  },
                  shadowOpacity: 0.35,
                  shadowRadius: 3.65,
                  elevation: 8,
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
      },
    citizenItem: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 0.3,
        borderColor: '#FF7400',
        padding: 10,
        width: windowWidth,
    },
    citizenItemID: {
        alignItems: 'center',
        padding: 10,
    },
    citizenImage: {
        width: windowWidth * 0.19,
        height: windowWidth * 0.19,
        marginHorizontal: 5,
        borderRadius: 10
    },
    citizenImageID: {
        width: windowWidth * 0.25,
        height: windowWidth * 0.25,
        borderRadius: 10
    },
    citizenAddress: {
        fontSize: 12,
        color: '#FFF',
        marginTop: 5,
        fontFamily: 'Orbitron-Regular',
        letterSpacing: 1.2,
    },
    missingFieldsText: {
        fontSize: 10,
        color: '#FFF',
        marginTop: 3,
        fontFamily: 'Orbitron-Regular',
    },
    donateText: {
        fontSize: 9,
        color: '#FFF',
        fontFamily: 'Orbitron-Black',
    },
    citizenDate: {
        fontSize: 12,
        color: '#AAA',
        marginTop: 5,
        fontFamily: 'Orbitron-Regular',
    },
    citizenName: {
        fontSize: 18,
        color:  '#FF7400',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
        letterSpacing: 1.1, 
    },
    endorsTxt1: {
        fontSize: 8,
        color:  '#FF7400',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
    },
    endorsTxt: {
        fontSize: 8.5,
        color:'white',
        fontFamily: 'Orbitron-Regular',
        fontWeight:"500",
    },
    endorseButton: {
        borderColor:  '#FF7400',
        borderWidth: 1,
        borderRadius: 10,
        backgroundColor:'#FF7400',
        paddingHorizontal: 10,
        paddingVertical: 5,
        alignItems: 'center',
        justifyContent: 'center'
    },
    completeButton: {
        height: 60,
        alignSelf:'center',
        alignItems:'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 16,
        marginLeft: 20,  // Push the button to the far right
    },
});

export default CitizenScreen;
