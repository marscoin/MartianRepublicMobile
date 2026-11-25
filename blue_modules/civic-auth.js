import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import { Marscoin } from './constants';

// The Republic API uses Bitcoin's message envelope with a Marscoin address.
// The key comes from the wallet's own derivation so its BIP39 passphrase is
// retained. Every message the civic key signs for the server goes through here.
export function signCivicMessage(wallet, message) {
  const key = bitcoin.ECPair.fromWIF(wallet._getExternalWIFByIndex(0), Marscoin.mainnet);
  return bitcoinMessage.sign(message, key.privateKey, key.compressed).toString('base64');
}

export function createCivicAuthRequest(wallet, timestamp = Math.floor(Date.now() / 1000)) {
  const address = wallet._getExternalAddressByIndex(0);
  const message = `https://martianrepublic.org/api/token?a=${address}&t=${timestamp}`;
  const signature = signCivicMessage(wallet, message);
  return { a: address, m: message, s: signature, t: timestamp };
}
