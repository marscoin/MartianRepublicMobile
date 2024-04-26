import { DefaultTheme, DarkTheme, useTheme as useThemeBase } from '@react-navigation/native';
import { Appearance } from 'react-native';

export const BlueDefaultTheme = {
  ...DefaultTheme,
  closeImage: require('../img/close-white.png'),
  barStyle: 'light-content',
  scanImage: require('../img/scan-white.png'),
  fonts:{
    regular:{
      fontFamily: 'Orbitron-Regular', 
      color: 'white',
    }
  },
  colors: {
    ...DefaultTheme.colors,
    brandingColor: 'black',
    customHeader: 'black',
    foregroundColor: 'white',////text
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    buttonBackgroundColor: '#FF7400',///orange
    buttonTextColor: 'white',
    buttonAlternativeTextColor: 'white',
    buttonDisabledBackgroundColor: '#2F2D2B',////type of crypto
    buttonDisabledTextColor: 'white',
    inputBorderColor: 'white',
    inputBackgroundColor: '#2F2D2B', //bg of text input
    alternativeTextColor: 'white',
    alternativeTextColor2: 'white',
    buttonBlueBackgroundColor: '#FF7400',///
    incomingBackgroundColor: '#d2f8d6',///
    incomingForegroundColor: '#72A66D',//incoming transactions   #72A66D
    outgoingBackgroundColor: '#f8d2d2',//
    outgoingForegroundColor: '#FF9339',////outgoing transactions
    //successColor: '#2DD881',///green
    successColor: 'white',
    failedColor: '#ff0000',
    shadowColor: '#white',
    inverseForegroundColor: 'black',
    hdborderColor: '#FF7400',
    hdbackgroundColor: '#FF7400',
    lnborderColor: 'white',///
    lnbackgroundColor: '#FFFAEF',////lightning text and border
    background: 'black',
    lightButton: '#2F2D2B', ////add wallet gray area in flatList
    ballReceive: '#d2f8d6',///
    ballOutgoing: '#f8d2d2',///
    lightBorder: 'white',////line between transactions
    ballOutgoingExpired: '#EEF0F4',///
    modal: 'black',
    formBorder: 'white',///orange frame of Qr iand input
    modalButton: '#FF7400',
    darkGray: 'red',///
    scanLabel: '#9AA0AA',///
    feeText: 'white',
    feeLabel: 'white',
    feeValue: '#37c0a1',
    feeActive: '#FF7400',
    labelText: 'white',
    cta2: '#062453',///
    outputValue: '#13244D',
    elevated: 'black',
    mainColor: '#FF7400',
    success: 'white',
    successCheck: '#FF7400',
    msSuccessBG: '#37c0a1',
    msSuccessCheck: 'black',
    newBlue: 'white',///btc border and text
    redBG: '#F8D2D2',
    redText: '#D0021B',
    changeBackground: 'red',
    changeText: 'white',
    receiveBackground: '#D1F9D6',
    receiveText: '#37C0A1',
    navigationBarColor: 'black',
    // brandingColor: '#ffffff',
    // customHeader: '#ffffff',
    // foregroundColor: '#0c2550',
    // borderTopColor: 'rgba(0, 0, 0, 0.1)',
    // buttonBackgroundColor: '#ccddf9',
    // buttonTextColor: '#0c2550',
    // buttonAlternativeTextColor: '#2f5fb3',
    // buttonDisabledBackgroundColor: '#eef0f4',
    // buttonDisabledTextColor: '#9aa0aa',
    // inputBorderColor: '#d2d2d2',
    // inputBackgroundColor: '#f5f5f5',
    // alternativeTextColor: '#9aa0aa',
    // alternativeTextColor2: '#0f5cc0',
    // buttonBlueBackgroundColor: '#ccddf9',
    // incomingBackgroundColor: '#d2f8d6',
    // incomingForegroundColor: '#37c0a1',
    // outgoingBackgroundColor: '#f8d2d2',
    // outgoingForegroundColor: '#d0021b',
    // successColor: '#37c0a1',
    // failedColor: '#ff0000',
    // shadowColor: '#000000',
    // inverseForegroundColor: '#ffffff',
    // hdborderColor: '#68BBE1',
    // hdbackgroundColor: '#ECF9FF',
    // lnborderColor: '#FFB600',
    // lnbackgroundColor: '#FFFAEF',
    // background: '#FFFFFF',
    // lightButton: '#eef0f4',
    // ballReceive: '#d2f8d6',
    // ballOutgoing: '#f8d2d2',
    // lightBorder: '#ededed',
    // ballOutgoingExpired: '#EEF0F4',
    // modal: '#ffffff',
    // formBorder: '#d2d2d2',
    // modalButton: '#ccddf9',
    // darkGray: '#9AA0AA',
    // scanLabel: '#9AA0AA',
    // feeText: '#81868e',
    // feeLabel: '#d2f8d6',
    // feeValue: '#37c0a1',
    // feeActive: '#d2f8d6',
    // labelText: '#81868e',
    // cta2: '#062453',
    // outputValue: '#13244D',
    // elevated: '#ffffff',
    // mainColor: '#CFDCF6',
    // success: '#ccddf9',
    // successCheck: '#0f5cc0',
    // msSuccessBG: '#37c0a1',
    // msSuccessCheck: '#ffffff',
    // newBlue: '#007AFF',
    // redBG: '#F8D2D2',
    // redText: '#D0021B',
    // changeBackground: '#FDF2DA',
    // changeText: '#F38C47',
    // receiveBackground: '#D1F9D6',
    // receiveText: '#37C0A1',
    // navigationBarColor: '#FFFFFF',
  },
};

