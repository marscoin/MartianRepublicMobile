import React, { useRef, useState, useEffect, useContext} from 'react';
import { ScrollView, Platform, Keyboard, TouchableWithoutFeedback, Dimensions, Image, StyleSheet, View, Text, TouchableOpacity, I18nManager, FlatList, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import navigationStyle from '../../components/navigationStyle';
import { useTheme } from '../../components/themes';
import {
    BlueButtonLink,
    BlueDoneAndDismissKeyboardInputAccessory,
    BlueFormLabel,
    BlueFormMultiInput,
    BlueSpacing20,
    BlueText,
  } from '../../BlueComponents';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import { requestCameraAuthorization } from '../../helpers/scan-qr';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';
import usePrivacy from '../../hooks/usePrivacy';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

const ImportCivicWalletScreen = () => {
    const navigation = useNavigation();  
    const { colors } = useTheme();
    const route = useRoute();
    const imageLoadError = useRef({});
    const label = route?.params?.label ?? '';
    const triggerImport = route?.params?.triggerImport ?? false;
    const { isAdvancedModeEnabled } = useContext(BlueStorageContext);
    const [importText, setImportText] = useState(label);
    const [isToolbarVisibleForAndroid, setIsToolbarVisibleForAndroid] = useState(false);
    const [, setSpeedBackdoor] = useState(0);
    const [isAdvancedModeEnabledRender, setIsAdvancedModeEnabledRender] = useState(false);
    const [searchAccounts, setSearchAccounts] = useState(false);
    const [askPassphrase, setAskPassphrase] = useState(false);
    const { enableBlur, disableBlur } = usePrivacy();
    const styles = StyleSheet.create({
        root: {
            flex:1,
            marginTop: 30
        },
        center: {
            flex: 1,
            marginHorizontal: 16,
            backgroundColor: colors.elevated,
          },
          row: {
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 16,
            marginTop: 10,
            justifyContent: 'space-between',
          },
        largeText: {
            color:'white', 
            textAlign: 'center',
            justifyContent:'center',
            fontSize: 20,
            fontWeight:'800',
            fontFamily: 'Orbitron-SemiBold',
            letterSpacing: 1.5, 
            marginHorizontal: 30,
            letterSpacing: 3
        },
        smallText: {
            color: colors.foregroundColor,
            fontWeight: '400',
            fontSize: 16,
            fontFamily: 'Orbitron-Regular', 
            marginHorizontal: 60,
            textAlign:'center',
            writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
        },
        buttonText: {
            color:'white', 
            textAlign: 'center',
            fontSize: 12,
            fontFamily: 'Orbitron-Regular',
            letterSpacing: 1.5, 
            textAlign:'center'
        },
        backButton: {
            height: 60,
            width: 100,
            borderRadius: 20,
            marginHorizontal: 20,
            marginTop: 10,
            justifyContent:'center',
            alignSelf:'center'
        },
        joinButtonGradient: {
            height: 60,
            borderRadius: 20,
            marginHorizontal: 20,
        },
        imageLG: {
            position: 'absolute', // changed from 'relative' to 'absolute'
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: -1,
            resizeMode: 'stretch'
        },
    });

    const importButtonPressed = () => {
        console.log('Import pressed')
        const textToImport = onBlur();
        if (textToImport.trim().length === 0) {
          return;
        }
        importMnemonic(textToImport);
    };
    
    const importMnemonic = text => {
        navigation.navigate('ImportCivicWalletDiscovery', { importText: text, askPassphrase, searchAccounts });
    };
    
    const onBarScanned = value => {
        if (value && value.data) value = value.data + ''; // no objects here, only strings
        setImportText(value);
        setTimeout(() => importMnemonic(value), 500);
    };
    
    const importScan = () => {
        console.log('Import scan pressed')
        requestCameraAuthorization().then(() =>
          navigation.navigate( 
            'ScanQRCode',
           {
              launchedBy: route.name,
              onBarScanned,
              showFileImportButton: true,
            },
          ),
        );
    };
      
    const speedBackdoorTap = () => {
        setSpeedBackdoor(v => {
          v += 1;
          if (v < 5) return v;
          navigation.navigate('ImportSpeed');
          return 0;
        });
      };
    const onBlur = () => {
        const valueWithSingleWhitespace = importText.replace(/^\s+|\s+$|\s+(?=\s)/g, '');
        setImportText(valueWithSingleWhitespace);
        return valueWithSingleWhitespace;
    };
    const renderOptionsAndImportButton = (
        <>
          {isAdvancedModeEnabledRender && (
            <>
              <View style={styles.row}>
                <BlueText>{loc.wallets.import_passphrase}</BlueText>
                <Switch testID="AskPassphrase" value={askPassphrase} onValueChange={setAskPassphrase} />
              </View>
              <View style={styles.row}>
                <BlueText>{loc.wallets.import_search_accounts}</BlueText>
                <Switch testID="SearchAccounts" value={searchAccounts} onValueChange={setSearchAccounts} />
              </View>
            </>
          )}
    
          <BlueSpacing20 />
          <View style={styles.center}>
            <>
            {/* //////IMPORT BUTTON////// */}
              <Button
                disabled={importText.trim().length === 0}
                title={loc.wallets.import_do_import}
                testID="DoImport"
                onPress={importButtonPressed}
              />
              <BlueSpacing20 />
              {/* //////SCAN BUTTON////// */}
              <BlueButtonLink title={'Scan civic private key'} onPress={importScan} testID="ScanImport" />
            </>
          </View>
        </>
      );  
    useEffect(() => {
        enableBlur();
        Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setIsToolbarVisibleForAndroid(true));
        Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setIsToolbarVisibleForAndroid(false));
        return () => {
          Keyboard.removeAllListeners(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow');
          Keyboard.removeAllListeners(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide');
          disableBlur();
        };
      }, [disableBlur, enableBlur]);
    
      useEffect(() => {
        isAdvancedModeEnabled().then(setIsAdvancedModeEnabledRender);
        if (triggerImport) importButtonPressed();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      useEffect(() => {
        console.log('ImportText', importText)
      }, [importText]);

  return (
    <SafeAreaView style={{flex: 1}}> 
    {/* ////margin -80 sticks screen to the tabbar///// */}
        <Image style={styles.imageLG} source={require('../../img/dashboard_bg1.png')} />
        <ScrollView 
            style={styles.root}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 0 }}
        >
        <View style={styles.root}>    
            <Text style={styles.largeText}>Let's import your</Text>
            <Text style={[styles.largeText, {color: '#FF7400'}]}>CIVIC WALLET</Text>
            <Text style={[styles.largeText, {fontSize: 10}]}>(proof of citizenship)</Text>
            <BlueSpacing20 />
            <TouchableWithoutFeedback accessibilityRole="button" onPress={speedBackdoorTap} testID="SpeedBackdoor">
                <Text style ={styles.smallText}>
                     Please enter secret seed phrase of your Civic Marscoin Wallet.
                </Text>
            </TouchableWithoutFeedback>
            <BlueSpacing20 />
            <BlueFormMultiInput
                value={importText}
                onBlur={onBlur}
                onChangeText={setImportText}
                testID="MnemonicInput"
                inputAccessoryViewID={BlueDoneAndDismissKeyboardInputAccessory.InputAccessoryViewID}
             />
             {Platform.select({ android: !isToolbarVisibleForAndroid && renderOptionsAndImportButton, default: renderOptionsAndImportButton })}
            {/* {Platform.select({
                ios: (
                <BlueDoneAndDismissKeyboardInputAccessory
                    onClearTapped={() => {
                    setImportText('');
                    }}
                    onPasteTapped={text => {
                    setImportText(text);
                    Keyboard.dismiss();
                    }}
                />
                ),
                android: isToolbarVisibleForAndroid && (
                <BlueDoneAndDismissKeyboardInputAccessory
                    onClearTapped={() => {
                    setImportText('');
                    Keyboard.dismiss();
                    }}
                    onPasteTapped={text => {
                    setImportText(text);
                    Keyboard.dismiss();
                    }}
                />
                )
            })} */}
            <TouchableOpacity 
                style={[styles.backButton]}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.buttonText}>back</Text>
            </TouchableOpacity>
        </View>
        </ScrollView>
    </SafeAreaView>

  );
};

ImportCivicWalletScreen.navigationOptions = navigationStyle({}, opts => ({ ...opts, title: loc.wallets.import_title }));

export default ImportCivicWalletScreen;
