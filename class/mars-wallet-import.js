import { MarsElectrumWallet } from '../screen/wallets/mars-wallet';
import loc from '../loc';
import { requireMarsRecoveryPhrase } from '../blue_modules/mars-recovery-input';

// Both ordinary and civic wallets use Marscoin's BIP44 derivation. Do not run
// Bitcoin discovery after finding one: it can prevent Marscoin restoration.
export default function startMarsImport(importText, askPassphrase, _searchAccounts, onProgress, onWallet, onPassword) {
  let stopped = false;
  const promise = (async () => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(requireMarsRecoveryPhrase(importText));

    if (askPassphrase) {
      wallet.setPassphrase(await onPassword(loc.wallets.import_passphrase, loc.wallets.import_passphrase));
    }
    if (stopped) return { cancelled: true, stopped, wallets: [] };

    // A civic identity stays at index zero even after the receive address moves.
    wallet._address = wallet._getExternalAddressByIndex(0);
    onProgress('Connecting to Marscoin');
    await wallet.fetchBalance();
    if (stopped) return { cancelled: true, stopped, wallets: [] };

    onWallet(wallet);
    return { cancelled: false, stopped, wallets: [wallet] };
  })();

  return {
    promise,
    stop: () => {
      stopped = true;
    },
  };
}
