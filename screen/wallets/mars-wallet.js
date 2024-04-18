import BigNumber from "bignumber.js";
import { Marscoin } from "../../blue_modules/constants";
import { BitcoinUnit } from "../../models/bitcoinUnits";
import { randomBytes } from "../../class/rng";
import { AbstractHDElectrumWallet } from "../../class/wallets/abstract-hd-electrum-wallet";
import { HDLegacyP2PKHWallet } from "../../class";
import { getUniqueId } from "react-native-device-info";
const ecc = require('tiny-secp256k1');
const bip32 = require('bip32');
const BIP32Factory = require('bip32').BIP32Factory;

// Create a bip32 instance using the factory
const bip32Instance = BIP32Factory(ecc);

// import { checkReporting } from "../../blue_modules/balanceAnalytics";
// import checkReporting

const MARSConnection = require("../../blue_modules/MARSConnection");

const bip39 = require("bip39");
const bip84 = require("bip84");
const HDNode = require("bip32");

const litecore = require("litecore-lib");
const coinSelect = require("coinselect");
const coinSelectSplit = require("coinselect/split");
const bitcoin = require("bitcoinjs-lib");

export class MarsElectrumWallet extends HDLegacyP2PKHWallet {
  static NETWORK = "MARS";
  static type = "marscoin";
  static typeReadable = "Marscoin";
  static chain = BitcoinUnit.MARS;

  constructor(props) {
    super();
    this._txs_by_external_index = {};
    this._txs_by_internal_index = {};
    this._utxo = [];
    this.type = "marscoin";

    this.pending_transactions_raw = [];
    this.spent_transactions_raw = [];
    this.transactions_raw = [];

    // Testing
    this.next_free_address_index = 0;
    this.next_free_change_address_index = 0;
    this.internal_addresses_cache = {};
    this.external_addresses_cache = {};
    this.gap_limit = 20;
    this._balances_by_external_index = {};
    this._balances_by_internal_index = {};
    this._address_to_wif_cache = {};

    this.preferredBalanceUnit = BitcoinUnit.MARS;
  }

  timeToRefreshBalance() {
    if (+new Date() - this._lastBalanceFetch >= 5 * 60 * 1000) {
      return true;
    }
    return false;
  }

  timeToRefreshTransaction() {
    for (const tx of this.getTransactions()) {
      if (
        tx?.confirmations < 7 &&
        this._lastTxFetch < +new Date() - 5 * 60 * 1000
      ) {
        return true;
      }
      return false;
    }
  }

  async generate() {
    console.log("GENERATING MARS WALLET NOW!!!");
    const buf = await randomBytes(16);
    this.secret = bip39.entropyToMnemonic(buf.toString("hex"));
    console.log('secret: ', this.secret);
  }

  getAddress() {
    // console.log('==== [MARS] getAddress ====');
    return this._address;
  }

  async getAddressAsync() {
    console.log(`==== [AHD] GetAddressAsync() ====`);
    // looking for free external address
    let freeAddress = "";
    let c;
    for (c = 0; c < this.gap_limit + 1; c++) {
      if (this.next_free_address_index + c < 0) continue;
      const address = this._getExternalAddressByIndex(
        this.next_free_address_index + c
      );
      this.external_addresses_cache[this.next_free_address_index + c] = address; // updating cache just for any case
      let txs = [];
      try {
        txs = await MARSConnection.getTransactionsByAddress(address);
      } catch (Err) {
        console.warn("MarsConnection.getTransactionsByAddress()", Err.message);
      }
      if (txs.length === 0) {
        // found free address
        freeAddress = address;
        this.next_free_address_index += c; // now points to _this one_
        break;
      }
    }

    if (!freeAddress) {
      // could not find in cycle above, give up
      freeAddress = this._getExternalAddressByIndex(
        this.next_free_address_index + c
      ); // we didnt check this one, maybe its free
      this.next_free_address_index += c; // now points to this one
    }
    this._address = freeAddress;
    return freeAddress;
  }

  getNextFreeAddressIndex() {
    return this.next_free_address_index;
  }

  getNextFreeChangeAddressIndex() {
    return this.next_free_change_address_index;
  }

  getNetwork() {
    return BitcoinUnit.MARS;
  }

  getDerivationPath() {
    return "m/44'/2'/0'";
  }

  getLatestTransactionTime() {
    if (this.getTransactions().length === 0) {
      return 0;
    }
    let max = 0;
    for (const tx of this.getTransactions()) {
      max = Math.max(new Date(tx.received) * 1, max);
    }
    return new Date(max).toString();
  }

  getPreferredBalanceUnit() {
    for (const value of Object.values(BitcoinUnit)) {
      if (value === this.preferredBalanceUnit) {
        //console.log('this.preferredBalanceUnit', this.preferredBalanceUnit)
        return this.preferredBalanceUnit;
        // console.log('this.preferredBalanceUnit', this.preferredBalanceUnit)
      }
    }
    return BitcoinUnit.MARS;
  }

  checkValidity() {
    console.log(`==== [MARS] Checking Validity ====`);
  }

  validateMnemonic() {
    // console.log('==== [MARS] ValidateMnemonic ====');
    return bip39.validateMnemonic(this.secret);
  }

  setSecret(newSecret) {
    this.secret = newSecret.trim().toLowerCase();
    this.secret = this.secret
      .replace(/[^a-zA-Z0-9]/g, " ")
      .replace(/\s+/g, " ");
    return this;
  }

  /**
   * @return {Buffer} wallet seed
   */
  _getSeed() {
    const mnemonic = this.secret;
    const passphrase = this.passphrase;
    return bip39.mnemonicToSeedSync(mnemonic, passphrase);
  }

  getXpub() {
    console.log("==== [MARS] GetXPub()");
    // Cache
    if (this._xpub) {
      console.log("this._xpub", this._xpub);
      return this._xpub; // cache hit
    }
    const seed = this._getSeed();
    console.log("seed", seed);
    console.log('SEEEEEEED!!!',seed)
    const root = bitcoin.bip32.fromSeed(seed, Marscoin.mainnet);

    const path = this.getDerivationPath();
    const child = root.derivePath(path).neutered();
    this._xpub = child.toBase58();

    return this._xpub;
  }

