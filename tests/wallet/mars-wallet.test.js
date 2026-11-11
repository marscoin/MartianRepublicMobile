import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { Marscoin } from '../../blue_modules/constants';
import { MarsElectrumWallet } from '../../screen/wallets/mars-wallet';
import * as MARSConnection from '../../blue_modules/MARSConnection';
import startMarsImport from '../../class/mars-wallet-import';
import { createCivicAuthRequest } from '../../blue_modules/civic-auth';
import * as bitcoinMessage from 'bitcoinjs-message';
import { isInsufficientFunds, prepareCivicPublication } from '../../blue_modules/citizenship-publication';

// Isolate the native storage/UI inheritance and network. The Marscoin methods,
// BIP39, BIP32 and secp256k1 implementations under test remain real.
jest.mock('../../class', () => ({ HDLegacyP2PKHWallet: class {} }));
jest.mock('../../class/wallets/abstract-hd-electrum-wallet', () => ({
  AbstractHDElectrumWallet: { defaultRBFSequence: 0xfffffffd },
}));
jest.mock('../../blue_modules/MARSConnection', () => ({
  getTxHex: jest.fn(),
  getTransactionsByAddress: jest.fn(),
}));
jest.mock('../../class/rng', () => ({
  randomBytes: async size => require('crypto').randomBytes(size),
}));
jest.mock('../../loc', () => ({
  wallets: { import_passphrase: 'Passphrase' },
}));

// Public BIP39 test vector. Never use this mnemonic for funds.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Marscoin recovery compatibility and logging', () => {
  let logs;
  beforeEach(() => {
    logs = ['log', 'warn', 'error'].map(level => jest.spyOn(console, level).mockImplementation(() => {}));
  });
  afterEach(() => jest.restoreAllMocks());

  it('generates a valid 12-word recovery phrase without logging it or its seed', async () => {
    const wallet = new MarsElectrumWallet();
    await wallet.generate();
    expect(wallet.secret.split(' ')).toHaveLength(12);
    expect(bip39.validateMnemonic(wallet.secret)).toBe(true);
    expect(wallet.getXpub()).toBeTruthy();
    logs.forEach(log => expect(log).not.toHaveBeenCalled());
  });

  it.each([
    ['', 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1', 'MBsrv1TeeR716GQYmgskqZ77WhRQZJgSwZ'],
    ['TREZOR', 'MBbwMspsHb7qWKjam7umw1t3mF8mRXR6jB', 'M8zihiieJ8HHwQLjD6meo2nWSork4F7MfR'],
  ])('preserves existing receive/change addresses with passphrase %s', (passphrase, receive, change) => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    wallet.passphrase = passphrase;
    expect(wallet.getDerivationPath()).toBe("m/44'/2'/0'");
    expect(wallet._getExternalAddressByIndex(0)).toBe(receive);
    expect(wallet._getInternalAddressByIndex(0)).toBe(change);

    const key = bitcoin.ECPair.fromWIF(wallet._getExternalWIFByIndex(0), Marscoin.mainnet);
    expect(
      bitcoin.payments.p2pkh({
        pubkey: key.publicKey,
        network: Marscoin.mainnet,
      }).address,
    ).toBe(receive);
    logs.forEach(log => expect(log).not.toHaveBeenCalled());
  });

  it('signs a transaction with valid change without logging signing keys or UTXO secrets', async () => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    const address = wallet._getExternalAddressByIndex(0);
    const change = wallet._getInternalAddressByIndex(0);
    const recipientKey = bitcoin.ECPair.fromPrivateKey(Buffer.alloc(32, 2));
    const recipient = bitcoin.payments.p2pkh({
      pubkey: recipientKey.publicKey,
      network: Marscoin.mainnet,
    }).address;
    const previous = new bitcoin.Transaction();
    previous.addInput(Buffer.alloc(32, 1), 0);
    previous.addOutput(bitcoin.address.toOutputScript(address, Marscoin.mainnet), 200000000);
    MARSConnection.getTxHex.mockResolvedValue(previous.toHex());

    const result = await wallet.createTransaction(
      [
        {
          txId: previous.getId(),
          vout: 0,
          address,
          value: 200000000,
          wif: wallet._getExternalWIFByIndex(0),
        },
      ],
      [{ address: recipient, value: 100000000 }],
      1,
      change,
    );

    expect(result.fee).toBeGreaterThanOrEqual(result.tx.virtualSize());
    expect(result.fee).toBeLessThan(result.tx.virtualSize() + 5);
    expect(result.tx.ins[0].sequence).toBe(0xfffffffd);
    expect(result.tx.outs[0].value).toBe(100000000);
    expect(bitcoin.address.fromOutputScript(result.tx.outs[1].script, Marscoin.mainnet)).toBe(change);
    expect(result.tx.outs.reduce((sum, output) => sum + output.value, 0) + result.fee).toBe(200000000);
    const signature = bitcoin.script.signature.decode(bitcoin.script.decompile(result.tx.ins[0].script)[0]);
    const key = bitcoin.ECPair.fromWIF(wallet._getExternalWIFByIndex(0), Marscoin.mainnet);
    expect(key.verify(result.tx.hashForSignature(0, previous.outs[0].script, signature.hashType), signature.signature)).toBe(true);
    logs.forEach(log => expect(log).not.toHaveBeenCalled());
  });
});

