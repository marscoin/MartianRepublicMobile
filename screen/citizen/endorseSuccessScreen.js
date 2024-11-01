import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import LottieView from 'lottie-react-native';
import { View, StyleSheet, Dimensions, Image } from 'react-native';
import { Text } from 'react-native-elements';
import BigNumber from 'bignumber.js';
import { useNavigation, useRoute } from '@react-navigation/native';

import { BlueCard } from '../../BlueComponents';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import loc from '../../loc';
import { useTheme } from '../../components/themes';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';

const windowWidth = Dimensions.get('window').width;

const EndorseSuccessScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const person = route.params.person;
  console.log('PARAMS person',person )

  const goBackPressed = () => {navigation.navigate('CitizenScreen')};

  const { colors } = useTheme();
  const onDonePressed = () => {
    navigation.navigate('CitizenScreen');
  };
  
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
 

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <Text style={[styles.mainText,{color:  '#FF7400'}]}>THANK YOU MARTIAN!</Text>
      <Text style={styles.mainText}>THE USER:</Text>
      <View style={styles.userContainer}>
            <Image    
                source={
                     !person.user.citizen || !person.user.citizen.avatar_link
                    ? require('../../img/genericprofile.png')
                    : { uri: person.user.citizen.avatar_link }
                }
                style={styles.userImage} 
                onError={() => dispatch({ type: 'SET_IMAGE_LOAD_ERROR', payload: { id: item.id } })}
            />
            <View style={{ marginHorizontal: 10, width: windowWidth * 0.45 }}>
                <Text numberOfLines={2} style={styles.userName}>{person.user.fullname}</Text>
                <Text numberOfLines={1} style={styles.userAddress}>Address: {person.address.slice(0,9)}</Text>
                <Text numberOfLines={1} style={styles.userDate}>Joined: {new Date(person.created_at).toLocaleDateString()}</Text>
            </View>
            
      </View>
      <Text style={styles.mainText}>GOT YOUR ENDORSEMENT!</Text>
      <Button style={{width:200, marginTop: 40, alignSelf:'center'}} onPress={goBackPressed} title={'DONE'} />
        
    </SafeArea>
  );
};

export default EndorseSuccessScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 19,
  },
  mainText: {
    color:'white', 
    textAlign: 'center',
    fontSize: 24,
    fontWeight:"600",
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.1, 
    marginHorizontal:16,
    marginTop: 16, 
  },
  buttonContainer: {
    paddingHorizontal: 30,
    paddingBottom: 16,
    flexDirection: 'row',
  },
  userContainer: {
    padding: 16,
    borderWidth: 0.5,
    borderColor: '#FFF',
    marginVertical: 10,
    marginHorizontal: 20,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  userImage: {
    width: windowWidth * 0.3,
    height: windowWidth * 0.3,
    marginHorizontal: 5,
    borderRadius: 10
  },
  userAddress: {
    fontSize: 12,
    color: '#FFF',
    marginTop: 5,
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.2,
  },
userDate: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 5,
    fontFamily: 'Orbitron-Regular',
},
userName: {
    fontSize: 18,
    color:  '#FF7400',
    fontFamily: 'Orbitron-Regular',
    fontWeight:"500",
    letterSpacing: 1.1, 
},
});
