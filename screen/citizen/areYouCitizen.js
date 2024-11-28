import React, { useRef, useState} from 'react';
import { ScrollView, Platform,Modal, ActivityIndicator, Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';
import { BlueText, BlueSpacing20, BluePrivateBalance } from '../../BlueComponents';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckBox } from 'react-native-elements';
import { color } from 'react-native-elements/dist/helpers';

const AreYouCitizenScreen = () => {
    const navigation = useNavigation();  
    const { colors } = useTheme();
    const route = useRoute();
    const imageLoadError = useRef({});
    const [initialChoice, setInitialChoice] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);

    const handleAcceptance = () => {
        if (termsAccepted) {
            // Navigate based on the user's initial choice
            navigation.navigate(initialChoice);
        } else {
            alert('Please accept the terms of service to continue.');
        }
        setModalVisible(false);
    };

    return (
        <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.root}>
                <Image style={styles.imageLG} source={require('../../img/mars1.png')} />
                <View style={styles.center}>
                    <Text style={styles.welcomeText}>Welcome to </Text>
                    <Image style={styles.iconStyle} source={require('../../img/icon.png')} accessible={false} />
                </View>
                <Text style={styles.smallText}>MARTIAN CONGRESSIONAL REPUBLIC</Text>
                <View style={{ flex: 1 }}>
                    <Text style={styles.largeText}>HAVE YOU PREVIOUSLY SET UP A CIVIC WALLET?</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                            <TouchableOpacity
                                onPress={() => {
                                    //setInitialChoice('ImportCivicWalletScreen');
                                    navigation.navigate('ImportCivicWalletScreen');
                                    //setModalVisible(true);
                                }}
                                style={[styles.joinButton]}
                            >
                                <Text style={styles.buttonText}>YES</Text>
                            </TouchableOpacity>
                        </LinearGradient>    
                        <LinearGradient colors={['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
                        <TouchableOpacity
                            onPress={() => {
                                //setInitialChoice('WalletsCivicAdd');
                                navigation.navigate('WalletsCivicAdd');
                                //setModalVisible(true);
                            }}
                            style={[styles.joinButton]}
                        >
                            <Text style={styles.buttonText}>NO</Text>
                        </TouchableOpacity>
                        </LinearGradient>
                    </View>
                </View>

                {/* //////Terms of Service ////// */}
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={modalVisible}
                    onRequestClose={() => {
                        Alert.alert("Modal has been closed.");
                        setModalVisible(!modalVisible);
                    }}
                >
                    <View style={styles.modalView}>
                        <ScrollView style={{ minHeight: 200 }}>
                            <Text style={styles.header}>Terms of Service</Text>
                            <Text style={styles.header}>Introduction</Text>
                            <Text style={styles.tosText}>Welcome to the Martian Congressional Republic, an innovative decentralized blockchain-based governance system and its reference implementation. By visiting, accessing, or using our services, you consent to the policies and practices described in these terms and contiditions, so please review them thoroughly. Should you find any policies or practices described here unacceptable, please refrain from using our services. References to "we", "us", or "our" in this Privacy Policy refer to the Marscoin Foundation, Inc. (Non-Profit) and any of its affiliates.</Text>
                            <Text style={styles.header}>Preliminary Notice</Text>
                            <Text style={[styles.header, {color: "white"}]}>PLEASE READ AND ACCEPT THESE TERMS OF SERVICE ("TERMS") CAREFULLY BEFORE USING THE SERVICES.</Text>
                            <Text style={styles.header}>1. Acceptance of Terms</Text>
                            <Text style={styles.tosText}>By accessing or using the Martian Republic website, mobile application, wallet services, and any other features, content, or applications offered by The Marscoin Foundation, Inc. and its affiliates (collectively, the "Services"), whether as a guest or registered user, you agree to be bound by these Terms of Service. These Terms constitute a legally binding agreement between you and The Marscoin Foundation, Inc. ("Company," "we," "us," or "our").</Text>
                            <Text style={styles.header}>2. Service Description and Eligibility</Text>
                            <Text style={styles.tosText}>2.1. The Services provide a decentralized platform for blockchain-based community engagement, cryptocurrency wallet functionality, and Mars-focused governance participation through both web and mobile interfaces. 2.2. You must be at least thirteen (13) years of age to use the Services. If you are under 18 years of age, you may only use the Services under the supervision of a parent or legal guardian who agrees to be bound by these Terms. 2.3. When registering for the Services, you agree to provide accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</Text>
                            <Text style={styles.header}>3. Cryptocurrency Wallet Services</Text>
                            <Text style={styles.tosText}>3.1. Non-Custodial Nature. The Services include non-custodial wallet functionality. You expressly acknowledge and agree that: a) We do not store, send, or receive Marscoin or other digital assets; b) All transactions occur on the Marscoin blockchain, which is not controlled by us; c) We do not have access to your private keys or seed phrases; d) We cannot recover or reset your seed phrase under any circumstances.</Text>
                            <Text style={styles.header}>4. User-Generated Content</Text>
                            <Text style={styles.tosText}>4.1. "User Content" means any content, materials, or information that users submit, post, or transmit through the Services, including but not limited to profile information, comments, discussions, proposals, votes, images, media, and other communications or submissions. 4.2. By submitting User Content, you grant Company a worldwide, non-exclusive, royalty-free, perpetual, irrevocable, and fully sublicensable right to use, reproduce, modify, adapt, publish, translate, create derivative works from, distribute, and display such User Content in any media format.</Text>
                            <Text style={styles.header}>5. Content Moderation and Enforcement</Text>
                            <Text style={styles.tosText}>5.1. Company maintains the right to monitor User Content, remove or refuse any User Content, restrict or terminate access to the Services, and disclose user information when required by law. 5.2. The Services provide mechanisms for users to flag inappropriate content, block, and report violations of these Terms. 5.3. Company commits to reviewing reported content within twenty-four (24) hours of receipt and taking appropriate action.</Text>
                            <Text style={styles.header}>6. Public Nature of Blockchain Data</Text>
                            <Text style={styles.tosText}>6.1. You acknowledge and agree that all blockchain transactions are public, User Content posted through the Services is publicly accessible, and no expectation of privacy exists for on-chain activities. 6.2. You understand that blockchain transactions are permanent and cannot be deleted, public content may be indexed by search engines, and content may persist even after account deletion.</Text>
                            <Text style={styles.header}>7. Limitation of Liability</Text>
                            <Text style={styles.tosText}>7.1. THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED. 7.2. Company is not responsible for lost or stolen cryptocurrency, unauthorized wallet access, user error in transactions, network fees or delays, or any financial losses incurred through use of the Services.</Text>
                            <Text style={styles.header}>8. Intellectual Property Rights</Text>
                            <Text style={styles.tosText}>8.1. The Services and all associated intellectual property rights are owned exclusively by Company or its licensors and are protected by copyright, trademark, patent, trade secret, and other intellectual property laws. 8.2. Subject to your compliance with these Terms, Company grants you a limited, non-exclusive, non-transferable, non-sublicensable license to access and use the Services for their intended purpose.</Text>
                            <Text style={styles.header}>9. Termination and Account Deletion</Text>
                            <Text style={styles.tosText}>9.1. Company may terminate or suspend your access to the Services immediately upon breach of these Terms, for any conduct deemed harmful to other users, for illegal activities, or for any reason at Company's sole discretion. 9.2. You may request account deletion at any time through the Services. 9.3. Upon termination or account deletion, your right to access the Services will cease immediately, though public blockchain data and transactions will remain permanent.</Text>
                            <Text style={styles.header}>10. Dispute Resolution</Text>
                            <Text style={styles.tosText}>10.1. Prior to initiating formal proceedings, users agree to attempt good faith negotiations and provide written notice of disputes. 10.2. Any dispute not resolved informally shall be resolved through binding arbitration conducted by JAMS in San Francisco, California.</Text>
                            <Text style={styles.header}>11. Governing Law</Text>
                            <Text style={styles.tosText}>11.1. These Terms shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions.</Text>
                            <Text style={styles.header}>12. Modifications to Terms</Text>
                            <Text style={styles.tosText}>12.1. Company reserves the right to modify these Terms at any time, for any reason, without prior notice, at its sole discretion. 12.2. Material changes will be notified through the Services, and continued use constitutes acceptance of modified Terms.</Text>
                            <Text style={styles.header}>13. Prohibited Conduct</Text>
                            <Text style={styles.tosText}>13.1. Objectionable Content: You agree not to use the Services to create, upload, transmit, distribute, or store any content that is unlawful, offensive, defamatory, libelous, harassing, invasive of privacy, abusive, threatening, harmful, vulgar, obscene, or otherwise objectionable. This includes, but is not limited to, content that promotes racism, bigotry, hatred, or physical harm of any kind against any group or individual. 13.2. Abusive Behavior: Engaging in abusive or disruptive behavior is strictly prohibited. This includes: Harassing, stalking, or threatening other users; Participating in or promoting any activities that interrupt or attempt to interrupt the operation of the Services; Using the Services to send unauthorized advertising or communications. 13.3. Enforcement: We reserve the right to take appropriate action against any user for any unauthorized use of the Services, including civil, criminal, and injunctive redress and the termination of any user’s use of the Services. Any use of the system and our services that violates these terms may result in, among other things, termination or suspension of your rights to use the Services. 13.4. Reporting: If you encounter any objectionable content or abusive behavior while using the Services, please report it to us immediately at support@martianrepublic.org.</Text>
                            <Text style={styles.header}>14. Contact Information</Text>
                            <Text style={styles.tosText}>For support: support@martianrepublic.org</Text>
                            <Text style={styles.tosText}>For legal notices: legal@martianrepublic.org</Text>
                        </ScrollView>
                        <View style={styles.checkboxContainer}>
                            <CheckBox
                                checked={termsAccepted}
                                onPress={() => setTermsAccepted(!termsAccepted)}  
                                checkedColor='#FF8A3E'
                                uncheckedColor='#FFB67D'
                                containerStyle={styles.checkbox}  
                            />
                            <Text style={styles.label} onPress={() => setTermsAccepted(!termsAccepted)}>I accept the terms of service</Text>
                        </View>
                        <LinearGradient colors={termsAccepted ? ['#FFB67D','#FF8A3E', '#FF7400'] : ['#ccc', '#bbb', '#aaa']} style={[styles.joinButtonGradient, {marginBottom: 40}]}>
                            <TouchableOpacity
                                disabled={!termsAccepted}  // Disable button when terms are not accepted
                                style={[styles.joinButton, {width: 200, opacity: termsAccepted ? 1 : 0.5}]}  // Conditional opacity for disabled state
                                onPress={handleAcceptance}
                            >
                                <Text style={styles.buttonText}>Continue</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </View>
                </Modal>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    root: {
        flex:1,
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
        fontWeight:'600',
        fontFamily: 'Orbitron-Bold',
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
    modalView: {
        marginTop: 70,
        flex: 1,
        backgroundColor: "black",
        borderRadius: 20,
        padding: 20,
        alignItems: "center",
    },
    checkboxContainer: {
        flexDirection: "row",
        marginBottom: 6,
    },
    checkbox: {
        alignSelf: "center",
    },
    label: {
        color: '#FF8A3E',
        fontFamily: 'Orbitron-Black',
        alignSelf: "center",
        fontSize: 12
    },
    header: {
        color: '#FF8A3E', 
        marginVertical: 5,
        fontSize: 12,
        fontFamily: 'Orbitron-Black',
        letterSpacing: 1.5, 
    },
    tosText: {
        color:'white', 
        fontSize: 9,
    },

    
});

export default AreYouCitizenScreen;