describe('Civic restoration', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['', 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1'],
    ['TREZOR', 'MBbwMspsHb7qWKjam7umw1t3mF8mRXR6jB'],
  ])('signs civic login with the restored wallet passphrase %s', (passphrase, address) => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    wallet.passphrase = passphrase;
    wallet.next_free_address_index = 3;
    const request = createCivicAuthRequest(wallet, 1700000000);
    expect(request.a).toBe(address);
    expect(request.m).toBe(`https://martianrepublic.org/api/token?a=${address}&t=1700000000`);
    expect(request.t).toBe(1700000000);
    expect(bitcoinMessage.verify(request.m, address, request.s)).toBe(true);
  });

  it('restores exactly one Marscoin wallet and keeps its civic address at index zero', async () => {
    jest.spyOn(MarsElectrumWallet.prototype, 'fetchBalance').mockImplementation(async function () {
      this.next_free_address_index = 3;
    });
    const discovered = jest.fn();
    const result = await startMarsImport(mnemonic, false, false, jest.fn(), discovered, jest.fn()).promise;
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0].type).toBe('marscoin');
    expect(result.wallets[0].getAddress()).toBe('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
    expect(discovered).toHaveBeenCalledWith(result.wallets[0]);
  });

  it('applies the optional passphrase before deriving the civic identity', async () => {
    jest.spyOn(MarsElectrumWallet.prototype, 'fetchBalance').mockResolvedValue();
    const ask = jest.fn().mockResolvedValue('TREZOR');
    const result = await startMarsImport(mnemonic, true, false, jest.fn(), jest.fn(), ask).promise;
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.wallets[0].getAddress()).toBe('MBbwMspsHb7qWKjam7umw1t3mF8mRXR6jB');
  });

  it('rejects an invalid phrase before querying balances or reporting a wallet', async () => {
    const fetchBalance = jest.spyOn(MarsElectrumWallet.prototype, 'fetchBalance').mockResolvedValue();
    const discovered = jest.fn();
    await expect(startMarsImport('invalid recovery phrase', false, false, jest.fn(), discovered, jest.fn()).promise).rejects.toThrow(
      'recovery phrase',
    );
    expect(fetchBalance).not.toHaveBeenCalled();
    expect(discovered).not.toHaveBeenCalled();
  });

  it('preserves network errors without classifying them as invalid recovery input', async () => {
    const error = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
    jest.spyOn(MarsElectrumWallet.prototype, 'fetchBalance').mockRejectedValue(error);
    const discovered = jest.fn();
    await expect(startMarsImport(mnemonic, false, false, jest.fn(), discovered, jest.fn()).promise).rejects.toBe(error);
    expect(error.name).not.toBe('RecoveryInputError');
    expect(discovered).not.toHaveBeenCalled();
  });

  it('does not import after leaving discovery while a balance request is pending', async () => {
    let finishBalance;
    jest.spyOn(MarsElectrumWallet.prototype, 'fetchBalance').mockImplementation(
      () =>
        new Promise(resolve => {
          finishBalance = resolve;
        }),
    );
    const discovered = jest.fn();
    const task = startMarsImport(mnemonic, false, false, jest.fn(), discovered, jest.fn());
    task.stop();
    finishBalance();
    expect(await task.promise).toEqual({
      cancelled: true,
      stopped: true,
      wallets: [],
    });
    expect(discovered).not.toHaveBeenCalled();
  });
});

