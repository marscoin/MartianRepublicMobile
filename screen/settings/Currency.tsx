import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import React, { useContext, useLayoutEffect, useState, useEffect } from 'react';
import { FlatList, NativeSyntheticEvent, StyleSheet, View , Text} from 'react-native';
import { BlueCard, BlueSpacing10, BlueText } from '../../BlueComponents';
import {
  CurrencyRate,
  getPreferredCurrency,
  initCurrencyDaemon,
  mostRecentFetchedRate,
  setPreferredCurrency,
} from '../../blue_modules/currency';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import presentAlert from '../../components/Alert';
import ListItem from '../../components/ListItem';
import { useTheme } from '../../components/themes';
import loc from '../../loc';
import { FiatUnit, FiatUnitSource, FiatUnitType, getFiatRate } from '../../models/fiatUnit';
dayjs.extend(require('dayjs/plugin/calendar'));

const Currency = () => {
  const { setPreferredFiatCurrency } = useContext(BlueStorageContext);
  const [isSavingNewPreferredCurrency, setIsSavingNewPreferredCurrency] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<FiatUnitType>(FiatUnit.USD);
  const [currencyRate, setCurrencyRate] = useState<CurrencyRate>({ LastUpdated: null, Rate: null });
  const { colors } = useTheme();
  const { setOptions } = useNavigation<any>();
  const [search, setSearch] = useState('');
  const data = Object.values(FiatUnit).filter(item => item.endPointKey.toLowerCase().includes(search.toLowerCase()));

  const styles = StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background,
    },
    infoText: {
      color:'white', 
      textAlign: 'center',
      fontSize: 16,
      fontWeight:"400",
      fontFamily: 'Orbitron-Regular',
      letterSpacing: 1.1, 
    },
  });

  const [price, setPrice] = useState(null);
  const [date, setDate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMarscoinPrice = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('https://price.marscoin.org/json/');
      const json = await response.json();
      if (json && json.data && json.data[154] && json.data[154].quote && json.data[154].quote.USD) {
        const formattedPrice = Number(json.data[154].quote.USD.price.toFixed(4));
        setPrice(formattedPrice.toString());
        setDate(json.data[154].quote.USD.last_updated);
      } else {
        setError("Failed to retrieve valid data");
      }
    } catch (err) {
      setError(err.message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMarscoinPrice();
  }, []);
  useEffect(() => {
    console.log('MARS Price', price, date);
  }, [price]);

  const fetchCurrency = async () => {
    let preferredCurrency;
    try {
      preferredCurrency = await getPreferredCurrency();
      if (preferredCurrency === null) {
        throw Error();
      }
      setSelectedCurrency(preferredCurrency);
    } catch (_error) {
      setSelectedCurrency(FiatUnit.USD);
    }
    const mostRecentFetchedRateValue = await mostRecentFetchedRate();
    setCurrencyRate(mostRecentFetchedRateValue);
  };

  useLayoutEffect(() => {
    fetchCurrency();
  }, [setOptions]);

  const renderItem = ({ item }: { item: FiatUnitType }) => (
    <ListItem
      disabled={isSavingNewPreferredCurrency || selectedCurrency.endPointKey === item.endPointKey}
      title={`${item.endPointKey} (${item.symbol})`}
      //containerStyle={StyleSheet.flatten([styles.flex, { minHeight: 60 }])}
      checkmark={selectedCurrency.endPointKey === item.endPointKey}
    />
  );

  return (
    <View style={styles.flex}>
      <View>
        <FlatList
          keyExtractor={(_item, index) => `${index}`}
          data={data}
          renderItem={renderItem}
        />
      </View>
       <View style ={{flex:1, marginHorizontal: 20, marginTop: 20}}>
         <Text style={styles.infoText}>Price is obtained from marscoin.org</Text>
         <BlueSpacing10 />
         <Text style={[styles.infoText, {color:'#FF7400'}]}> Rate: ${price?? loc._.never}</Text>
         <BlueSpacing10 />
         <Text style={styles.infoText}> Last Updated: {dayjs(date).calendar() ?? loc._.never} </Text>
      </View>
      
    </View>
  );
};

export default Currency;
