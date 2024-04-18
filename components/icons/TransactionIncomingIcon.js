import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { useTheme } from '../themes';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faArrowRightFromBracket } from '@fortawesome/free-solid-svg-icons';

const styles = StyleSheet.create({
  boxIncoming: {
    position: 'relative',
  },
  ballIncoming: {
    width: 30,
    height: 30,
    borderRadius: 15,
    // transform: [{ rotate: '-45deg' }],
    justifyContent: 'center',
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
        <Icon name="arrow-right-bold-hexagon-outline" size={33} type="material-community" color={colors.incomingForegroundColor} />
        {/* <FontAwesomeIcon icon={faArrowRightFromBracket} size={22} color="white" /> */}
        
      </View>
    </View>
  );
};

export default TransactionIncomingIcon;
