import React, { useRef} from 'react';
import { ScrollView, Platform,ActivityIndicator, Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';
import { BlueText, BlueSpacing20, BluePrivateBalance } from '../../BlueComponents';
import { SafeAreaView } from 'react-native-safe-area-context';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const AreYouCitizenScreen = () => {
    const navigation = useNavigation();  
    const { colors } = useTheme();
    const route = useRoute();
    const imageLoadError = useRef({});

    const styles = StyleSheet.create({
        root: {
            flex:1,
            //backgroundColor:'red',
        },
        imageLG: {
            position: 'absolute', // changed from 'relative' to 'absolute'
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: '60%',
            zIndex: -1,
            resizeMode:'stretch'
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
        largeText: {
            color:'white', 
            textAlign: 'center',
            justifyContent:'center',
            fontSize: 40,
            fontWeight:'800',
            fontFamily: 'Orbitron-SemiBold',
            letterSpacing: 1.5, 
            marginHorizontal: 30,
            marginVertical: 60,
            letterSpacing: 3
        },
        iconStyle: {
            width:80,
            maxHeight: 80,
            marginTop: 30,
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
            width: 100,
            borderRadius: 20,
            marginHorizontal: 20,
            justifyContent:'center',
        },
        joinButtonGradient: {
            height: 60,
            borderRadius: 20,
            marginHorizontal: 20,
        },
        noWalletText: {
            color:'white', 
            textAlign: 'center',
            fontSize: 22,
            fontWeight:"900",
            fontFamily: 'Orbitron-Regular',
            letterSpacing: 1.1, 
        },
    });

    
  return (
    <SafeAreaView style={{flex: 1}}> 
        <View style={styles.root}>    
        <Image style={styles.imageLG} source={require('../../img/mars1.png')} />
            <View style={styles.center}>
                <Text style={styles.welcomeText}>Welcome to  </Text>
                <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
            </View>
            <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
            
            <View style={{ flex: 1,}}>
                <Text style={styles.largeText}>ARE YOU ALREADY A MCR CITIZEN?</Text>
                <View style={{flexDirection: 'row', alignItems:'center', justifyContent:'center' }}>
                    <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                        <TouchableOpacity 
                            style={[styles.joinButton]}
                            onPress={() => navigation.navigate('ImportCivicWalletScreen')}
                        >
                            <Text style={styles.noWalletText}>YES</Text>
                        </TouchableOpacity>
                    </LinearGradient>

                    <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                        <TouchableOpacity 
                            style={[styles.joinButton]}
                            onPress={() => navigation.navigate('WalletsCivicAdd')}
                        >
                            <Text style={styles.noWalletText}>NO</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </View>

            
        </View>
   
    </SafeAreaView>
  );
};


export default AreYouCitizenScreen;