describe('Marscoin receive and change discovery', () => {
  it('skips used change addresses and retains the selected index', async () => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    MARSConnection.getTransactionsByAddress.mockResolvedValueOnce([{ tx_hash: 'used' }]).mockResolvedValueOnce([]);
    expect(await wallet.getChangeAddressAsync()).toBe(wallet._getInternalAddressByIndex(1));
    expect(wallet.next_free_change_address_index).toBe(1);
  });
  it('does not treat a network failure as an unused change address', async () => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    MARSConnection.getTransactionsByAddress.mockRejectedValueOnce(new Error('offline'));
    await expect(wallet.getChangeAddressAsync()).rejects.toThrow();
    expect(wallet.next_free_change_address_index).toBe(0);
  });
  it('budgets the application record in the signed transaction fee', async () => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    const address = wallet._getExternalAddressByIndex(0);
    const previous = new bitcoin.Transaction();
    previous.addInput(Buffer.alloc(32, 1), 0);
    previous.addOutput(bitcoin.address.toOutputScript(address, Marscoin.mainnet), 1000000);
    MARSConnection.getTxHex.mockResolvedValue(previous.toHex());
    const utxo = [{ txId: previous.getId(), vout: 0, address, value: 1000000 }];
    const message = 'GP_' + 'Qm' + 'a'.repeat(44);
    const { tx, fee } = await wallet.createTransaction(utxo, [{ address }], 3, address, 0xffffffff, false, undefined, message);
    expect(tx.ins[0].sequence).toBe(0xffffffff);
    expect(tx.outs.reduce((total, out) => total + out.value, 0) + fee).toBe(1000000);
    expect(fee).toBeGreaterThanOrEqual(tx.virtualSize() * 3);
    expect(bitcoin.script.decompile(tx.outs[1].script)[1].toString()).toBe(message);
    expect(fee).toBeLessThan((tx.virtualSize() + 5) * 3);
  });
  it('finds a civic wallet too poor for the fee before the application is uploaded', async () => {
    const wallet = new MarsElectrumWallet();
    wallet.setSecret(mnemonic);
    wallet.civic = true;
    const address = wallet._getExternalAddressByIndex(0);
    const previous = new bitcoin.Transaction();
    previous.addInput(Buffer.alloc(32, 1), 0);
    previous.addOutput(bitcoin.address.toOutputScript(address, Marscoin.mainnet), 1000000);
    MARSConnection.getTxHex.mockResolvedValue(previous.toHex());
    let coins = [{ txId: previous.getId(), vout: 0, address, value: 300 }];
    wallet.fetchBalance = jest.fn();
    wallet.fetchUtxo = jest.fn();
    wallet.getUtxo = () => coins;
    const draft = {};
    const options = {
      wallet,
      data: { message: 'Synthetic test' },
      prefix: 'GP_',
      feeRate: 3,
      pin: jest.fn(async () => 'Qm' + 'a'.repeat(44)),
      readDraft: async () => draft,
      saveDraft: jest.fn(async (_address, patch) => Object.assign(draft, patch)),
    };
    const error = await prepareCivicPublication(options).catch(e => e);
    expect(isInsufficientFunds(error)).toBe(true);
    expect(options.pin).not.toHaveBeenCalled();
    // The same wallet with enough coins passes the check and signs.
    coins = [{ txId: previous.getId(), vout: 0, address, value: 1000000 }];
    const publication = await prepareCivicPublication(options);
    expect(options.pin).toHaveBeenCalledTimes(1);
    expect(publication.status).toBe('prepared');
    expect(publication.fee).toBeGreaterThan(0);
  });
});

it('clears address and signing caches when the recovery passphrase changes', () => {
  const wallet = new MarsElectrumWallet();
  wallet.setSecret(mnemonic);
  const original = wallet._getExternalAddressByIndex(0);
  wallet._getExternalWIFByIndex(0);
  wallet.setPassphrase('TREZOR');
  expect(wallet._getExternalAddressByIndex(0)).toBe('MBbwMspsHb7qWKjam7umw1t3mF8mRXR6jB');
  expect(wallet._getExternalAddressByIndex(0)).not.toBe(original);
  const key = bitcoin.ECPair.fromWIF(wallet._getExternalWIFByIndex(0), Marscoin.mainnet);
  expect(bitcoin.payments.p2pkh({ pubkey: key.publicKey, network: Marscoin.mainnet }).address).toBe(wallet.getAddress());
});
