import React, { useEffect, useState, useContext , useRef} from 'react';
import { ScrollView, Platform, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList } from 'react-native';
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
import axios from 'axios';


const CitizenScreen = () => {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const { wallets } = useContext(BlueStorageContext);
    const citizenPageRef = useRef(0);
    const publicPageRef = useRef(0);
    const applicantPageRef = useRef(0);
    const [citizens, setCitizens] = useState([]);
    const [generalPublic, setGeneralPublic] = useState([]);
    const [applicants, setApplicants] = useState([]);
    const [filterCitizen, setFilterCitizen] = useState(true);
    const [filterPublic, setFilterPublic] = useState(false);
    const [filterApplicants, setFilterApplicants] = useState(false);
    //console.log('wallets', wallets)
    const route = useRoute();
    
    const styles = StyleSheet.create({
        root: {
            paddingTop: 10,
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
        imageLG: {
            width: '100%',
            height: 100,
            marginTop: 0
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
        filterButton: {
            height: 24,
            borderRadius: 10,
            //marginHorizontal: 20,
            justifyContent:'center',
            alignItems:'center',
            padding: 5
        },
        // filterButtonGradient: {
        //     height: 24,
        //     borderRadius: 10,
        //     marginHorizontal: 20,
        // },
        filterButtonText: {
            color:'white', 
            fontSize: 10,
            fontWeight:"400",
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
            borderColor: '#FF7400',
            padding: 10
        }
    });

    // const renderWalletItem = ({ item }) => (
    //     <TouchableOpacity
    //     onPress={() => {
    //         // Handle wallet selection if needed
    //     }}
    //     accessibilityRole="button"
    //     >
    //     <View style={styles.itemRoot}>
    //         <LinearGradient colors={WalletGradient.gradientsFor(item.type)} style={styles.gradient}>
    //             <Image
    //             source={(() => {
    //                 switch (item.type) {
    //                 case LightningLdkWallet.type:
    //                 case LightningCustodianWallet.type:
    //                     return I18nManager.isRTL ? require('../../img/lnd-shape-rtl.png') : require('../../img/lnd-shape.png');
    //                 case MultisigHDWallet.type:
    //                     return I18nManager.isRTL ? require('../../img/vault-shape-rtl.png') : require('../../img/vault-shape.png');
    //                 default:
    //                     return I18nManager.isRTL ? require('../../img/btc-shape-rtl.png') : require('../../img/btc-shape.png');
    //                 }
    //             })()}
    //             style={styles.image}
    //             />
    //             <Text style={styles.label}>{item.getLabel()}</Text>
    //             <Text style={styles.balance}>{item.getBalance()} BTC</Text>
    //         </LinearGradient>
    //     </View>
    //     </TouchableOpacity>
    // );

    const fetchGeneralPublic = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/applicant?page=${publicPageRef.current}`)
            const data = {...response.data};
            console.log('GENERAL PUBLIC', data)
            setGeneralPublic(data);   
        } catch (error) {
            console.error(`Error fetching genersal public:`, error);   
        } finally {
        }
    }

    const fetchCitizerns = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/citizen?page=${citizenPageRef.current}`)
            const data = {...response.data};
            console.log('CITIZENS', data)
            setCitizens(data);   
        } catch (error) {
            console.error(`Error fetching citizens:`, error);   
        } finally {
        }
    }

    const fetchApplicants = async () => {
        try {
            const response = await axios.get(`https://martianrepublic.org/api/feed/applicant?page=${applicantPageRef.current}`)
            const data = {...response.data};
            console.log('APLICANTS', data)
            setApplicants(data);   
        } catch (error) {
            console.error(`Error fetching applicants:`, error);   
        } finally {
        }
    }

    useEffect(() => {
        fetchGeneralPublic()
        fetchApplicants()
        fetchCitizerns()
    }, []);
    
  return (
    <SafeArea style={styles.root}>
        <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.center}>
                <Text style={styles.welcomeText}>Welcome to  </Text>
                <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
            </View>
            <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
            
            {/* <View style={{marginVertical: 5}}>
                <FlatList
                    data={wallets}
                    renderItem={renderWalletItem}
                    keyExtractor={(item) => item.getID()}
                    horizontal={true}
                />
            </View> */}

            {/* ///////////JOIN MARS BLOCK///////// */}
            <View style={{flex:1, alignItems: 'center', justifyContent:'center', marginTop: 40}}>    
                <View style={styles.noWallet}>
                    <Text style={[styles.noWalletText, {marginBottom: 15}]}>SUBMIT YOUR APPLICATION TO JOIN GENERAL MARTIAN PUBLIC</Text>
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

            <Image style={styles.imageLG} source={require('../../img/sunrise.png')} />

            {/* ///////////FILTER BLOCK///////// */}
            <View style={styles.filterBlock}>
                <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => {
                        setFilterCitizen(true);
                        setFilterPublic(false);
                        setFilterApplicants(false);
                    }}
                >
                    <LinearGradient
                        colors={filterCitizen ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // Change to grey gradient if inactive
                        style={filterCitizen ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                    >
                        <Text style={styles.filterButtonText}>CITIZENS</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => {
                        setFilterCitizen(false);
                        setFilterPublic(true);
                        setFilterApplicants(false);
                    }}
                >
                    <LinearGradient
                        colors={filterPublic ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // Change to grey gradient if inactive
                        style={filterPublic ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                    >
                        <Text style={styles.filterButtonText}>PUBLIC</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterButton}
                    onPress={() => {
                        setFilterCitizen(false);
                        setFilterPublic(false);
                        setFilterApplicants(true);
                    }}
                >
                    <LinearGradient
                        colors={filterApplicants ? ['#FFB67D', '#FF8A3E', '#FF7400'] : ['#D3D3D3', '#C0C0C0']} // Change to grey gradient if inactive
                        style={filterApplicants ? styles.filterButtonGradientActive : styles.filterButtonGradientInactive}
                    >
                        <Text style={styles.filterButtonText}>APPLICANTS</Text>
                    </LinearGradient>
                </TouchableOpacity>
                </View>
        </ScrollView>
    </SafeArea>
  );
};


export default CitizenScreen;