  nodeToLegacyAddress(hdNode) {
    return bitcoin.payments.p2pkh({
      pubkey: hdNode.publicKey,
      network: Marscoin.mainnet,
    }).address;
  }

  _getExternalAddressByIndex(index) {
    // console.log(" ==== [MARS] getExternalAddressByIndex ====");
    return this._getNodeAddressByIndex(0, index);
  }

  _getInternalAddressByIndex(index) {
    // console.log("==== [MARS] getInternalAddressByIndex ====");
    return this._getNodeAddressByIndex(1, index);
  }

  _getNodeAddressByIndex(node, index) {
    // console.log("==== [MARS] getNodeAddressByIndex ====");
    index = index * 1; // cast to int

    if (node === 0) {
      if (this.external_addresses_cache[index])
        return this.external_addresses_cache[index]; // cache hit
    }

    if (node === 1) {
      if (this.internal_addresses_cache[index])
        return this.internal_addresses_cache[index]; // cache hit
    }

    if (node === 0 && !this._node0) {
      const xpub = this.getXpub();
      // console.log('HDNode!!!',HDNode)
      const hdNode = bip32Instance.fromBase58(xpub, Marscoin.mainnet);
      this._node0 = hdNode.derive(node);
    }

    if (node === 1 && !this._node1) {
      console.log('Hnode === 1')
      const xpub = this.getXpub();
      console.log('this.xpub!!!',xpub)
      const hdNode = bip32Instance.fromBase58(xpub, Marscoin.mainnet);
      this._node1 = hdNode.derive(node);
    }

    let address;
    if (node === 0) {
      address = this.nodeToLegacyAddress(this._node0.derive(index));
    }

    if (node === 1) {
      address = this.nodeToLegacyAddress(this._node1.derive(index));
    }

    if (node === 0) {
      return (this.external_addresses_cache[index] = address);
    }

    if (node === 1) {
      return (this.internal_addresses_cache[index] = address);
    }
  }

  async getChangeAddressAsync() {
    console.log("[MARS WALLET - getChangeAddressAsync] Not implemented");
    throw new Error("Not implemented");
  }

  async fetchBalance() {
    console.log("==== [MARS] fetchBalance() ====");
    try {
      if (
        this.next_free_change_address_index === 0 &&
        this.next_free_address_index === 0
      ) {
        // doing binary search for last used address:
        this.next_free_change_address_index =
          await this._binarySearchIterationForInternalAddress(1000);
        this.next_free_address_index =
          await this._binarySearchIterationForExternalAddress(1000);
      } // end rescanning fresh wallet

      // finally fetching balance
      await this._fetchBalance();
    } catch (err) {
      console.warn(err);
    }
  }

  getBalance() {
    // console.log('==== [MARS] GetBalance() ====');
    let ret = 0;
    for (const bal of Object.values(this._balances_by_external_index)) {
      ret += bal.c;
    }
    for (const bal of Object.values(this._balances_by_internal_index)) {
      ret += bal.c;
    }

    return (
      ret +
      (this.getUnconfirmedBalance() < 0 ? this.getUnconfirmedBalance() : 0)
    );
  }

  async _fetchBalance() {
    console.log('==== [MARS] _fetchBalance() ====');
    // probing future addressess in hierarchy whether they have any transactions, in case
    // our 'next free addr' pointers are lagging behind
    // for that we are gona batch fetch history for all addresses between last used and last used + gap_limit

    const lagAddressesToFetch = [];
    for (
      let c = this.next_free_address_index;
      c < this.next_free_address_index + this.gap_limit;
      c++
    ) {
      lagAddressesToFetch.push(this._getExternalAddressByIndex(c));
    }
    for (
      let c = this.next_free_change_address_index;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      lagAddressesToFetch.push(this._getInternalAddressByIndex(c));
    }

    const txs =
      await MARSConnection.multiGetHistoryByAddress(lagAddressesToFetch); // <------ electrum call

    for (
      let c = this.next_free_address_index;
      c < this.next_free_address_index + this.gap_limit;
      c++
    ) {
      const address = this._getExternalAddressByIndex(c);
      if (
        txs[address] &&
        Array.isArray(txs[address]) &&
        txs[address].length > 0
      ) {
        // whoa, someone uses our wallet outside! better catch up
        this.next_free_address_index = c + 1;
      }
    }

    for (
      let c = this.next_free_change_address_index;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      const address = this._getInternalAddressByIndex(c);
      if (
        txs[address] &&
        Array.isArray(txs[address]) &&
        txs[address].length > 0
      ) {
        // whoa, someone uses our wallet outside! better catch up
        this.next_free_change_address_index = c + 1;
      }
    }

    // next, business as usuall. fetch balances

    const addresses2fetch = [];

    // generating all involved addresses.
    // basically, refetch all from index zero to maximum. doesnt matter
    // since we batch them 100 per call

    // external
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      addresses2fetch.push(this._getExternalAddressByIndex(c));
    }

