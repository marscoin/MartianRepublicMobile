import React from 'react';
import { SafeAreaView,  StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../components/themes';
import LinearGradient from 'react-native-linear-gradient';

const JoinGeneralPublicApplicationSuccessScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors, fonts } = useTheme();
  const styles = getStyles(colors, fonts);

  return (
    <SafeAreaView style={{flex: 1, marginBottom:-80}}> 
        <View style={{ marginTop: 80, marginHorizontal: 20, alignItems:"center" }}>
            <Text  style={styles.medText}>Your application was succesfully published!</Text>
        </View>

        <View style={{ marginTop: 10, marginHorizontal: 20, alignSelf:"center" }}>
            <Text  style={styles.smallText}>It might take some time before you'll see yourself in PUBLIC</Text>
        </View>

        <Image source={require('../../img/astronaut.png')} style={styles.imgBox}/>

        <LinearGradient colors={ ['#FFB67D','#FF8A3E', '#FF7400']} style={styles.joinButtonGradient}>
            <TouchableOpacity style={styles.joinButton} onPress={() => navigation.navigate('CitizenScreen')}>
                <Text style={styles.buttonText}>TO MARS</Text>
            </TouchableOpacity>  
          </LinearGradient>

    </SafeAreaView>
  );
};

const getStyles = (colors, fonts) => StyleSheet.create({

  imgBox: {
    height: "30%",
    resizeMode:"contain",
    alignSelf:'center',
    marginVertical: 40
  },
  smallText: {
    color:'#FF7400', 
    fontSize: 12,
    lineHeight:16,
    fontFamily: fonts.fontFamily,
    fontWeight:"400",
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.5,
    textAlign: 'center'
  },
  medText: {
    color:'white', 
    fontSize: 22,
    lineHeight:28,
    fontFamily: fonts.fontFamily,
    fontWeight:"600",
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.5,
    textAlign: 'center'
  },
  buttonText: {
    color:'white', 
    textAlign: 'center',
    fontSize: 18,
    fontWeight:"600",
    fontFamily: fonts.regular.fontFamily
  },
  joinButton: {
    paddingVertical:10,
    borderRadius: 20,
    marginHorizontal: 20,
    justifyContent:'center',
  },
  joinButtonGradient: {
    paddingVertical:10,
    alignItems:'center',
    justifyContent:'center',
    borderRadius: 20,
    marginHorizontal: 40,
  },
});
export default JoinGeneralPublicApplicationSuccessScreen;
