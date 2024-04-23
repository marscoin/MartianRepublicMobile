import React, { Component} from 'react';
import PropTypes from 'prop-types';
import BigNumber from 'bignumber.js';
import { Badge, Icon, Text } from 'react-native-elements';
import { Image, LayoutAnimation, Pressable, StyleSheet, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useState } from 'react';
import confirm from '../helpers/confirm';
import { BitcoinUnit } from '../models/bitcoinUnits';
import loc, { formatBalanceWithoutSuffix, formatBalancePlain, removeTrailingZeros } from '../loc';
import { BlueText } from '../BlueComponents';
import dayjs from 'dayjs';
import { useTheme } from './themes';
import {
  fiatToBTC,
  getCurrencySymbol,
  isRateOutdated,
  mostRecentFetchedRate,
  satoshiToBTC,
  updateExchangeRate,
} from '../blue_modules/currency';
dayjs.extend(require('dayjs/plugin/localizedFormat'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import {EXCHANGE_RATES_STORAGE_KEY} from '../blue_modules/currency';

class AmountInput extends Component {
  static propTypes = {
    isLoading: PropTypes.bool,
    /**
     * amount is a sting thats always in current unit denomination, e.g. '0.001' or '9.43' or '10000'
     */
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    /**
     * callback that returns currently typed amount, in current denomination, e.g. 0.001 or 10000 or $9.34
     * (btc, sat, fiat)
     */
    onChangeText: PropTypes.func.isRequired,
    /**
     * callback thats fired to notify of currently selected denomination, returns <BitcoinUnit.*>
     */
    onAmountUnitChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    colors: PropTypes.object.isRequired,
    pointerEvents: PropTypes.string,
    unit: PropTypes.string,
    onBlur: PropTypes.func,
    onFocus: PropTypes.func,
    // marsRate: PropTypes.number,
  };
  
  /**
   * cache of conversions  fiat amount => satoshi
   * @type {{}}
   */
  static conversionCache = {};

  static getCachedSatoshis = amount => {
    return AmountInput.conversionCache[amount + BitcoinUnit.LOCAL_CURRENCY] || false;
  };

  static setCachedSatoshis = (amount, sats) => {
    AmountInput.conversionCache[amount + BitcoinUnit.LOCAL_CURRENCY] = sats;
  };

  constructor() {
    super();
    this.state = { 
      mostRecentFetchedRate: Date(), 
      isRateOutdated: false, 
      isRateBeingUpdated: false,
      marsRate: null
    };
  }

  componentDidMount() {
    this.fetchMarsRate();
    mostRecentFetchedRate()
      .then(mostRecentFetchedRateValue => {
        this.setState({ mostRecentFetchedRate: mostRecentFetchedRateValue });
      })
      .finally(() => {
        isRateOutdated().then(isRateOutdatedValue => this.setState({ isRateOutdated: isRateOutdatedValue }));
      });
  }

  // Fetch marsRate from AsyncStorage
  fetchMarsRate = async () => {
    try {
      const ratesString = await AsyncStorage.getItem(EXCHANGE_RATES_STORAGE_KEY);
      const rates = ratesString ? JSON.parse(ratesString) : {};
      const marsRate = rates['MARS_USD']; // Ensure that you're using the correct key
      this.setState({ marsRate });
    } catch (error) {
      console.error('Failed to fetch Marscoin rate:', error);
    }
  };
  /**
   * here we must recalculate old amont value (which was denominated in `previousUnit`) to new denomination `newUnit`
   * and fill this value in input box, so user can switch between, for example, 0.001 BTC <=> 100000 sats
   *
   * @param previousUnit {string} one of {BitcoinUnit.*}
   * @param newUnit {string} one of {BitcoinUnit.*}
   */
  onAmountUnitChange(previousUnit, newUnit) {
    const amount = this.props.amount || 0;
    const log = `${amount}(${previousUnit}) ->`;
    let sats = 0;
    switch (previousUnit) {
      case BitcoinUnit.MARS:
        zubrins = new BigNumber(amount).multipliedBy(100000000).toString();
        break;
      case BitcoinUnit.ZUBRINS:
        zubrins = amount;
        break;
      case BitcoinUnit.LOCAL_CURRENCY:
        zubrins = new BigNumber(fiatToBTC(amount)).multipliedBy(100000000).toString();
        break;
    }
    if (previousUnit === BitcoinUnit.LOCAL_CURRENCY && AmountInput.conversionCache[amount + previousUnit]) {
      // cache hit! we reuse old value that supposedly doesnt have rounding errors
      sats = AmountInput.conversionCache[amount + previousUnit];
    }

    const newInputValue = formatBalancePlain(sats, newUnit, false);
    console.log(`${log} ${sats}(sats) -> ${newInputValue}(${newUnit})`);

    if (newUnit === BitcoinUnit.LOCAL_CURRENCY && previousUnit === BitcoinUnit.SATS) {
      // we cache conversion, so when we will need reverse conversion there wont be a rounding error
      AmountInput.conversionCache[newInputValue + newUnit] = amount;
    }
    this.props.onChangeText(newInputValue);
    this.props.onAmountUnitChange(newUnit);
  }

  /**
   * responsible for cycling currently selected denomination, BTC->SAT->LOCAL_CURRENCY->BTC
   */
  changeAmountUnit = () => {
    let previousUnit = this.props.unit;
    let newUnit;
    if (previousUnit === BitcoinUnit.BTC) {
      newUnit = BitcoinUnit.SATS;
    } else if (previousUnit === BitcoinUnit.SATS) {
      newUnit = BitcoinUnit.LOCAL_CURRENCY;
    } else if (previousUnit === BitcoinUnit.LOCAL_CURRENCY) {
      newUnit = BitcoinUnit.BTC;
    } else {
      newUnit = BitcoinUnit.BTC;
      previousUnit = BitcoinUnit.SATS;
    }
    this.onAmountUnitChange(previousUnit, newUnit);
  };

  maxLength = () => {
        return 11;
  };

  textInput = React.createRef();

  handleTextInputOnPress = () => {
    this.textInput.current.focus();
  };

  // handleChangeText = text => {
  //   text = text.trim();
  //   if (this.props.unit !== BitcoinUnit.LOCAL_CURRENCY) {
  //     text = text.replace(',', '.');
  //     const split = text.split('.');
  //     if (split.length >= 2) {
  //       text = `${parseInt(split[0], 10)}.${split[1]}`;
  //     } else {
  //       text = `${parseInt(split[0], 10)}`;
  //     }

  //     text = this.props.unit === BitcoinUnit.BTC ? text.replace(/[^0-9.]/g, '') : text.replace(/[^0-9]/g, '');

  //     if (text.startsWith('.')) {
  //       text = '0.';
  //     }
  //   } else if (this.props.unit === BitcoinUnit.LOCAL_CURRENCY) {
  //     text = text.replace(/,/gi, '.');
  //     if (text.split('.').length > 2) {
  //       // too many dots. stupid code to remove all but first dot:
  //       let rez = '';
  //       let first = true;
  //       for (const part of text.split('.')) {
  //         rez += part;
  //         if (first) {
  //           rez += '.';
  //           first = false;
  //         }
  //       }
  //       text = rez;
  //     }
  //     if (text.startsWith('0') && !(text.includes('.') || text.includes(','))) {
  //       text = text.replace(/^(0+)/g, '');
  //     }
  //     text = text.replace(/[^\d.,-]/g, ''); // remove all but numbers, dots & commas
  //     text = text.replace(/(\..*)\./g, '$1');
  //   }
  //   this.props.onChangeText(text);
  // };
  handleChangeText = text => {
    // Trim whitespace and replace commas with dots if necessary
    text = text.trim().replace(/,/g, '.');
  
    // This regular expression allows digits and a single dot
    const validPattern = /^\d*\.?\d*$/;
  
    // Check if the text matches the pattern for valid input
    if (validPattern.test(text)) {
      if (text.startsWith('.')) {
        // Prefix the decimal point with a zero if there is no leading digit
        text = '0' + text;
      }
  
      // Update state and call the passed onChangeText function with the new value
      this.props.onChangeText(text);
    }
  };
  

  resetAmount = async () => {
    if (await confirm(loc.send.reset_amount, loc.send.reset_amount_confirm)) {
      this.props.onChangeText();
    }
  };

  updateRate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    this.setState({ isRateBeingUpdated: true }, async () => {
      try {
        await updateExchangeRate();
        mostRecentFetchedRate().then(mostRecentFetchedRateValue => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          this.setState({ mostRecentFetchedRate: mostRecentFetchedRateValue });
        });
      } finally {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        this.setState({ isRateBeingUpdated: false, isRateOutdated: await isRateOutdated() });
      }
    });
  };

  render() {
    const { colors, disabled, unit } = this.props;
    const { marsRate } = this.state
    const amount = this.props.amount || 0;
    //let secondaryDisplayCurrency = formatBalanceWithoutSuffix(amount, BitcoinUnit.LOCAL_CURRENCY, false);
    let secondaryDisplayCurrency = `$ ${(amount*marsRate).toFixed(6)}`

    // if main display is sat or btc - secondary display is fiat
    // if main display is fiat - secondary dislay is btc
    let sat;
    switch (unit) {
      case BitcoinUnit.BTC:
        sat = new BigNumber(amount).multipliedBy(100000000).toString();
        secondaryDisplayCurrency = formatBalanceWithoutSuffix(sat, BitcoinUnit.LOCAL_CURRENCY, false);
        break;
      case BitcoinUnit.SATS:
        secondaryDisplayCurrency = formatBalanceWithoutSuffix((isNaN(amount) ? 0 : amount).toString(), BitcoinUnit.LOCAL_CURRENCY, false);
        break;
      case BitcoinUnit.LOCAL_CURRENCY:
        secondaryDisplayCurrency = fiatToBTC(parseFloat(isNaN(amount) ? 0 : amount));
        if (AmountInput.conversionCache[isNaN(amount) ? 0 : amount + BitcoinUnit.LOCAL_CURRENCY]) {
          // cache hit! we reuse old value that supposedly doesn't have rounding errors
          const sats = AmountInput.conversionCache[isNaN(amount) ? 0 : amount + BitcoinUnit.LOCAL_CURRENCY];
          secondaryDisplayCurrency = satoshiToBTC(sats);
        }
        break;
    }

    if (amount === BitcoinUnit.MAX) secondaryDisplayCurrency = ''; // we don't want to display NaN

    const stylesHook = StyleSheet.create({
      center: { padding: amount === BitcoinUnit.MAX ? 0 : 15 },
      localCurrency: { color: disabled ? colors.buttonDisabledTextColor : colors.alternativeTextColor2 },
      input: { color: disabled ? colors.buttonDisabledTextColor : colors.alternativeTextColor2, fontSize: amount.length > 10 ? 20 : 36 },
      cryptoCurrency: { color: disabled ? colors.buttonDisabledTextColor : colors.alternativeTextColor2 },
    });

    return (
      <TouchableWithoutFeedback
        accessibilityRole="button"
        accessibilityLabel={loc._.enter_amount}
        disabled={this.props.pointerEvents === 'none'}
        onPress={() => this.textInput.focus()}
      >
        <>
          <View style={styles.root}>
            {!disabled && <View style={[styles.center, stylesHook.center]} />}
            <View style={styles.flex}>
              <View style={styles.container}>
                {/* {unit === BitcoinUnit.LOCAL_CURRENCY && amount !== BitcoinUnit.MAX && (
                  <Text style={[styles.localCurrency, stylesHook.localCurrency]}>{getCurrencySymbol() + ' '}</Text>
                )} */}
                {amount !== BitcoinUnit.MAX ? (
                  <TextInput
                    {...this.props}
                    testID="MarsAmountInput"
                    keyboardType="numeric"
                    adjustsFontSizeToFit
                    onChangeText={this.handleChangeText}
                    // onBlur={() => {
                    //   if (this.props.onBlur) this.props.onBlur();
                    // }}
                    // onFocus={() => {
                    //   if (this.props.onFocus) this.props.onFocus();
                    // }}
                    placeholder="0"
                    maxLength={12}
                    ref={textInput => (this.textInput = textInput)}
                    editable={!this.props.isLoading && !disabled}
                    //value={amount === BitcoinUnit.MAX ? loc.units.MAX : parseFloat(amount) >= 0 ? String(amount) : undefined}
                    value={amount}
                    placeholderTextColor={disabled ? colors.buttonDisabledTextColor : colors.alternativeTextColor2}
                    style={[styles.input, stylesHook.input]}
                  />
                ) : (
                  <Pressable onPress={this.resetAmount}>
                    <Text style={[styles.input, stylesHook.input]}>{BitcoinUnit.MAX}</Text>
                  </Pressable>
                )}
                { amount !== BitcoinUnit.MAX && (
                    <View style={styles.container1}>
                      <Text style={styles.text}>M</Text>
                      <View style={styles.line}/>
                    </View>
                )}
              </View>
              {marsRate &&
                <View style={styles.secondaryRoot}>
                  <Text style={styles.secondaryText}>
                    {unit === BitcoinUnit.LOCAL_CURRENCY && amount !== BitcoinUnit.MAX
                      ? removeTrailingZeros(secondaryDisplayCurrency)
                      : secondaryDisplayCurrency}
                    {unit === BitcoinUnit.LOCAL_CURRENCY && amount !== BitcoinUnit.MAX ? ` ${loc.units[BitcoinUnit.BTC]}` : null}
                  </Text>
                </View>
              }
            </View>
            {/* {!disabled && amount !== BitcoinUnit.MAX && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={loc._.change_input_currency}
                testID="changeAmountUnitButton"
                style={styles.changeAmountUnit}
                onPress={this.changeAmountUnit}
              >
                <Image source={require('../img/round-compare-arrows-24-px.png')} />
              </TouchableOpacity>
            )} */}
          </View>
          {/* {this.state.isRateOutdated && (
            <View style={styles.outdatedRateContainer}>
              <Badge status="warning" />
              <View style={styles.spacing8} />
              <BlueText>
                {loc.formatString(loc.send.outdated_rate, { date: dayjs(this.state.mostRecentFetchedRate.LastUpdated).format('l LT') })}
              </BlueText>
              <View style={styles.spacing8} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={loc._.refresh}
                onPress={this.updateRate}
                disabled={this.state.isRateBeingUpdated}
                style={this.state.isRateBeingUpdated ? styles.disabledButton : styles.enabledButon}
              >
                <Icon name="sync" type="font-awesome-5" size={16} color={colors.buttonAlternativeTextColor} />
              </TouchableOpacity>
            </View>
          )} */}
        </>
      </TouchableWithoutFeedback>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  center: {
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  spacing8: {
    width: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  enabledButon: {
    opacity: 1,
  },
  outdatedRateContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  container: {
    flexDirection: 'row',
    height: 60,
    //alignContent: 'space-between',
    justifyContent: 'center',
    paddingTop: 16,
    //paddingBottom: 2,
    //backgroundColor:'red'
  },
  localCurrency: {
    fontSize: 18,
    marginHorizontal: 4,
    fontWeight: 'bold',
    fontFamily: 'Orbitron-Black',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  input: {
    fontWeight: 'bold',
    fontFamily: 'Orbitron-Black',
    //fontSize: 40,
  },
  cryptoCurrency: {
    fontSize: 15,
    marginHorizontal: 8,
    fontWeight: '600',
    alignSelf: 'flex-end',
    justifyContent: 'center',
    fontFamily: 'Orbitron-Black',
  },
  secondaryRoot: {
    alignItems: 'center',
    marginBottom: 22,
  },
  secondaryText: {
    fontSize: 14,
    color: '#9BA0A9',
    fontWeight: '600',
    fontFamily: 'Orbitron-Regular',
    marginTop: 7
  },
  changeAmountUnit: {
    alignSelf: 'center',
    marginRight: 16,
    paddingLeft: 16,
    paddingVertical: 16,
  },
  container1: {
    height: 44,
    //backgroundColor: 'green',
    marginLeft: 8
  },
  text: {
    fontSize: 36,
    color: 'white',
    fontWeight: '600',
    alignSelf: 'flex-end',
    fontFamily: 'Orbitron-Black',
  },
  line: {
    position: 'absolute',
    top: 3, 
    left: 2,
    right: 2,
    height: 3,
    backgroundColor: 'white',
  },
});



const AmountInputWithStyle = props => {
  const { colors } = useTheme();
  // const [amount, setAmount] = useState('');
  // handleChangeText = text => {
  //   text = text.replace(/[^0-9.]/g, '');  // Only allow numbers and decimal point
  //   if (text.startsWith('.')) {
  //     text = '0' + text;  // Pad a zero before solitary decimal point
  //   }
  //   setAmount(text);
  //   onChangeText(text);
  // };

  return <AmountInput {...props} colors={colors} />;
};

// expose static methods
AmountInputWithStyle.conversionCache = AmountInput.conversionCache;
AmountInputWithStyle.getCachedSatoshis = AmountInput.getCachedSatoshis;
AmountInputWithStyle.setCachedSatoshis = AmountInput.setCachedSatoshis;

export default AmountInputWithStyle;
