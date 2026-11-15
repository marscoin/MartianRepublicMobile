// What "Find older funds" needs from the running app: the Marscoin network,
// the fee rate the send screen uses, and the offer made after a restore.
// The work itself is in ./older-funds.
import { marsAlert } from './mars-alert';
import { isOlderFundsWallet, scanOlderFunds } from './older-funds';
import { formatMars } from './swap/present';
import NetworkTransactionFees from '../models/networkTransactionFees';
import * as NavigationService from '../NavigationService';

// The app's Marscoin connection, once it is up. Rejects when it cannot be
// reached, so that a dead network is never mistaken for "nothing found".
export async function olderFundsNetwork() {
  const connection = require('./MARSConnection');
  await connection.waitTillConnected();
  return connection;
}

// Hands the phone back to the screen for a moment between batches of key work.
export const yieldToScreen = () => new Promise(resolve => setTimeout(resolve, 0));

// Zubrins per byte: the rate the send screen starts from, never below 1.
export async function sweepFeeRate() {
  const fees = await NetworkTransactionFees.recommendedFees();
  const rate = Math.ceil(Number(fees?.fastestFee));
  return Number.isFinite(rate) && rate >= 1 ? rate : 1;
}

export const openFindOlderFunds = walletID =>
  NavigationService.navigate('Citizen', { screen: 'FindOlderFunds', params: walletID ? { walletID } : {} });

const offered = new Set();

// After a wallet is restored from its recovery words: look once, quietly, and
// speak up only when something is there. Never throws and is never awaited
// by the restore, which is already finished when this runs.
export async function offerOlderFundsAfterRestore(
  wallet,
  { delay = 2500, network = olderFundsNetwork, alert = marsAlert, open = openFindOlderFunds } = {},
) {
  try {
    if (!isOlderFundsWallet(wallet)) return null;
    const id = wallet.getID();
    if (offered.has(id)) return null;
    offered.add(id);
    // Let the restore finish drawing the home screen first.
    await new Promise(resolve => setTimeout(resolve, delay));
    const scan = await scanOlderFunds({ wallet, connection: await network(), pause: yieldToScreen });
    if (scan.total > 0) {
      alert(
        `We found ${formatMars(scan.total)} on older addresses of this wallet`,
        'Older versions of the Republic’s wallet kept these coins on other addresses that belong to the same recovery words.\n\nYou can move them into this wallet now, or later from Settings.',
        [
          { text: 'Show me', onPress: () => open(id) },
          { text: 'Not now', style: 'cancel' },
        ],
      );
    }
    return scan;
  } catch (_) {
    // Nothing is said about a check that could not be made: it is still on
    // offer in Settings and in the wallet's details.
    return null;
  }
}