export type Theme = typeof BlueDefaultTheme;

export const BlueDarkTheme: Theme = {
  ...DarkTheme,
  fonts:{
    regular:{
      fontFamily: 'Orbitron-Regular', 
      color: 'white',
    }
  },
  closeImage: require('../img/close-white.png'),
  scanImage: require('../img/scan-white.png'),
  barStyle: 'light-content',
  colors: {
    ...BlueDefaultTheme.colors,
    ...DarkTheme.colors,
    brandingColor: 'black',
    customHeader: 'black',
    foregroundColor: 'white',////text
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    buttonBackgroundColor: '#FF7400',///orange
    buttonTextColor: 'white',
    buttonAlternativeTextColor: 'white',
    buttonDisabledBackgroundColor: '#2F2D2B',////type of crypto
    buttonDisabledTextColor: 'white',
    inputBorderColor: 'white',
    inputBackgroundColor: '#2F2D2B', //bg of text input
    alternativeTextColor: 'white',
    alternativeTextColor2: 'white',
    buttonBlueBackgroundColor: '#FF7400',///
    incomingBackgroundColor: '#d2f8d6',///
    incomingForegroundColor: '#72A66D',//incoming transactions   #72A66D
    outgoingBackgroundColor: '#f8d2d2',//
    outgoingForegroundColor: '#FF9339',////outgoing transactions
    //successColor: '#2DD881',///green
    successColor: 'white',
    failedColor: '#ff0000',
    shadowColor: '#white',
    inverseForegroundColor: 'black',
    hdborderColor: '#FF7400',
    hdbackgroundColor: '#FF7400',
    lnborderColor: 'white',///
    lnbackgroundColor: '#FFFAEF',////lightning text and border
    background: 'black',
    lightButton: '#2F2D2B', ////add wallet gray area in flatList
    ballReceive: '#d2f8d6',///
    ballOutgoing: '#f8d2d2',///
    lightBorder: 'white',////line between transactions
    ballOutgoingExpired: '#EEF0F4',///
    modal: 'black',
    formBorder: 'white',///orange frame of Qr iand input
    modalButton: '#FF7400',
    darkGray: 'red',///
    scanLabel: '#9AA0AA',///
    feeText: 'white',
    feeLabel: 'white',
    feeValue: '#37c0a1',
    feeActive: '#FF7400',
    labelText: 'white',
    cta2: '#062453',///
    outputValue: '#13244D',
    elevated: 'black',
    mainColor: '#FF7400',
    success: 'white',
    successCheck: '#FF7400',
    msSuccessBG: '#37c0a1',
    msSuccessCheck: 'black',
    newBlue: 'white',///btc border and text
    redBG: '#F8D2D2',
    redText: '#D0021B',
    changeBackground: 'red',
    changeText: 'white',
    receiveBackground: '#D1F9D6',
    receiveText: '#37C0A1',
    navigationBarColor: 'black',
  },
};

// Casting theme value to get autocompletion
export const useTheme = (): Theme => useThemeBase() as Theme;

export class BlueCurrentTheme {
  static colors: Theme['colors'];
  static closeImage: Theme['closeImage'];
  static scanImage: Theme['scanImage'];

  static updateColorScheme(): void {
    const isColorSchemeDark = Appearance.getColorScheme() === 'dark';
    BlueCurrentTheme.colors = isColorSchemeDark ? BlueDarkTheme.colors : BlueDefaultTheme.colors;
    BlueCurrentTheme.closeImage = isColorSchemeDark ? BlueDarkTheme.closeImage : BlueDefaultTheme.closeImage;
    BlueCurrentTheme.scanImage = isColorSchemeDark ? BlueDarkTheme.scanImage : BlueDefaultTheme.scanImage;
  }
}

BlueCurrentTheme.updateColorScheme();
