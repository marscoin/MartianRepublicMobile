import { useNavigation } from '@react-navigation/native';
import React, { useContext, useEffect, useState } from 'react';

import { BlueStorageContext } from '../../blue_modules/storage-context';
import presentAlert from '../../components/Alert';
import { SettingsList, SettingsRow } from '../../components/SettingsUi';
import loc, { saveLanguage } from '../../loc';
import { AvailableLanguages, TLanguage } from '../../loc/languages';

const Language = () => {
  const { setLanguage, language } = useContext(BlueStorageContext);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(loc.getLanguage());
  const { setOptions } = useNavigation();

  useEffect(() => {
    setOptions({ title: loc.settings.language });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const onLanguageSelect = (item: TLanguage) => {
    const currentLanguage = AvailableLanguages.find(l => l.value === selectedLanguage);
    saveLanguage(item.value).then(() => {
      setSelectedLanguage(item.value);
      setLanguage();
      if (currentLanguage?.isRTL !== item.isRTL) {
        presentAlert({ message: loc.settings.language_isRTL });
      }
    });
  };

  const renderItem = ({ item, index }: { item: TLanguage; index: number }) => {
    return (
      <SettingsRow
        title={item.label}
        checked={selectedLanguage === item.value ? true : undefined}
        chevron={false}
        last={index === AvailableLanguages.length - 1}
        onPress={() => onLanguageSelect(item)}
      />
    );
  };

  return (
    <SettingsList
      title={loc.settings.language}
      keyExtractor={(_item: TLanguage, index: number) => `${index}`}
      data={AvailableLanguages}
      renderItem={renderItem}
      initialNumToRender={25}
    />
  );
};

export default Language;
