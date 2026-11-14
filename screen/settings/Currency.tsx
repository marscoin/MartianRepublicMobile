import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import React, { useContext, useLayoutEffect, useState, useEffect } from 'react';
import {
  CurrencyRate,
  getPreferredCurrency,
  initCurrencyDaemon,
  mostRecentFetchedRate,
  setPreferredCurrency,
} from '../../blue_modules/currency';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import presentAlert from '../../components/Alert';
import { SettingsNote, SettingsRow, SettingsScreen, SettingsSection } from '../../components/SettingsUi';
import loc from '../../loc';
import { FiatUnit, FiatUnitSource, FiatUnitType, getFiatRate } from '../../models/fiatUnit';
dayjs.extend(require('dayjs/plugin/calendar'));

const Currency = () => {
  const { setPreferredFiatCurrency } = useContext(BlueStorageContext);
  const [isSavingNewPreferredCurrency, setIsSavingNewPreferredCurrency] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<FiatUnitType>(FiatUnit.USD);
  const [currencyRate, setCurrencyRate] = useState<CurrencyRate>({ LastUpdated: null, Rate: null });
  const { setOptions } = useNavigation<any>();
  const [search, setSearch] = useState('');
  const data = Object.values(FiatUnit).filter(item => item.endPointKey.toLowerCase().includes(search.toLowerCase()));

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

  return (
    <SettingsScreen title={loc.settings.currency}>
      <SettingsSection label="AMOUNTS ARE ALSO SHOWN IN" first>
        {data.map(item => (
          <SettingsRow
            key={item.endPointKey}
            disabled={isSavingNewPreferredCurrency || selectedCurrency.endPointKey === item.endPointKey}
            title={`${item.endPointKey} (${item.symbol})`}
            checked={selectedCurrency.endPointKey === item.endPointKey ? true : undefined}
          />
        ))}
      </SettingsSection>

      <SettingsSection label="PRICE">
        <SettingsRow title="1 MARS" value={price ? `$${price}` : loc._.never} testID="CurrencyRate" />
        <SettingsRow title={loc.settings.last_updated} value={date ? dayjs(date).calendar() : loc._.never} testID="CurrencyUpdated" />
      </SettingsSection>
      <SettingsNote>The price comes from marscoin.org.</SettingsNote>
    </SettingsScreen>
  );
};

export default Currency;
