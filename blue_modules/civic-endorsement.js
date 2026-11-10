import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from './constants';
import { prepareCivicPublication } from './citizenship-publication';

export function endorsementRecipient(person) {
  return person?.address || person?.citizen?.public_address || person?.user?.citizen?.public_address;
}

export function prepareEndorsement({ wallet, recipient, ...options }) {
  if (!wallet?.civic) throw new Error('Restore your civic wallet before endorsing someone.');
  const address = wallet._getExternalAddressByIndex(0);
  try {
    bitcoin.address.toOutputScript(recipient, Marscoin.mainnet);
  } catch {
    throw new Error('This person does not have a valid Marscoin civic address.');
  }
  if (recipient === address) throw new Error('You cannot endorse your own civic identity.');
  const data = {
    message: `Citizen ${address} herewith endorses ${recipient}. May you live long and prosper!`,
  };
  return prepareCivicPublication({ ...options, wallet, data, prefix: 'ED_' });
}