    // internal
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      addresses2fetch.push(this._getInternalAddressByIndex(c));
    }

    const balances =
      await MARSConnection.multiGetBalanceByAddress(addresses2fetch);
    // console.log('balanceReturn');
    // console.log(balances);

    // converting to a more compact internal format
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      const addr = this._getExternalAddressByIndex(c);
      if (balances.addresses[addr]) {
        // first, if balances differ from what we store - we delete transactions for that
        // address so next fetchTransactions() will refetch everything
        if (this._balances_by_external_index[c]) {
          if (
            this._balances_by_external_index[c].c !==
              balances.addresses[addr].confirmed ||
            this._balances_by_external_index[c].u !==
              balances.addresses[addr].unconfirmed
          ) {
            delete this._txs_by_external_index[c];
          }
        }
        // update local representation of balances on that address:
        this._balances_by_external_index[c] = {
          c: balances.addresses[addr].confirmed,
          u: balances.addresses[addr].unconfirmed,
        };
      }
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      const addr = this._getInternalAddressByIndex(c);
      if (balances.addresses[addr]) {
        // first, if balances differ from what we store - we delete transactions for that
        // address so next fetchTransactions() will refetch everything
        if (this._balances_by_internal_index[c]) {
          if (
            this._balances_by_internal_index[c].c !==
              balances.addresses[addr].confirmed ||
            this._balances_by_internal_index[c].u !==
              balances.addresses[addr].unconfirmed
          ) {
            delete this._txs_by_internal_index[c];
          }
        }
        // update local representation of balances on that address:
        this._balances_by_internal_index[c] = {
          c: balances.addresses[addr].confirmed,
          u: balances.addresses[addr].unconfirmed,
        };
      }
    }

    // checkReporting(this.getBalance(), BitcoinUnit.MARS);

    this._lastBalanceFetch = +new Date();
  }

  /**
   * Validates any address, including legacy, p2sh and bech32
   *
   * @param address
   * @returns {boolean}
   */
  isAddressValid(address) {
    try {
      bitcoin.address.toOutputScript(address, Marscoin.mainnet);
      return true;
    } catch (e) {
      return false;
    }
  }

  coinselect(utxos, targets, feeRate, changeAddress) {
    // console.log('==== [MARS] coinSelect ====');
    // console.log(
    //   "coinSelect w/" + JSON.stringify(targets) + " " + changeAddress
    // );
    if (!changeAddress) throw new Error("No change address provided!");

    let algo = coinSelect;
    if (targets.some((i) => !("value" in i))) {
      algo = coinSelectSplit;
    }

    const { inputs, outputs, fee } = algo(utxos, targets, feeRate);

    console.log("INPUTS:", inputs)
    console.log("OUTPUTS:", outputs)
    console.log("FEE", fee)

    if (!inputs || !outputs) {
      throw new Error("Not enough balance");
    }

    return { inputs, outputs, fee };
  }

  getNextFreeAddressIndex() {
    return this.next_free_address_index;
  }

  getUtxo(respectFrozen = false) {
    console.log("==== [MARS] getUtxo ===");
    let ret = [];

    if (this._utxo.length === 0) {
      ret = this.getDerivedUtxoFromOurTransaction(); // oy vey, no stored utxo. lets attempt to derive it from stored transactions
    } else {
      ret = this._utxo;
    }
    if (!respectFrozen) {
      ret = ret.filter(
        ({ txid, vout }) => !this.getUTXOMetadata(txid, vout).frozen
      );
    }
    // console.log("-- [getUtxo] " + JSON.stringify(ret));
    return ret;
  }

  weOwnAddress(address) {
    if (!address) return false;
    const cleanAddress = address;

    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      if (this._getExternalAddressByIndex(c) === cleanAddress) return true;
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      if (this._getInternalAddressByIndex(c) === cleanAddress) return true;
    }
    return false;
  }

  getDerivedUtxoFromOurTransaction(returnSpentUtxoAsWell = false) {
    console.log("==== [MARS] getDerivedUtxoFromOurTransaction ====");
    const utxos = [];

    // its faster to pre-build hashmap of owned addresses than to query `this.weOwnAddress()`, which in turn
    // iterates over all addresses in hierarchy
    const ownedAddressesHashmap = {};
    for (let c = 0; c < this.next_free_address_index + 1; c++) {
      ownedAddressesHashmap[this._getExternalAddressByIndex(c)] = true;
    }
    for (let c = 0; c < this.next_free_change_address_index + 1; c++) {
      ownedAddressesHashmap[this._getInternalAddressByIndex(c)] = true;
    }

    for (const tx of this.getTransactions()) {
      for (const output of tx.outputs) {
        console.log("hello:",output);
        let address = false;
        if (
          output.scriptPubKey &&
          output.scriptPubKey.addresses &&
          output.scriptPubKey.addresses[0]
        ) {
          address = output.scriptPubKey.addresses[0];
        }
        if (ownedAddressesHashmap[address]) {
          const value = new BigNumber(output.value)
            .multipliedBy(100000000)
            .toNumber();
          utxos.push({
            txid: tx.txid,
            txId: tx.txid,
            hex: tx.hex,
            vout: output.n,
            address,
            value,
            amount: value,
            confirmations: tx.confirmations,
            wif: false,
            height:
              MARSConnection.estimateCurrentBlockheight() - tx.confirmations,
          });
        }
      }
    }

    if (returnSpentUtxoAsWell) return utxos;

    // got all utxos we ever had. lets filter out the ones that are spent:
    const ret = [];
    for (const utxo of utxos) {
      let spent = false;
      for (const tx of this.getTransactions()) {
        for (const input of tx.inputs) {
          if (input.txid === utxo.txid && input.vout === utxo.vout)
            spent = true;
          // utxo we got previously was actually spent right here ^^
        }
      }

      if (!spent) {
        // filling WIFs only for legit unspent UTXO, as it is a slow operation
        utxo.wif = this._getWifForAddress(utxo.address);
        ret.push(utxo);
      }
    }

    return ret;
  }

  _getExternalWIFByIndex(index) {
    console.log("==== [AHD-Electrum] GetExternalWIFByIndex() ====");
    return this._getWIFByIndex(false, index);
  }

  _getInternalWIFByIndex(index) {
    return this._getWIFByIndex(true, index);
  }

  _getWIFByIndex(internal, index) {
    console.log(
      "==== [MARS] GetWifByIndex() ==== index: " + index + " " + internal
    );
    try {
      const seed = this._getSeed(); // Make sure this returns a Buffer
      const network = Marscoin.mainnet; // Using Marscoin network definitions
      const root = bitcoin.bip32.fromSeed(seed, Marscoin.mainnet);
      //const root = bip32.fromSeed(seed, network); // Use the Marscoin network configuration
      const path = `m/44'/${network.bip44}'/0'/${internal ? 1 : 0}/${index}`;
      const child = root.derivePath(path);
      return child.toWIF();
  } catch (error) {
      console.error('Error deriving WIF:', error);
      return false;
  }
    // if (!this.secret) return false;
    // const seed = this._getSeed();
    // //const root = HDNode.fromSeed(seed, Marscoin.mainnet);
    // const root = bitcoin.bip32.fromSeed(seed, Marscoin.mainnet);
    // const path = `m/44'/2'/0'/${internal ? 1 : 0}/${index}`;
    // const child = root.derivePath(path);
    // return child.toWIF();
  }

  _getWifForAddress(address) {
    console.log("==== [MARS] _getWifForAddress ====");
    if (this._address_to_wif_cache[address])
      return this._address_to_wif_cache[address]; // cache hit

    // fast approach, first lets iterate over all addressess we have in cache
    for (const index of Object.keys(this.internal_addresses_cache)) {
      if (this._getInternalAddressByIndex(index) === address) {
        return (this._address_to_wif_cache[address] =
          this._getInternalWIFByIndex(index));
      }
    }

    for (const index of Object.keys(this.external_addresses_cache)) {
      if (this._getExternalAddressByIndex(index) === address) {
        return (this._address_to_wif_cache[address] =
          this._getExternalWIFByIndex(index));
      }
    }

    // no luck - lets iterate over all addresses we have up to first unused address index
    for (
      let c = 0;
      c <= this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      const possibleAddress = this._getInternalAddressByIndex(c);
      if (possibleAddress === address) {
        return (this._address_to_wif_cache[address] =
          this._getInternalWIFByIndex(c));
      }
    }

    for (let c = 0; c <= this.next_free_address_index + this.gap_limit; c++) {
      const possibleAddress = this._getExternalAddressByIndex(c);
      if (possibleAddress === address) {
        return (this._address_to_wif_cache[address] =
          this._getExternalWIFByIndex(c));
      }
    }

    throw new Error("Could not find WIF for " + address);
  }

  async fetchUtxo() {
    // fetching utxo of addresses that only have some balance
    let addressess = [];

    // considering confirmed balance:
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      if (
        this._balances_by_external_index[c] &&
        this._balances_by_external_index[c].c &&
        this._balances_by_external_index[c].c > 0
      ) {
        addressess.push(this._getExternalAddressByIndex(c));
      }
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      if (
        this._balances_by_internal_index[c] &&
        this._balances_by_internal_index[c].c &&
        this._balances_by_internal_index[c].c > 0
      ) {
        addressess.push(this._getInternalAddressByIndex(c));
      }
    }

    // considering UNconfirmed balance:
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      if (
        this._balances_by_external_index[c] &&
        this._balances_by_external_index[c].u &&
        this._balances_by_external_index[c].u > 0
      ) {
        addressess.push(this._getExternalAddressByIndex(c));
      }
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      if (
        this._balances_by_internal_index[c] &&
        this._balances_by_internal_index[c].u &&
        this._balances_by_internal_index[c].u > 0
      ) {
        addressess.push(this._getInternalAddressByIndex(c));
      }
    }

    // note: we could remove checks `.c` and `.u` to simplify code, but the resulting `addressess` array would be bigger, thus bigger batch
    // to fetch (or maybe even several fetches), which is not critical but undesirable.
    // anyway, result has `.confirmations` property for each utxo, so outside caller can easily filter out unconfirmed if he wants to

    addressess = [...new Set(addressess)]; // deduplicate just for any case

    const fetchedUtxo = await MARSConnection.multiGetUtxoByAddress(addressess);
    this._utxo = [];
    for (const arr of Object.values(fetchedUtxo)) {
      console.log(arr);
      this._utxo = this._utxo.concat(arr);
    }

    // backward compatibility TODO: remove when we make sure `.utxo` is not used
    this.utxo = this._utxo;
    // this belongs in `.getUtxo()`
    for (const u of this.utxo) {
      // console.log("-- [fetchUtxo] utxo " + JSON.stringify(u));
      u.txid = u.txId;
      u.hex = u.hex;
      u.amount = u.value;
      u.wif = this._getWifForAddress(u.address);
      if (!u.confirmations && u.height)
        u.confirmations =
          MARSConnection.estimateCurrentBlockheight() - u.height;
    }

    this.utxo = this.utxo.sort((a, b) => a.amount - b.amount);
  }

  async fetchTransactions() {
    console.log("==== [MARS] fetchTransactions() ====");
    // if txs are absent for some internal address in hierarchy - this is a sign
    // we should fetch txs for that address
    // OR if some address has unconfirmed balance - should fetch it's txs
    // OR some tx for address is unconfirmed
    // OR some tx has < 7 confirmations

    // fetching transactions in batch: first, getting batch history for all addresses,
    // then batch fetching all involved txids
    // finally, batch fetching txids of all inputs (needed to see amounts & addresses of those inputs)
    // then we combine it all together

    const addresses2fetch = [];

    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      // external addresses first
      let hasUnconfirmed = false;
      this._txs_by_external_index[c] = this._txs_by_external_index[c] || [];
      for (const tx of this._txs_by_external_index[c])
        hasUnconfirmed =
          hasUnconfirmed || !tx.confirmations || tx.confirmations < 7;

      if (
        hasUnconfirmed ||
        this._txs_by_external_index[c].length === 0 ||
        this._balances_by_external_index[c].u !== 0
      ) {
        addresses2fetch.push(this._getExternalAddressByIndex(c));
      }
    }

    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      // next, internal addresses
      let hasUnconfirmed = false;
      this._txs_by_internal_index[c] = this._txs_by_internal_index[c] || [];
      for (const tx of this._txs_by_internal_index[c])
        hasUnconfirmed =
          hasUnconfirmed || !tx.confirmations || tx.confirmations < 7;

      if (
        hasUnconfirmed ||
        this._txs_by_internal_index[c].length === 0 ||
        this._balances_by_internal_index[c].u !== 0
      ) {
        addresses2fetch.push(this._getInternalAddressByIndex(c));
      }
    }

    // first: batch fetch for all addresses histories
    const histories =
      await MARSConnection.multiGetHistoryByAddress(addresses2fetch);
    const txs = {};
    for (const history of Object.values(histories)) {
      for (const tx of history) {
        txs[tx.tx_hash] = tx;
      }
    }

    // next, batch fetching each txid we got
    const txdatas = await MARSConnection.multiGetTransactionByTxid(
      //console.log('=)))))))))))', multiGetTransactionByTxid),
      Object.keys(txs)
    );

    // now, tricky part. we collect all transactions from inputs (vin), and batch fetch them too.
    // then we combine all this data (we need inputs to see source addresses and amounts)
    const vinTxids = [];
    for (const txdata of Object.values(txdatas)) {
      for (const vin of txdata.vin) {
        vinTxids.push(vin.txid);
      }
    }
    const vintxdatas = await MARSConnection.multiGetTransactionByTxid(vinTxids);

    // fetched all transactions from our inputs. now we need to combine it.
    // iterating all _our_ transactions:
    for (const txid of Object.keys(txdatas)) {
      // iterating all inputs our our single transaction:
      for (let inpNum = 0; inpNum < txdatas[txid].vin.length; inpNum++) {
        const inpTxid = txdatas[txid].vin[inpNum].txid;
        const inpVout = txdatas[txid].vin[inpNum].vout;
        // got txid and output number of _previous_ transaction we shoud look into
        if (vintxdatas[inpTxid] && vintxdatas[inpTxid].vout[inpVout]) {
          // extracting amount & addresses from previous output and adding it to _our_ input:
          txdatas[txid].vin[inpNum].addresses =
            vintxdatas[inpTxid].vout[inpVout].scriptPubKey.addresses;
          txdatas[txid].vin[inpNum].value =
            vintxdatas[inpTxid].vout[inpVout].value;
        }
      }
    }

    // now purge all unconfirmed txs from internal hashmaps, since some may be evicted from mempool because they became invalid
    // or replaced. hashmaps are going to be re-populated anyways, since we fetched TXs for addresses with unconfirmed TXs
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      this._txs_by_external_index[c] = this._txs_by_external_index[c].filter(
        (tx) => !!tx.confirmations
      );
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      this._txs_by_internal_index[c] = this._txs_by_internal_index[c].filter(
        (tx) => !!tx.confirmations
      );
    }

    // now, we need to put transactions in all relevant `cells` of internal hashmaps: this._txs_by_internal_index && this._txs_by_external_index

    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      for (const tx of Object.values(txdatas)) {
        for (const vin of tx.vin) {
          if (
            vin.addresses &&
            vin.addresses.indexOf(this._getExternalAddressByIndex(c)) !== -1
          ) {
            // this TX is related to our address
            this._txs_by_external_index[c] =
              this._txs_by_external_index[c] || [];
            const clonedTx = Object.assign({}, tx);
            clonedTx.inputs = tx.vin.slice(0);
            clonedTx.outputs = tx.vout.slice(0);
            delete clonedTx.vin;
            delete clonedTx.vout;

            // trying to replace tx if it exists already (because it has lower confirmations, for example)
            let replaced = false;
            for (let cc = 0; cc < this._txs_by_external_index[c].length; cc++) {
              if (this._txs_by_external_index[c][cc].txid === clonedTx.txid) {
                replaced = true;
                this._txs_by_external_index[c][cc] = clonedTx;
              }
            }
            if (!replaced) this._txs_by_external_index[c].push(clonedTx);
          }
        }
        for (const vout of tx.vout) {
          if (
            vout.scriptPubKey.addresses &&
            vout.scriptPubKey.addresses.indexOf(
              this._getExternalAddressByIndex(c)
            ) !== -1
          ) {
            // this TX is related to our address
            this._txs_by_external_index[c] =
              this._txs_by_external_index[c] || [];
            const clonedTx = Object.assign({}, tx);
            clonedTx.inputs = tx.vin.slice(0);
            clonedTx.outputs = tx.vout.slice(0);
            delete clonedTx.vin;
            delete clonedTx.vout;

            // trying to replace tx if it exists already (because it has lower confirmations, for example)
            let replaced = false;
            for (let cc = 0; cc < this._txs_by_external_index[c].length; cc++) {
              if (this._txs_by_external_index[c][cc].txid === clonedTx.txid) {
                replaced = true;
                this._txs_by_external_index[c][cc] = clonedTx;
              }
            }
            if (!replaced) this._txs_by_external_index[c].push(clonedTx);
          }
        }
      }
    }

    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      for (const tx of Object.values(txdatas)) {
        for (const vin of tx.vin) {
          if (
            vin.addresses &&
            vin.addresses.indexOf(this._getInternalAddressByIndex(c)) !== -1
          ) {
            // this TX is related to our address
            this._txs_by_internal_index[c] =
              this._txs_by_internal_index[c] || [];
            const clonedTx = Object.assign({}, tx);
            clonedTx.inputs = tx.vin.slice(0);
            clonedTx.outputs = tx.vout.slice(0);
            delete clonedTx.vin;
            delete clonedTx.vout;

            // trying to replace tx if it exists already (because it has lower confirmations, for example)
            let replaced = false;
            for (let cc = 0; cc < this._txs_by_internal_index[c].length; cc++) {
              if (this._txs_by_internal_index[c][cc].txid === clonedTx.txid) {
                replaced = true;
                this._txs_by_internal_index[c][cc] = clonedTx;
              }
            }
            if (!replaced) this._txs_by_internal_index[c].push(clonedTx);
          }
        }
        for (const vout of tx.vout) {
          if (
            vout.scriptPubKey.addresses &&
            vout.scriptPubKey.addresses.indexOf(
              this._getInternalAddressByIndex(c)
            ) !== -1
          ) {
            // this TX is related to our address
            this._txs_by_internal_index[c] =
              this._txs_by_internal_index[c] || [];
            const clonedTx = Object.assign({}, tx);
            clonedTx.inputs = tx.vin.slice(0);
            clonedTx.outputs = tx.vout.slice(0);
            delete clonedTx.vin;
            delete clonedTx.vout;

            // trying to replace tx if it exists already (because it has lower confirmations, for example)
            let replaced = false;
            for (let cc = 0; cc < this._txs_by_internal_index[c].length; cc++) {
              if (this._txs_by_internal_index[c][cc].txid === clonedTx.txid) {
                replaced = true;
                this._txs_by_internal_index[c][cc] = clonedTx;
              }
            }
            if (!replaced) this._txs_by_internal_index[c].push(clonedTx);
          }
        }
      }
    }

    console.log(JSON.stringify(this._txs_by_external_index));
    console.log(JSON.stringify(this._txs_by_internal_index));

    this._lastTxFetch = +new Date();
  }

  getTransactions() {
    // console.log("==== [MARS] getTransactions ====");
    let txs = [];
    //console.log("==== [MARS] getTransactions", this._address);
    // console.log("Initial external transactions index:", JSON.stringify(this._txs_by_external_index));
    // console.log("Initial internal transactions index:", JSON.stringify(this._txs_by_internal_index));

    for (const [address, addressTxs] of Object.entries(this._txs_by_external_index)) {
      //console.log(`Transactions for external address ${address}:`, JSON.stringify(addressTxs));
      txs = txs.concat(addressTxs);
    }
    for (const [address, addressTxs] of Object.entries(this._txs_by_internal_index)) {
      //console.log(`Transactions for internal address ${address}:`, JSON.stringify(addressTxs));
      txs = txs.concat(addressTxs);
    }

    for (const addressTxs of Object.values(this._txs_by_external_index)) {
      txs = txs.concat(addressTxs);
      //console.log('txs_by_external_index',this._txs_by_external_index)
    }
    for (const addressTxs of Object.values(this._txs_by_internal_index)) {
      txs = txs.concat(addressTxs);
     // console.log('txs_by_internal_index')
    }
    //console.log('!!!!!!  txs.length', txs.length)
    if (txs.length === 0) return []; // guard clause; so we wont spend time calculating addresses
    if (txs.length === 0) console.log('!!!!!!  txs.length === 0')
    // its faster to pre-build hashmap of owned addresses than to query `this.weOwnAddress()`, which in turn
    // iterates over all addresses in hierarchy
    const ownedAddressesHashmap = {};
    for (let c = 0; c < this.next_free_address_index + 1; c++) {
      ownedAddressesHashmap[this._getExternalAddressByIndex(c)] = true;
    }
    for (let c = 0; c < this.next_free_change_address_index + 1; c++) {
      ownedAddressesHashmap[this._getInternalAddressByIndex(c)] = true;
    }
    // hack: in case this code is called from LegacyWallet:
    if (this.getAddress()) ownedAddressesHashmap[this.getAddress()] = true;

    const ret = [];
    for (const tx of txs) {
      // console.log("-- [getTX] " + JSON.stringify(tx));
      tx.received = tx.blocktime * 1000;
      if (!tx.blocktime) tx.received = +new Date() - 30 * 1000; // unconfirmed
      tx.confirmations = tx.confirmations || 0; // unconfirmed
      tx.hash = tx.txid;
      tx.value = 0;
      tx.hex = tx.hex;

      for (const vin of tx.inputs) {
        // if input (spending) goes from our address - we are loosing!
        if (
          (vin.address && ownedAddressesHashmap[vin.address]) ||
          (vin.addresses &&
            vin.addresses[0] &&
            ownedAddressesHashmap[vin.addresses[0]])
        ) {
          tx.value -= new BigNumber(vin.value)
            .multipliedBy(100000000)
            .toNumber();
        }
      }

      for (const vout of tx.outputs) {
        // when output goes to our address - this means we are gaining!
        if (
          vout.scriptPubKey.addresses &&
          vout.scriptPubKey.addresses[0] &&
          ownedAddressesHashmap[vout.scriptPubKey.addresses[0]]
        ) {
          tx.value += new BigNumber(vout.value)
            .multipliedBy(100000000)
            .toNumber();
        }
      }
      ret.push(tx);
    }

    // now, deduplication:
    const usedTxIds = {};
    const ret2 = [];
    for (const tx of ret) {
      if (!usedTxIds[tx.txid]) ret2.push(tx);
      usedTxIds[tx.txid] = 1;
    }

    // console.log("-- [getTx] " + JSON.stringify(ret2));

    return ret2.sort(function (a, b) {
      return b.received - a.received;
    });
  }

  /**
   *
   * @param address {string} Address that belongs to this wallet
   * @returns {Buffer|boolean} Either buffer with pubkey or false
   */
  _getPubkeyByAddress(address) {
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      if (this._getExternalAddressByIndex(c) === address)
        return this._getNodePubkeyByIndex(0, c);
    }

    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      if (this._getInternalAddressByIndex(c) === address)
        return this._getNodePubkeyByIndex(1, c);
    }

    return false;
  }

  _getDerivationPathByAddress(address, BIP = 44) {
    const path = `m/${BIP}'/2'/0'`;
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      if (this._getExternalAddressByIndex(c) === address)
        return path + "/0/" + c;
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      if (this._getInternalAddressByIndex(c) === address)
        return path + "/1/" + c;
    }

    return false;
  }

  _getNodePubkeyByIndex(node, index) {
    console.log("==== [MARS] GetNodePubKeyByIndex()");
    //const xpub = this.constructor._zpubToXpub(this.getXpub());
    index = index * 1; // cast to int
    console.log("this wallet", this.constructor);
    console.log("this wallet xpub", this.xpub);
    console.log("node =", node);
    // if (node === 0 && !this._node0) {
    if (node === 0) {
      //const xpub = this.constructor._zpubToXpub(this.getXpub());
      const xpub = this.getXpub();
      console.log("XPUB =", xpub);
      const hdNode = bip32Instance.fromBase58(xpub, Marscoin.mainnet);
      //console.log("XPUB =", xpub);
      //const hdNode = bip32Instance.fromBase58(this.xpub, Marscoin.mainnet);
      //const hdNode = bip32.fromBase58(xpub);
      //const hdNode = HDNode.fromBase58(xpub, Marscoin.mainnet);
      console.log("Node:", hdNode);
      this._node0 = hdNode.derive(node);
    }

    // if (node === 1 && !this._node1) {
    if (node === 1) {
      const xpub = this.constructor._zpubToXpub(this.getXpub());
      console.log("this wallet xpub ", xpub);
      // const hdNode = HDNode.fromBase58(xpub, Marscoin.mainnet)
      try {
        //const hdNode = bip32Instance.fromBase58(xpub, Marscoin.mainnet);
        const hdNode = bip32.fromBase58(xpub);
        const derivedNode = hdNode.derive(node).derive(index);
        const publicKey = derivedNode.publicKey;

        console.log("Public Key: ", publicKey.toString('hex'));
        return publicKey;
    } catch (error) {
        console.error("Error deriving public key:", error);
        return null;
    }
      //this._node1 = hdNode.derive(node);
    }

    if (node === 0) {
      var temp = this._node0.derive(index).publicKey;
      // console.log("-- publicKey node0: " + temp);
      return temp;
    }

    if (node === 1) {
      var temp = this._node1.derive(index).publicKey;
      // console.log("-- publicKey node1: " + temp);
      return temp;
    }
  }

  getPublicKeyFromXpub(xpubString, index = 0) {
    try {
      const network = Marscoin.mainnet;
      const node = bip32Instance.fromBase58(xpubString, network);
      const child = node.derive(index);
   
      return child.publicKey.toString('hex');
    } catch (error) {
      console.error("Failed to derive public key:", error.message);
      return null;
    }
  }

  // Not happy w/ having to fetch txhex after, need to add it while parsing tx
  async createTransaction(
    utxos,
    targets,
    feeRate,
    changeAddress,
    sequence,
    skipSigning = false,
    masterFingerprint
  ) {
    console.log("\n\n\n=== Generating Transaction === ");

    console.log("Fee: " + feeRate);
    feeRate = feeRate * 100;

    if (targets.length === 0) throw new Error("No destination provided");
    const { inputs, outputs, fee } = this.coinselect(
      utxos,
      targets,
      feeRate,
      changeAddress
    );

    console.log("\n\n --- UTXOs: " + JSON.stringify(utxos));
    console.log("\n--- Inputs: " + JSON.stringify(inputs));
    console.log("\n");
    console.log("--- Outputs: " + JSON.stringify(outputs));
    console.log("\n");
    console.log("--- Fee: " + fee);
    console.log("\n");
    console.log("--- Change Address: " + changeAddress);
    console.log("\n\n");

    sequence = sequence || AbstractHDElectrumWallet.defaultRBFSequence;
    let psbt = new bitcoin.Psbt({ network: Marscoin.mainnet });
    let c = 0;
    const keypairs = [];
    const values = {};
    const hexes = [];

    psbt.setVersion(1);

    // The fee will be around 0.02 MARS
    // 5000 sat/v
    psbt.setMaximumFeeRate(100000);

    for (const t of inputs) {
      hexes.push(await this.getTxHex(t.txId));
    }

    inputs.forEach((input) => {
      console.log("=== Creating individual input ===");
      let keyPair;
      if (!skipSigning) {
        // maybe change keyPair gen to v2
        console.log("-- Fetching keypair for: " + input.address);
        keyPair = bitcoin.ECPair.fromWIF(
          this._getWifForAddress(input.address),
          Marscoin.mainnet
        );
        console.log("Found keypair: " + JSON.stringify(keyPair));
        keypairs[c] = keyPair;
      }
      values[c] = input.value;

      if (!skipSigning) {
        // skiping signing related stuff
        if (!input.address || !this._getWifForAddress(input.address))
          throw new Error("Internal error: no address or WIF to sign input");
      }

      let masterFingerprintBuffer;
      if (masterFingerprint) {
        let masterFingerprintHex = Number(masterFingerprint).toString(16);
        if (masterFingerprintHex.length < 8)
          masterFingerprintHex = "0" + masterFingerprintHex; // conversion without explicit zero might result in lost byte
        const hexBuffer = Buffer.from(masterFingerprintHex, "hex");
        masterFingerprintBuffer = Buffer.from(reverse(hexBuffer));
      } else {
        masterFingerprintBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      }

      // this is not correct fingerprint, as we dont know real fingerprint - we got zpub with 84/0, but fingerpting
      // should be from root. basically, fingerprint should be provided from outside  by user when importing zpub
      psbt = this._addPsbtInput(
        psbt,
        input,
        hexes[c],
        sequence,
        masterFingerprintBuffer
      );
      c++;
      console.log("=== Finished Creating Individual Input ===\n");
    });

    // Succesfully creates inputs but outputs are invalid
    console.log("\n\n\n === CREATED ALL INPUTS ===\n\n\n");

    outputs.forEach((output) => {
      console.log("=== Creating individual output");
      // if output has no address - this is change output
      let change = false;
      if (!output.address) {
        console.log(" -- Adding change address");
        change = true;
        output.address = changeAddress;
      }

      const outputData = {
        address: output.address,
        value: output.value,
      };

      psbt.addOutput(outputData);
      console.log("--- Finished creating individual output ---");
    });

    console.log("\n\n\n=== CREATED ALL OUTPUTS ===\n\n\n");

    if (!skipSigning) {
      // skiping signing related stuff
      console.log(`--- Signing Inputs for ` + keypairs.length + "keys");
      for (let cc = 0; cc < c; cc++) {
        console.log("--- Signing input @ index: " + cc);
        psbt.signInput(cc, keypairs[cc]);
      }
    }

    console.log(psbt.validateSignaturesOfAllInputs());

    let tx;
    if (!skipSigning) {
      tx = psbt.finalizeAllInputs().extractTransaction();
    }
    console.log("=== RETURNING FROM CREATETX() ===\n\n\n");
    console.log("tx !!!!!!", tx);
    console.log("inputs !!!!!",  inputs);
    console.log(" outputs !!!!!", outputs);
    console.log("fee", fee);
    console.log("psbt", psbt);
    return { tx, inputs, outputs, fee, psbt };
  }

  async getTxHex(adr) {
    console.log("ykrdcykdt!!!!!!trdutjv");
    const resp = await MARSConnection.getTxHex(adr);
    console.log(resp);
    return resp;
  }

  _addPsbtInput = (psbt, input, txHex, sequence, masterFingerprintBuffer) => {
    console.log("==== [MARS] _addPsbtInput ====");
    console.log(input);
    const pubkey = this._getPubkeyByAddress(input.address);
    console.log('pubkey',pubkey);
    const path = this._getDerivationPathByAddress(input.address);

    const p2wpkh = bitcoin.payments.p2pkh({
      pubkey: pubkey,
      network: Marscoin.mainnet,
    });

    console.log(p2wpkh);

    console.log("-- Adding input --");
    console.log("hash: " + input.txId);
    console.log("index: " + input.vout);
    console.log("hex: " + txHex);
    console.log("\n\n\n");

    psbt.addInput({
      hash: input.txId,
      index: input.vout,
      // sequence,
      // bip32Derivation: [
      //   {
      //     masterFingerprint: masterFingerprintBuffer,
      //     path,
      //     pubkey,
      //   },
      // ],
      nonWitnessUtxo: Buffer.from(txHex, "hex"),
    });
    console.log("RETURNING FROM addPsbtInput");
    return psbt;
  };

  /**
   * Broadcast txhex. Can throw an exception if failed
   *
   * @param {String} txhex
   * @returns {Promise<boolean>}
   */
  async broadcastTx(txhex) {
    console.log("==== [MARS] broadcastTx ==== ");
    const broadcast = await MARSConnection.broadcastV2(txhex);
    console.log({ broadcast });
    if (broadcast.indexOf("successfully") !== -1) return true;
    return broadcast.length === 64; // this means return string is txid (precise length), so it was broadcasted ok
  }

  static _getTransactionsFromHistories(histories) {
    const txs = [];
    for (const history of Object.values(histories)) {
      for (const tx of history) {
        txs.push(tx);
      }
    }
    return txs;
  }

  async _binarySearchIterationForInternalAddress(index) {
    const gerenateChunkAddresses = (chunkNum) => {
      const ret = [];
      for (
        let c = this.gap_limit * chunkNum;
        c < this.gap_limit * (chunkNum + 1);
        c++
      ) {
        ret.push(this._getInternalAddressByIndex(c));
      }
      return ret;
    };

    let lastChunkWithUsedAddressesNum = null;
    let lastHistoriesWithUsedAddresses = null;
    for (let c = 0; c < Math.round(index / this.gap_limit); c++) {
      const histories = await MARSConnection.multiGetHistoryByAddress(
        gerenateChunkAddresses(c)
      );
      if (
        this.constructor._getTransactionsFromHistories(histories).length > 0
      ) {
        // in this particular chunk we have used addresses
        lastChunkWithUsedAddressesNum = c;
        lastHistoriesWithUsedAddresses = histories;
      } else {
        // empty chunk. no sense searching more chunks
        break;
      }
    }

    let lastUsedIndex = 0;

    if (lastHistoriesWithUsedAddresses) {
      // now searching for last used address in batch lastChunkWithUsedAddressesNum
      for (
        let c = lastChunkWithUsedAddressesNum * this.gap_limit;
        c < lastChunkWithUsedAddressesNum * this.gap_limit + this.gap_limit;
        c++
      ) {
        const address = this._getInternalAddressByIndex(c);
        if (
          lastHistoriesWithUsedAddresses[address] &&
          lastHistoriesWithUsedAddresses[address].length > 0
        ) {
          lastUsedIndex = Math.max(c, lastUsedIndex) + 1; // point to next, which is supposed to be unsued
        }
      }
    }

    return lastUsedIndex;
  }

  async _binarySearchIterationForExternalAddress(index) {
    const gerenateChunkAddresses = (chunkNum) => {
      const ret = [];
      for (
        let c = this.gap_limit * chunkNum;
        c < this.gap_limit * (chunkNum + 1);
        c++
      ) {
        ret.push(this._getExternalAddressByIndex(c));
      }
      return ret;
    };

    let lastChunkWithUsedAddressesNum = null;
    let lastHistoriesWithUsedAddresses = null;
    for (let c = 0; c < Math.round(index / this.gap_limit); c++) {
      const histories = await MARSConnection.multiGetHistoryByAddress(
        gerenateChunkAddresses(c)
      );
      if (
        this.constructor._getTransactionsFromHistories(histories).length > 0
      ) {
        // in this particular chunk we have used addresses
        lastChunkWithUsedAddressesNum = c;
        lastHistoriesWithUsedAddresses = histories;
      } else {
        // empty chunk. no sense searching more chunks
        break;
      }
    }

    let lastUsedIndex = 0;

    if (lastHistoriesWithUsedAddresses) {
      // now searching for last used address in batch lastChunkWithUsedAddressesNum
      for (
        let c = lastChunkWithUsedAddressesNum * this.gap_limit;
        c < lastChunkWithUsedAddressesNum * this.gap_limit + this.gap_limit;
        c++
      ) {
        const address = this._getExternalAddressByIndex(c);
        if (
          lastHistoriesWithUsedAddresses[address] &&
          lastHistoriesWithUsedAddresses[address].length > 0
        ) {
          lastUsedIndex = Math.max(c, lastUsedIndex) + 1; // point to next, which is supposed to be unsued
        }
      }
    }

    return lastUsedIndex;
  }
}
