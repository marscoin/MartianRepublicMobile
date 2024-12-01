import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../themes';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

const styles = StyleSheet.create({
  boxIncoming: {
    position: 'relative',
  },
  ballIncoming: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center', // Add this to center the icon
  },
});

const TransactionIncomingIcon = props => {
  const { colors } = useTheme();
  const stylesHooks = StyleSheet.create({
    ballIncoming: {
      //backgroundColor: colors.ballReceive,
    },
  });

  return (
    <View style={styles.boxIncoming}>
      <View style={[styles.ballIncoming, stylesHooks.ballIncoming]}>
        <MaterialCommunityIcons
          name="arrow-right-bold-hexagon-outline"
          size={33}
          color={colors.incomingForegroundColor}
        />
      </View>
    </View>
  );
};

export default TransactionIncomingIcon;