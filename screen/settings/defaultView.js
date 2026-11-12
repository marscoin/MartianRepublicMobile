import React, { useContext, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';

import { SettingsRow, SettingsScreen, SettingsSection, SettingsSwitchRow, settingsNavigation } from '../../components/SettingsUi';
import OnAppLaunch from '../../class/on-app-launch';
import loc from '../../loc';
import { BlueStorageContext } from '../../blue_modules/storage-context';

const DefaultView = () => {
  const [defaultWalletLabel, setDefaultWalletLabel] = useState('');
  const [viewAllWalletsEnabled, setViewAllWalletsEnabled] = useState(true);
  const { navigate, pop } = useNavigation();
  const { wallets } = useContext(BlueStorageContext);

  useEffect(() => {
    (async () => {
      const newViewAllWalletsEnabled = await OnAppLaunch.isViewAllWalletsEnabled();
      let newDefaultWalletLabel = '';
      const wallet = await OnAppLaunch.getSelectedDefaultWallet();
      if (wallet) {
        newDefaultWalletLabel = wallet.getLabel();
      }
      setDefaultWalletLabel(newDefaultWalletLabel);
      setViewAllWalletsEnabled(newViewAllWalletsEnabled);
    })();
  });

  const onViewAllWalletsSwitchValueChanged = async value => {
    await OnAppLaunch.setViewAllWalletsEnabled(value);
    if (value) {
      setViewAllWalletsEnabled(true);
      setDefaultWalletLabel('');
    } else {
      const selectedWallet = await OnAppLaunch.getSelectedDefaultWallet();
      setDefaultWalletLabel(selectedWallet.getLabel());
      setViewAllWalletsEnabled(false);
    }
  };

  const selectWallet = () => {
    navigate('SelectWallet', { onWalletSelect: onWalletSelectValueChanged });
  };

  const onWalletSelectValueChanged = async wallet => {
    await OnAppLaunch.setViewAllWalletsEnabled(false);
    await OnAppLaunch.setSelectedDefaultWallet(wallet.getID());
    setDefaultWalletLabel(wallet.getLabel());
    setViewAllWalletsEnabled(false);
    pop();
  };

  return (
    <SettingsScreen overline="MCR / SETTINGS / GENERAL" title={loc.settings.default_title}>
      <SettingsSection first>
        <SettingsSwitchRow
          icon="layers"
          title={loc.settings.default_wallets}
          note="When off, the app opens straight into the wallet you choose."
          value={viewAllWalletsEnabled}
          onValueChange={onViewAllWalletsSwitchValueChanged}
          disabled={wallets.length <= 0}
        />
        {!viewAllWalletsEnabled && (
          <SettingsRow icon="credit-card" title="Wallet to open" value={defaultWalletLabel} onPress={selectWallet} />
        )}
      </SettingsSection>
    </SettingsScreen>
  );
};

DefaultView.navigationOptions = settingsNavigation(() => loc.settings.default_title);

export default DefaultView;
