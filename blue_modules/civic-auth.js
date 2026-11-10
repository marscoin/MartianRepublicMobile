import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import { Marscoin } from './constants';

export function createCivicAuthRequest(wallet, timestamp = Math.floor(Date.now() / 1000)) {
  const address = wallet._getExternalAddressByIndex(0);
  const key = bitcoin.ECPair.fromWIF(wallet._getExternalWIFByIndex(0), Marscoin.mainnet);
  const message = `https://martianrepublic.org/api/token?a=${address}&t=${timestamp}`;
  // The existing Republic API uses Bitcoin's message envelope with a Marscoin
  // address. Use the wallet's key derivation so its BIP39 passphrase is retained.
  const signature = bitcoinMessage.sign(message, key.privateKey, key.compressed).toString('base64');
  return { a: address, m: message, s: signature, t: timestamp };
}
