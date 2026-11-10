import React from 'react';
import MarsWalletRecovery from '../../components/MarsWalletRecovery';

const ImportCivicWalletDiscovery = () => <MarsWalletRecovery civic />;
ImportCivicWalletDiscovery.navigationOptions = () => () => ({
  headerShown: false,
});
export default ImportCivicWalletDiscovery;
