import React, { useRef, useCallback, useImperativeHandle, forwardRef, useContext } from 'react';
import PropTypes from 'prop-types';
import {Animated,Image,I18nManager,Platform,StyleSheet,Text, TouchableOpacity,useWindowDimensions,View,Dimensions,FlatList,Pressable} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import loc, { formatBalance, transactionTimeToReadable } from '../loc';
import { LightningCustodianWallet, LightningLdkWallet, MultisigHDWallet } from '../class';
import WalletGradient from '../class/wallet-gradient';
import { BluePrivateBalance } from '../BlueComponents';
import { BlueStorageContext } from '../blue_modules/storage-context';
import { isTablet, isDesktop } from '../blue_modules/environment';
import { useTheme } from './themes';
import { BitcoinUnit } from '../models/bitcoinUnits';
import { removeTrailingZeros } from '../loc';

const nStyles = StyleSheet.create({
  container: {
    borderRadius: 10,
    //minHeight: Platform.OS === 'ios' ? 164 : 181,
    height: 180,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  addAWAllet: {
    fontWeight: '600',
    fontFamily: 'Orbitron-Black',
    fontSize: 24,
    marginBottom: 4,
    letterSpacing: 1.2, 
  },
  addLine: {
    fontSize: 13,
    fontFamily: 'Orbitron-Regular',
    letterSpacing: 1.5, 
  },
  button: {
    marginTop: 12,
    backgroundColor: '#FF7400',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    fontFamily: 'Orbitron-Black',
    letterSpacing: 1.5, 
  },
});

const NewWalletPanel = ({ onPress }) => {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const itemWidth = width * 0.82 > 375 ? 375 : width * 0.82;
  const isLargeScreen = Platform.OS === 'android' ? isTablet() : (width >= Dimensions.get('screen').width / 2 && isTablet()) || isDesktop;
  const nStylesHooks = StyleSheet.create({
    container: isLargeScreen
      ? {
          paddingHorizontal: 24,
          marginVertical: 16,
        }
      : { paddingVertical: 16, paddingHorizontal: 24 },
  });

  return (
    <TouchableOpacity
      accessibilityRole="button"
      testID="CreateAWallet"
      onPress={onPress}
      style={isLargeScreen ? {} : { width: itemWidth * 1.2 }}
    >
      <View
        style={[
          nStyles.container,
          nStylesHooks.container,
          { backgroundColor: WalletGradient.createWallet() },
          isLargeScreen ? {} : { width: itemWidth },
        ]}
      >
        {/* /////ADD A WALLET///// */}
        <Text style={[nStyles.addAWAllet, { color: colors.foregroundColor }]}>{loc.wallets.list_create_a_wallet}</Text>
        <Text style={[nStyles.addLine, { color: colors.alternativeTextColor }]}>{loc.wallets.list_create_a_wallet_text}</Text>
        <View style={nStyles.button}>
          <Text style={[nStyles.buttonText, { color: colors.brandingColor }]}>{loc.wallets.list_create_a_button}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

NewWalletPanel.propTypes = {
  onPress: PropTypes.func.isRequired,
};

const iStyles = StyleSheet.create({
  root: { paddingRight: 20 },
  rootLargeDevice: { marginVertical: 20 , width: 300, marginRight: 10},
  grad: {
    padding: 12,
    borderRadius: 12,
    minHeight: 164,
    elevation: 5,
    height: 180 /////height of wallet item

  },
  image: {
    width: 150,
    height: 150,
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  br: {
    backgroundColor: 'transparent',
  },
  label: {
    backgroundColor: 'transparent',
    fontSize: 19,
    fontFamily: 'Orbitron-Black',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  address: {
    backgroundColor: 'transparent',
    marginTop:5,
    fontSize: 16,
    fontFamily: 'Orbitron-Regular',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  balance: {
    backgroundColor: 'transparent',
    fontFamily: 'Orbitron-Black',
    fontSize: 34,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  latestTx: {
    backgroundColor: 'transparent',
    fontSize: 13,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  latestTxTime: {
    backgroundColor: 'transparent',
    fontWeight: 'bold',
    fontFamily: 'Orbitron-Black',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    fontSize: 16,
  },
});

export const WalletCarouselItem = ({ item, _, onPress, handleLongPress, isSelectedWallet, customStyle }) => {
  const scaleValue = new Animated.Value(1.0);
  const { colors } = useTheme();
  const { walletTransactionUpdateStatus } = useContext(BlueStorageContext);
  const { width } = useWindowDimensions();
  const itemWidth = width * 0.82 > 375 ? 375 : width * 0.82;
  const isLargeScreen = Platform.OS === 'android' ? isTablet() : (width >= Dimensions.get('screen').width / 2 && isTablet()) || isDesktop;
  const onPressedIn = () => {
    Animated.spring(scaleValue, { duration: 50, useNativeDriver: true, toValue: 0.9 }).start();
  };

  const onPressedOut = () => {
    Animated.spring(scaleValue, { duration: 50, useNativeDriver: true, toValue: 1.0 }).start();
  };

  const opacity = isSelectedWallet === false ? 0.5 : 1.0;
  let image;
  switch (item.type) {
    case LightningLdkWallet.type:
    case LightningCustodianWallet.type:
      image = I18nManager.isRTL ? require('../img/lnd-shape-rtl.png') : require('../img/lnd-shape.png');
      break;
    case MultisigHDWallet.type:
      image = I18nManager.isRTL ? require('../img/vault-shape-rtl.png') : require('../img/vault-shape.png');
      break;
    default:
      image = item.civic ? require('../img/passport.png') : require('../img/marscoin_transparent2.png');
  }

  const latestTransactionText =
    walletTransactionUpdateStatus === true || walletTransactionUpdateStatus === item.getID()
      ? loc.transactions.updating
      : item.getBalance() !== 0 && item.getLatestTransactionTime() === 0
        ? loc.wallets.pull_to_refresh
        : item.getTransactions().find(tx => tx.confirmations === 0)
          ? loc.transactions.pending
          : transactionTimeToReadable(item.getLatestTransactionTime());

  //const balance = !item.hideBalance && (Number(formatBalance(item.getBalance())) + ' ' + item.preferredBalanceUnit);
  // function removeTrailingZeros(value) {
  //   return value.replace(/(\.[0-9]*[1-9])0+$|\.0*$/, "$1");
  // }

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 34,
    },
    text: {
      fontSize: 30,
      fontWeight: '900',
      fontFamily: 'Orbitron-Black', 
    },
    line: {
      position: 'absolute',
      top: 3, // Adjust top as needed
      left: 2,
      right: 2,
      height: 4,
      backgroundColor: 'black',
    },
    imageGold: {
      position: 'absolute', // changed from 'relative' to 'absolute'
      top: 0,
      left: 0,
      right: 0,
      width: '108%',
      // height: '100%',
      zIndex: -1,
      resizeMode:'stretch',
      padding: 12,
      borderRadius: 12,
      minHeight: 164,
      height: 180 
  },
  });
  const MarscoinSymbol = () => (
    <View style={styles.container}>
      <Text style={styles.text}>M</Text>
      <View style={styles.line} />
    </View>
  );
  
  const prebalance = Number((item.getBalance()))/100000000
  const balance = !item.hideBalance && (removeTrailingZeros(prebalance) );
  
  const walletStyle = item.civic ? { borderWidth: 0, borderColor: 'red', borderStyle:'solid', borderRadius:15 } : {};
  
  return (
    <Animated.View
      style={[
        isLargeScreen ? iStyles.rootLargeDevice : customStyle ?? { ...iStyles.root, width: itemWidth },
        { opacity, transform: [{ scale: scaleValue }] },
      ]}
      shadowOpacity={25 / 100}
      shadowOffset={{ width: 0, height: 3 }}
      shadowRadius={8}
    >
      {item.civic && 
        <>
        <View style={iStyles.grad}>
        <Image style={styles.imageGold} source={require('../img/gold3.jpeg')} />
        
        <Pressable
          accessibilityRole="button"
          testID={item.getLabel()}
          onPressIn={onPressedIn}
          onPressOut={onPressedOut}
          onLongPress={handleLongPress}
          onPress={() => {
            console.log('type',item.type )
            onPressedOut();
            setTimeout(() => {onPress(item)}, 50);
          }}
        >
            <Image source={image} style={iStyles.image} />
            <Text style={iStyles.br} />
            <Text numberOfLines={1} style={[iStyles.label, { color: colors.inverseForegroundColor }]}>
              {item.getLabel()}
            </Text>
            <Text numberOfLines={1} style={[iStyles.address, { color: colors.inverseForegroundColor }]}>
              {item.getAddress()}
            </Text>
            {item.hideBalance ? (
              <BluePrivateBalance />
            ) : (
              <Text
                numberOfLines={1}
                key={balance} // force component recreation on balance change. To fix right-to-left languages, like Farsi
                style={[iStyles.balance, { color: colors.inverseForegroundColor }]}
              >
                  <MarscoinSymbol />
                  {' '}
                  {balance}  
              </Text>
            )}
            <Text style={iStyles.br} />
            <Text numberOfLines={1} style={[iStyles.latestTx, { color: colors.inverseForegroundColor }]}>
              {loc.wallets.list_latest_transaction}
            </Text>

            <Text numberOfLines={1} style={[iStyles.latestTxTime, { color: colors.inverseForegroundColor }]}>
              {latestTransactionText}
            </Text>
        </Pressable>
        </View>
        </>
      } 
       
      {!item.civic && 
        <>
        <Pressable
          accessibilityRole="button"
          testID={item.getLabel()}
          onPressIn={onPressedIn}
          onPressOut={onPressedOut}
          onLongPress={handleLongPress}
          onPress={() => {
            console.log('type',item.type )
            onPressedOut();
            setTimeout(() => {onPress(item)}, 50);
          }}
        >
          <LinearGradient 
              //shadowColor={colors.shadowColor} 
              //colors = {item.civic ? ['#FFB67D','#FF8A3E', '#FF7400'] : ['white','white', 'white']}
              colors={WalletGradient.gradientsFor(item.type)} 
              style={iStyles.grad}
          >
              <Image source={image} style={iStyles.image} />
              <Text style={iStyles.br} />
              <Text numberOfLines={1} style={[iStyles.label, { color: colors.inverseForegroundColor }]}>
                {item.getLabel()}
              </Text>
              <Text numberOfLines={1} style={[iStyles.address, { color: colors.inverseForegroundColor }]}>
                {item.getAddress()}
              </Text>
              {item.hideBalance ? (
                <BluePrivateBalance />
              ) : (
                <Text
                  numberOfLines={1}
                  key={balance} // force component recreation on balance change. To fix right-to-left languages, like Farsi
                  style={[iStyles.balance, { color: colors.inverseForegroundColor }]}
                >
                  <MarscoinSymbol />
                  {' '}
                  {balance}    
                </Text>
              )}
              <Text style={iStyles.br} />
              <Text numberOfLines={1} style={[iStyles.latestTx, { color: colors.inverseForegroundColor }]}>
                {loc.wallets.list_latest_transaction}
              </Text>

              <Text numberOfLines={1} style={[iStyles.latestTxTime, { color: colors.inverseForegroundColor }]}>
                {latestTransactionText}
              </Text>
          </LinearGradient>
        </Pressable>
        </>
      }    
    </Animated.View>
  );
};

WalletCarouselItem.propTypes = {
  item: PropTypes.any,
  onPress: PropTypes.func.isRequired,
  handleLongPress: PropTypes.func,
  isSelectedWallet: PropTypes.bool,
};

const cStyles = StyleSheet.create({
  content: {
    paddingTop: 16,
  },
  contentLargeScreen: {
    paddingHorizontal: 16,
  },
  separatorStyle: {
    width: 16,
    height: 20,
  },
});

const ListHeaderComponent = () => <View style={cStyles.separatorStyle} />

const WalletsCarousel = forwardRef((props, ref) => {
  const { preferredFiatCurrency, language } = useContext(BlueStorageContext);
  const { horizontal, data, handleLongPress, onPress, selectedWallet } = props;
  const renderItem = useCallback(
    ({ item, index }) =>
      item ? (
        <WalletCarouselItem
          isSelectedWallet={!horizontal && selectedWallet ? selectedWallet === item.getID() : undefined}
          item={item}
          index={index}
          handleLongPress={handleLongPress}
          onPress={onPress}
          //style ={item.civic ? borderW: 'red' }
        />
      ) : (
        <NewWalletPanel onPress={onPress} />
      ),
    [horizontal, selectedWallet, handleLongPress, onPress, preferredFiatCurrency, language],
  );
  const flatListRef = useRef();

  useImperativeHandle(ref, () => ({
    scrollToItem: ({ item }) => {
      setTimeout(() => {
        flatListRef?.current?.scrollToItem({ item, viewOffset: 16 });
      }, 300);
    },
    scrollToIndex: ({ index }) => {
      setTimeout(() => {
        flatListRef?.current?.scrollToIndex({ index, viewOffset: 16 });
      }, 300);
    },
  }));

  const onScrollToIndexFailed = error => {
    console.log('onScrollToIndexFailed');
    console.log(error);
    flatListRef.current.scrollToOffset({ offset: error.averageItemLength * error.index, animated: true });
    setTimeout(() => {
      if (data.length !== 0 && flatListRef.current !== null) {
        flatListRef.current.scrollToIndex({ index: error.index, animated: true });
      }
    }, 100);
  };

  const { width } = useWindowDimensions();
  const sliderHeight = 195;
  const itemWidth = width * 0.82 > 375 ? 375 : width * 0.82;
  return horizontal ? (
    <FlatList
      ref={flatListRef}
      renderItem={renderItem}
      extraData={data}
      horizontal={false}
      keyExtractor={(_, index) => index.toString()}
      showsVerticalScrollIndicator={false}
      pagingEnabled
      disableIntervalMomentum={horizontal}
      snapToInterval={itemWidth} // Adjust to your content width
      decelerationRate="fast"
      contentContainerStyle={cStyles.content}
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      initialNumToRender={10}
      ListHeaderComponent={ListHeaderComponent}
      style={{ minHeight: sliderHeight + 9 }}
      onScrollToIndexFailed={onScrollToIndexFailed}
      {...props}
    />
  ) : (
    <View style={cStyles.contentLargeScreen}>
      {data.map((item, index) =>
        item ? (
          <WalletCarouselItem
            isSelectedWallet={!horizontal && selectedWallet ? selectedWallet === item.getID() : undefined}
            item={item}
            index={index}
            handleLongPress={handleLongPress}
            onPress={onPress}
            key={index}
          />
        ) : (
          <NewWalletPanel key={index} onPress={onPress} />
        )
      )}
    </View>
  );
});

WalletsCarousel.propTypes = {
  horizontal: PropTypes.bool,
  selectedWallet: PropTypes.string,
  onPress: PropTypes.func.isRequired,
  handleLongPress: PropTypes.func.isRequired,
  data: PropTypes.array,
};

export default WalletsCarousel;
