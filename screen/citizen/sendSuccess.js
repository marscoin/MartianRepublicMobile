import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import LottieView from 'lottie-react-native';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-elements';
import BigNumber from 'bignumber.js';
import { useNavigation, useRoute } from '@react-navigation/native';

import { BlueCard } from '../../BlueComponents';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import loc from '../../loc';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';

const SendSuccess = () => {
  console.log('SEND SUCCESS SCREEN')
  const navigation = useNavigation();
  const onDonePressed = () => {
    navigation.navigate('CitizenScreen');
  };
  const { colors } = useTheme();
  const { getParent } = useNavigation();
  const { amount, fee, amountUnit = BitcoinUnit.BTC, invoiceDescription = '' } = useRoute().params;
  const stylesHook = StyleSheet.create({
    root: {
      backgroundColor: colors.elevated,
    },
    amountValue: {
      color: colors.alternativeTextColor2,
    },
    amountUnit: {
      color: colors.alternativeTextColor2,
    },
  });
  useEffect(() => {
    console.log('send/success - useEffect');
  }, []);

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <SuccessView
        amount={parseFloat(amount)}
        amountUnit={amountUnit}
        fee={parseFloat(fee)}
        invoiceDescription={invoiceDescription}
        onDonePressed={onDonePressed}
      />
      <View style={styles.buttonContainer}>
        <Button onPress={onDonePressed} title={loc.send.success_done} />
      </View>
    </SafeArea>
  );
};

export default SendSuccess;

export const SuccessView = ({ amount, amountUnit, fee, invoiceDescription, shouldAnimate = true }) => {
  const animationRef = useRef();
  const { colors } = useTheme();

  const stylesHook = StyleSheet.create({
    amountValue: {
      color: colors.alternativeTextColor2,
    },
    amountUnit: {
      color: colors.alternativeTextColor2,
    },
  });

  useEffect(() => {
    if (shouldAnimate && animationRef.current) {
      /*
      https://github.com/lottie-react-native/lottie-react-native/issues/832#issuecomment-1008209732
      Temporary workaround until Lottie is fixed.
      */
      setTimeout(() => {
        animationRef.current?.reset();
        animationRef.current?.play();
      }, 100);
    }
  }, [colors, shouldAnimate]);

  const stylesM = StyleSheet.create({
    container: {
      height: 33,
    },
    text: {
      fontSize: 33,
      fontWeight: '700',
      fontFamily: 'Orbitron-Black', 
      color:'white'
    },
    line: {
      position: 'absolute',
      top: 3, 
      left: 2,
      right: 2,
      height: 4,
      backgroundColor: 'white',
    },
  });
  const MarscoinSymbol = () => (
    <View style={stylesM.container}>
      <Text style={stylesM.text}>M</Text>
      <View style={stylesM.line} />
    </View>
  );

  return (
    <View style={styles.root}>
      {amount || fee > 0 ? (
        <BlueCard style={styles.amount}>
          <View style={styles.view}>
            {amount ? (
              <>
                <Text style={[styles.amountValue, stylesHook.amountValue]}>{amount} </Text>
                <Text style={[styles.amountUnit, stylesHook.amountUnit]}>
                  <MarscoinSymbol/>
                </Text>
              </>
            ) : null}
          </View>
          {fee > 0 && (
            <Text style={styles.feeText}>
              {loc.send.create_fee}: {new BigNumber(fee).toFixed()} 
            </Text>
          )}
          <Text numberOfLines={0} style={styles.feeText}>
            {invoiceDescription}
          </Text>
        </BlueCard>
      ) : null}

      <View style={styles.ready}>
        <LottieView
          style={styles.lottie}
          source={require('../../img/bluenice.json')}
          autoPlay={shouldAnimate}
          ref={animationRef}
          loop={false}
          progress={shouldAnimate ? 0 : 1}
          colorFilters={[
            {
              keypath: 'spark',
              color: colors.success,
            },
            {
              keypath: 'circle',
              color: colors.success,
            },
            {
              keypath: 'Oval',
              color: colors.successCheck,
            },
          ]}
          resizeMode="center"
        />
      </View>
    </View>
  );
};

SuccessView.propTypes = {
  amount: PropTypes.number,
  amountUnit: PropTypes.string,
  fee: PropTypes.number,
  invoiceDescription: PropTypes.string,
  shouldAnimate: PropTypes.bool,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 19,
  },
  buttonContainer: {
    paddingHorizontal: 58,
    paddingBottom: 16,
  },
  amount: {
    alignItems: 'center',
  },
  view: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '600',
    fontFamily: 'Orbitron-Black',
  },
  amountUnit: {
    fontSize: 16,
    marginHorizontal: 4,
    paddingBottom: 6,
    fontWeight: '600',
    alignSelf: 'flex-end',
    fontFamily: 'Orbitron-Black',
  },
  feeText: {
    color: '#FF7400',
    fontSize: 14,
    marginHorizontal: 4,
    paddingVertical: 6,
    fontWeight: '500',
    alignSelf: 'center',
    fontFamily: 'Orbitron-Black',
    letterSpacing: 1.2
  },
  ready: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 53,
  },
  lottie: {
    width: 200,
    height: 200,
  },
});
