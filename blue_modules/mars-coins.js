// The coins a Marscoin payment may spend, and the rule they must meet: a value
// that is an exact, positive whole number of zubrins reported by the network.
import BigNumber from 'bignumber.js';

export const COINS_UNREACHABLE = 'Could not reach the Marscoin network to load your coins. Check your connection and try again.';

export const isExactCoinValue = value => Number.isSafeInteger(value) && value > 0;

// An amount in MARS, as transaction details carry it, in zubrins; or null
// when it is missing, zero or not a whole number of zubrins.
export function marsToExactZubrins(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  let zubrins;
  try {
    zubrins = new BigNumber(amount).shiftedBy(8);
  } catch {
    return null;
  }
  if (!zubrins.isInteger() || !zubrins.gt(0) || zubrins.gt(Number.MAX_SAFE_INTEGER)) return null;
  return zubrins.toNumber();
}

// Ask the network for the wallet's coins and wait for the answer. A payment
// is planned only from this list: when it cannot be had, say so.
export async function loadFreshCoins(wallet, { timeout = 45000 } = {}) {
  let timer;
  try {
    await Promise.race([
      wallet.fetchUtxo(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeout);
      }),
    ]);
  } catch (cause) {
    const error = new Error(COINS_UNREACHABLE);
    error.code = 'MARS_COINS_UNREACHABLE';
    // What actually went wrong, short enough to show under the message.
    error.detail = cause?.message === 'timeout' ? 'The network took too long to answer.' : String(cause?.message || cause || '').slice(0, 140);
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return wallet.getUtxo();
}
