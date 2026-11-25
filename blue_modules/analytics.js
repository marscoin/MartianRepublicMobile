/**
 * The app sends no analytics and no crash reports.
 *
 * The BlueWallet code this app grew from started Bugsnag here with BlueWallet's
 * own key, so reports (with a device ID) went to an account that is not ours.
 * That is switched off, here and in the native start-up code. The functions
 * stay so that callers do not have to change.
 */
const A = async event => {};

A.ENUM = {
  INIT: 'INIT',
  GOT_NONZERO_BALANCE: 'GOT_NONZERO_BALANCE',
  GOT_ZERO_BALANCE: 'GOT_ZERO_BALANCE',
  CREATED_WALLET: 'CREATED_WALLET',
  CREATED_LIGHTNING_WALLET: 'CREATED_LIGHTNING_WALLET',
  APP_UNSUSPENDED: 'APP_UNSUSPENDED',
  NAVIGATED_TO_WALLETS_HODLHODL: 'NAVIGATED_TO_WALLETS_HODLHODL',
};

A.setOptOut = value => {};

A.logError = errorString => {
  console.error(errorString);
};

module.exports = A;
