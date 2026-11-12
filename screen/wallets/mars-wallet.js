import { Marscoin } from "../../blue_modules/constants";
import { BitcoinUnit } from "../../models/bitcoinUnits";
import { randomBytes } from "../../class/rng";
import { AbstractHDElectrumWallet } from "../../class/wallets/abstract-hd-electrum-wallet";
import { HDLegacyP2PKHWallet } from "../../class";
const ecc = require('tiny-secp256k1');
const BIP32Factory = require('bip32').BIP32Factory;

// Create a bip32 instance using the factory
const bip32Instance = BIP32Factory(ecc);

// import { checkReporting } from "../../blue_modules/balanceAnalytics";
// import checkReporting

const MARSConnection = require("../../blue_modules/MARSConnection");
const { isExactCoinValue, marsToExactZubrins } = require("../../blue_modules/mars-coins");

const bip39 = require("bip39");
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
    this.civic = false;
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
    const buf = await randomBytes(16);
    this.setSecret(bip39.entropyToMnemonic(buf.toString("hex")));
  }

  getAddress() {
    return this.civic ? this._getExternalAddressByIndex(0) : this._address || this._getExternalAddressByIndex(this.next_free_address_index);
  }

  async getAddressAsync() {
    if (this.civic) {
      this._address = this._getExternalAddressByIndex(0);
      return this._address;
    }
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
        // A failed lookup does not establish that an address is unused.
        throw new Error('Could not check the receiving address. Please reconnect and try again.');
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

  }

  validateMnemonic() {
    // console.log('==== [MARS] ValidateMnemonic ====');
    return bip39.validateMnemonic(this.secret);
  }

  setSecret(newSecret) {
    if (this.secret !== newSecret) this.clearDerivedData();
    this.secret = newSecret.trim().toLowerCase();
    this.secret = this.secret
      .replace(/[^a-zA-Z0-9]/g, " ")
      .replace(/\s+/g, " ");
    return this;
  }
  setPassphrase(passphrase) {
    if (this.passphrase !== passphrase) this.clearDerivedData();
    this.passphrase = passphrase;
  }

  clearDerivedData() {
    this._xpub = undefined;
    this._node0 = undefined;
    this._node1 = undefined;
    this._address = undefined;
    this.external_addresses_cache = {};
    this.internal_addresses_cache = {};
    this._address_to_wif_cache = {};
    this.next_free_address_index = 0;
    this.next_free_change_address_index = 0;
    this._utxo = [];
    this._balances_by_external_index = {};
    this._balances_by_internal_index = {};
    this._txs_by_external_index = {};
    this._txs_by_internal_index = {};
  }

  setCivic() {
    this.civic = true;
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
    // Cache
    if (this._xpub) {
      return this._xpub; // cache hit
    }
    const seed = this._getSeed();
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

      const xpub = this.getXpub();
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
    for (let offset = 0; offset <= this.gap_limit; offset++) {
      const index = this.next_free_change_address_index + offset;
      const address = this._getInternalAddressByIndex(index);
      const history = await MARSConnection.getTransactionsByAddress(address);
      if (history.length === 0) {
        this.next_free_change_address_index = index;
        return address;
      }
    }
    throw new Error('Could not find an unused change address. Refresh this wallet and try again.');
  }

  async fetchBalance() {

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
    if (!this.isAddressValid(changeAddress)) throw new Error('A valid Marscoin change address is required.');
    if (!Number.isFinite(feeRate) || feeRate < 1) throw new Error('Enter a valid fee rate in zubrins per byte.');
    if (!targets.length) throw new Error('No destination provided.');
    for (const target of targets) {
      if (!target.script && !this.isAddressValid(target.address)) throw new Error('The destination is not a valid Marscoin address.');
      if ('value' in target && (!Number.isSafeInteger(target.value) || target.value < (target.script ? 0 : 1))) {
        throw new Error('The transaction amount must be a whole number of zubrins.');
      }
    }
    if (utxos.some(input => !Number.isSafeInteger(input.value) || input.value <= 0)) throw new Error('Refresh the wallet before sending.');

    let algo = coinSelect;
    if (targets.some((i) => !("value" in i))) {
      algo = coinSelectSplit;
    }

    const { inputs, outputs, fee } = algo(utxos, targets, feeRate);

    if (!inputs || !outputs) {
      throw new Error("Not enough balance");
    }

    return { inputs, outputs, fee };
  }

  getNextFreeAddressIndex() {
    return this.next_free_address_index;
  }

  // ggetPassport() {}

  getUtxo(respectFrozen = false) {

    // Only coins the network reported. This used to fall back to coins worked
    // out from stored transactions when there were none: that list is stale by
    // construction (it cannot see spends or receipts the phone has not
    // fetched) and so must never be spent from.
    let ret = this._utxo || [];
    if (!respectFrozen) {
      ret = ret.filter(
        ({ txid, vout }) => !this.getUTXOMetadata(txid, vout).frozen
      );
    }

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

        let address = false;
        if (
          output.scriptPubKey &&
          output.scriptPubKey.addresses &&
          output.scriptPubKey.addresses[0]
        ) {
          address = output.scriptPubKey.addresses[0];
        }
        if (ownedAddressesHashmap[address]) {
          // Exact zubrins or nothing: never a rounded or missing amount.
          const value = marsToExactZubrins(output.value);
          if (value === null) continue;
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

    return this._getWIFByIndex(false, index);
  }

  _getInternalWIFByIndex(index) {
    return this._getWIFByIndex(true, index);
  }

  _getWIFByIndex(internal, index) {

    try {
      const seed = this._getSeed(); // Make sure this returns a Buffer
      const network = Marscoin.mainnet; // Using Marscoin network definitions
      const root = bitcoin.bip32.fromSeed(seed, Marscoin.mainnet);
      //const root = bip32.fromSeed(seed, network); // Use the Marscoin network configuration
      const path = `m/44'/${network.bip44}'/0'/${internal ? 1 : 0}/${index}`;
      const child = root.derivePath(path);
      return child.toWIF();
  } catch (error) {
      console.error('Could not derive the Marscoin signing key');
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
    //console.log("==== [MARS] _getWifForAddress ====");
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
    //console.log('!!!!!!!!!!!!!!!addressess', addressess)
    const fetchedUtxo = await MARSConnection.multiGetUtxoByAddress(addressess);
    //console.log('!!!!!!!!!!!!!!!fetchedUtxo', fetchedUtxo)
    let fresh = [];
    for (const arr of Object.values(fetchedUtxo)) {
      //console.log(arr);
      fresh = fresh.concat(arr);
    }
    // A coin without an exact, positive value (an empty output someone sent to
    // one of our addresses, for instance) cannot be spent. Leave it out rather
    // than refuse the whole wallet because of it.
    const usable = fresh.filter(coin => isExactCoinValue(coin?.value));
    this._unusableCoins = fresh.length - usable.length;
    if (this._unusableCoins) console.log(`fetchUtxo: left out ${this._unusableCoins} coin(s) without a spendable value`);
    this._utxo = usable;

    // backward compatibility TODO: remove when we make sure `.utxo` is not used
    this.utxo = this._utxo;
    // this belongs in `.getUtxo()`
    for (const u of this.utxo) {
      //console.log("-- [fetchUtxo] utxo " + JSON.stringify(u));
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

    // if txs are absent for some internal address in hierarchy - this is a sign
    // we should fetch txs for that address
    // OR if some address has unconfirmed balance - should fetch it's txs
    // OR some tx for address is unconfirmed
    // OR some tx has < 7 confirmations

    // fetching transactions in batch: first, getting batch history for all addresses,
    // then batch fetching all involved txids
    // finally, batch fetching txids of all inputs (needed to see amounts & addresses of those inputs)
    // then we combine it all together

    const knownAddresses = []

    // Build list of known addresses
    for (let c = 0; c < this.next_free_address_index + 1; c++) {
      knownAddresses.push(this._getExternalAddressByIndex(c))
    }
    for (let c = 0; c < this.next_free_change_address_index + 1; c++) {
      knownAddresses.push(this._getInternalAddressByIndex(c))
    }

    // Create an array of addresses to check
    const addressesToFetch = []

    // Add some extra addresses beyond what we know we've used, to catch any we might have missed
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      addressesToFetch.push(this._getExternalAddressByIndex(c))
    }
    for (let c = 0; c < this.next_free_change_address_index + this.gap_limit; c++) {
      addressesToFetch.push(this._getInternalAddressByIndex(c))
    }

    // Create a new array with unique addresses instead of reassigning addresses2fetch
    const uniqueAddresses = [...new Set(addressesToFetch)]

    // Fetch transaction histories for all addresses
    const histories = await MARSConnection.multiGetHistoryByAddress(uniqueAddresses)

    // Log how many transactions we found
    let txCount = 0
    for (const addr in histories) {
      if (histories[addr] && histories[addr].length > 0) {

        txCount += histories[addr].length
      }
    }

    const txs = {}
    for (const history of Object.values(histories)) {
      for (const tx of history) {
        txs[tx.tx_hash] = tx
      }
    }

    // next, batch fetching each txid we got
    const txdatas = await MARSConnection.multiGetTransactionByTxid(
      Object.keys(txs)
    )

    // now, tricky part. we collect all transactions from inputs (vin), and batch fetch them too.
    // then we combine all this data (we need inputs to see source addresses and amounts)
    const vinTxids = []
    for (const txdata of Object.values(txdatas)) {
      for (const vin of txdata.vin) {
        vinTxids.push(vin.txid)
      }
    }
    const vintxdatas = await MARSConnection.multiGetTransactionByTxid(vinTxids)

    // fetched all transactions from our inputs. now we need to combine it.
    // iterating all _our_ transactions:

    // Debug: Inspect transaction data structure
    if (Object.keys(txdatas).length > 0) {
      const sampleTxid = Object.keys(txdatas)[0]

      // Check vintxdatas structure
      if (Object.keys(vintxdatas).length > 0) {
        const sampleVinTxid = Object.keys(vintxdatas)[0]

      } else {

      }
    }

    // Helper function to safely access nested properties
    const safeGet = (obj, path) => {
      try {
        return path.split(".").reduce((o, key) => o && o[key], obj)
      } catch (e) {
        return undefined
      }
    }

    for (const txid of Object.keys(txdatas)) {
      try {
        // iterating all inputs our our single transaction:
        for (let inpNum = 0; inpNum < txdatas[txid].vin.length; inpNum++) {
          try {
            const input = txdatas[txid].vin[inpNum]
            const inpTxid = input.txid

            // Handle potential change in vout property name (could be vout, n, or other)
            const inpVout = input.vout !== undefined ? input.vout : 
                            input.n !== undefined ? input.n : undefined

            // got txid and output number of _previous_ transaction we should look into
            if (inpTxid && inpVout !== undefined && vintxdatas[inpTxid]) {
              const vout = vintxdatas[inpTxid].vout

              // Check if vout exists and has the right index as a number or string
              const voutIndex = String(inpVout)
              const voutData = vout && (vout[inpVout] || vout[voutIndex])

              if (voutData) {
                // Handle potential changes in scriptPubKey structure
                const scriptPubKey = voutData.scriptPubKey

                if (scriptPubKey) {
                  // Try different possible locations for addresses
                  const addresses = scriptPubKey.addresses || 
                                   (scriptPubKey.address ? [scriptPubKey.address] : null) ||
                                   (scriptPubKey.addressHash ? [scriptPubKey.addressHash] : null)

                  if (addresses) {
                    txdatas[txid].vin[inpNum].addresses = addresses
                  }
                }

                // Handle potential changes in value property
                const value = voutData.value !== undefined ? voutData.value : voutData.amount
                if (value !== undefined) {
                  txdatas[txid].vin[inpNum].value = value
                }
              } else {

              }
            }
          } catch (inputError) {

          }
        }
      } catch (txError) {

      }
    }

    // now purge all unconfirmed txs from internal hashmaps, since some may be evicted from mempool because they became invalid
    // or replaced. hashmaps are going to be re-populated anyways, since we fetched TXs for addresses with unconfirmed TXs
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      if (Array.isArray(this._txs_by_external_index[c])) {
        this._txs_by_external_index[c] = this._txs_by_external_index[c].filter(
          (tx) => !!tx?.confirmations
        )
      }
    }
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      if (Array.isArray(this._txs_by_internal_index[c])) {
        this._txs_by_internal_index[c] = this._txs_by_internal_index[c].filter(
          (tx) => !!tx?.confirmations
        )
      }
    }

    // now, we need to put transactions in all relevant `cells` of internal hashmaps: this._txs_by_internal_index && this._txs_by_external_index

    // Helper function to safely process transactions
    const processTxForAddress = (tx, addressIndex, isInternal) => {
      try {
        const targetMap = isInternal
          ? this._txs_by_internal_index
          : this._txs_by_external_index
        const getAddressFn = isInternal
          ? this._getInternalAddressByIndex.bind(this)
          : this._getExternalAddressByIndex.bind(this)
        const address = getAddressFn(addressIndex)

        // Initialize the array if it doesn't exist
        targetMap[addressIndex] = targetMap[addressIndex] || []

        // Create a standardized transaction object
        const standardTx = {
          txid: tx.txid,
          hash: tx.hash || tx.txid,
          version: tx.version,
          size: tx.size,
          locktime: tx.locktime,
          blocktime: tx.blocktime,
          blockhash: tx.blockhash,
          confirmations: tx.confirmations || 0,
          inputs: [], // Will populate with standardized inputs
          outputs: [], // Will populate with standardized outputs
          hex: tx.hex
        }

        // Standardize inputs
        if (Array.isArray(tx.vin)) {
          standardTx.inputs = tx.vin.map(input => ({
            txid: input.txid,
            vout: input.vout !== undefined ? input.vout : input.n,
            sequence: input.sequence,
            addresses: input.addresses || [],
            value: input.value || 0,
          }))
        }

        // Standardize outputs
        if (Array.isArray(tx.vout)) {
          standardTx.outputs = tx.vout.map(output => ({
            n: output.n,
            value: output.value,
            scriptPubKey: output.scriptPubKey || {},
          }))
        }

        // Check if this transaction already exists
        let replaced = false
        for (let i = 0; i < targetMap[addressIndex].length; i++) {
          if (targetMap[addressIndex][i].txid === standardTx.txid) {
            replaced = true
            targetMap[addressIndex][i] = standardTx
            break
          }
        }

        // Add if not replaced
        if (!replaced) {
          targetMap[addressIndex].push(standardTx)
        }
      } catch (error) {

      }
    }

    // Process external addresses
    for (let c = 0; c < this.next_free_address_index + this.gap_limit; c++) {
      const externalAddress = this._getExternalAddressByIndex(c)

      for (const txid in txdatas) {
        const tx = txdatas[txid]
        let isRelevant = false

        // Check inputs
        if (Array.isArray(tx.vin)) {
          for (const vin of tx.vin) {
            if (
              vin.addresses &&
              vin.addresses.indexOf(externalAddress) !== -1
            ) {
              isRelevant = true
              break
            }
          }
        }

        // Check outputs
        if (!isRelevant && Array.isArray(tx.vout)) {
          for (const vout of tx.vout) {
            const addresses =
              vout.scriptPubKey &&
              (vout.scriptPubKey.addresses ||
                (vout.scriptPubKey.address
                  ? [vout.scriptPubKey.address]
                  : null))

            if (addresses && addresses.indexOf(externalAddress) !== -1) {
              isRelevant = true
              break
            }
          }
        }

        if (isRelevant) {
          processTxForAddress(tx, c, false)
        }
      }
    }

    // Process internal addresses
    for (
      let c = 0;
      c < this.next_free_change_address_index + this.gap_limit;
      c++
    ) {
      const internalAddress = this._getInternalAddressByIndex(c)

      for (const txid in txdatas) {
        const tx = txdatas[txid]
        let isRelevant = false

        // Check inputs
        if (Array.isArray(tx.vin)) {
          for (const vin of tx.vin) {
            if (
              vin.addresses &&
              vin.addresses.indexOf(internalAddress) !== -1
            ) {
              isRelevant = true
              break
            }
          }
        }

        // Check outputs
        if (!isRelevant && Array.isArray(tx.vout)) {
          for (const vout of tx.vout) {
            const addresses =
              vout.scriptPubKey &&
              (vout.scriptPubKey.addresses ||
                (vout.scriptPubKey.address
                  ? [vout.scriptPubKey.address]
                  : null))

            if (addresses && addresses.indexOf(internalAddress) !== -1) {
              isRelevant = true
              break
            }
          }
        }

        if (isRelevant) {
          processTxForAddress(tx, c, true)
        }
      }
    }

    this._lastTxFetch = +new Date()
  }

  getTransactions() {

    let txs = []

    for (const addressTxs of Object.values(this._txs_by_external_index)) {
      txs = txs.concat(addressTxs)
    }
    for (const addressTxs of Object.values(this._txs_by_internal_index)) {
      txs = txs.concat(addressTxs)
    }

    if (txs.length === 0) return [] // guard clause; so we wont spend time calculating addresses

    // Build hashmap of owned addresses for faster lookup
    const ownedAddressesHashmap = {}
    for (let c = 0; c < this.next_free_address_index + 1; c++) {
      ownedAddressesHashmap[this._getExternalAddressByIndex(c)] = true
    }
    for (let c = 0; c < this.next_free_change_address_index + 1; c++) {
      ownedAddressesHashmap[this._getInternalAddressByIndex(c)] = true
    }
    // hack: in case this code is called from LegacyWallet:
    if (this.getAddress()) ownedAddressesHashmap[this.getAddress()] = true

    const ret = []
    for (const tx of txs) {
      const processedTx = {
        received: tx.blocktime ? tx.blocktime * 1000 : +new Date() - 30 * 1000, // unconfirmed
        confirmations: tx?.confirmations || 0, // unconfirmed
        hash: tx.txid,
        txid: tx.txid,
        value: 0,
        hex: tx.hex,
        inputs: tx.inputs || tx.vin || [],
        outputs: tx.outputs || tx.vout || []
      }

      // Calculate inputs and outputs amounts for this transaction
      let totalInputsFromOurWallet = 0;
      let totalOutputsToOurWallet = 0;
      let totalExternalOutputs = 0;

      // Check inputs from our wallet
      for (const input of processedTx.inputs) {
        const inputAddresses = input.addresses || (input.address ? [input.address] : []);
        if (inputAddresses.some(addr => ownedAddressesHashmap[addr])) {
          const inputValue = parseFloat(input.value) || 0;
          totalInputsFromOurWallet += inputValue;

        }
      }

      // Check outputs to our wallet and external addresses
      for (const output of processedTx.outputs) {
        const scriptPubKey = output.scriptPubKey || {};
        const outputAddress = scriptPubKey.address || 
                             (scriptPubKey.addresses && scriptPubKey.addresses[0]);

        if (outputAddress) {
          const outputValue = parseFloat(output.value) || 0;

          if (ownedAddressesHashmap[outputAddress]) {
            // Output to our wallet (could be change)
            totalOutputsToOurWallet += outputValue;

          } else {
            // Output to external address
            totalExternalOutputs += outputValue;

          }
        }
      }

      // Determine transaction type and value
      if (totalInputsFromOurWallet > 0) {
        // This is an outgoing transaction (we spent some coins)
        // Calculate the total amount spent including fees
        const totalSpent = totalInputsFromOurWallet - totalOutputsToOurWallet;

        // The network fee is the difference between inputs and all outputs
        const networkFee = totalInputsFromOurWallet - (totalOutputsToOurWallet + totalExternalOutputs);

        // Set transaction value as negative (money sent)
        // Multiply by 100000000 to match UI display expectations
        processedTx.value = -totalSpent * 100000000;

      } else if (totalOutputsToOurWallet > 0) {
        // This is an incoming transaction (we received coins)
        // Multiply by 100000000 to match UI display expectations
        processedTx.value = totalOutputsToOurWallet * 100000000;

      }

      ret.push(processedTx);
    }

    // Deduplication
    const usedTxIds = {}
    const ret2 = []
    for (const tx of ret) {
      if (!usedTxIds[tx.txid]) ret2.push(tx)
      usedTxIds[tx.txid] = 1
    }

    return ret2.sort(function (a, b) {
      return b.received - a.received
    })
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

    //const xpub = this.constructor._zpubToXpub(this.getXpub());
    index = index * 1; // cast to int

    // if (node === 0 && !this._node0) {
    if (node === 0) {
      //const xpub = this.constructor._zpubToXpub(this.getXpub());
      const xpub = this.getXpub();
      const hdNode = bip32Instance.fromBase58(xpub, Marscoin.mainnet);
      //const hdNode = bip32Instance.fromBase58(this.xpub, Marscoin.mainnet);
      //const hdNode = bip32.fromBase58(xpub);
      //const hdNode = HDNode.fromBase58(xpub, Marscoin.mainnet);
      this._node0 = hdNode.derive(node);
    }

    // if (node === 1 && !this._node1) {
    if (node === 1) {
      //const xpub = this.constructor._zpubToXpu
      const xpub = this.getXpub();
      const hdNode = bip32Instance.fromBase58(xpub, Marscoin.mainnet);
      // const hdNode = HDNode.fromBase58(xpub, Marscoin.mainnet)

      this._node1 = hdNode.derive(node);
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
    masterFingerprint,
    message = null
  ) {

    // Fee estimates and the preview already use atomic units (zubrins) per
    // byte. Keep those units through selection and signing.
    if (message) {
      const data = Buffer.from(message, 'utf8');
      if (data.length > 80) throw new Error('The citizenship record is too large for a transaction.');
      const embed = bitcoin.payments.embed({ data: [data] });
      targets = [...targets, { script: embed.output, value: 0 }];
    }

    if (targets.length === 0) throw new Error("No destination provided");
    const { inputs, outputs, fee } = this.coinselect(
      utxos,
      targets,
      feeRate,
      changeAddress
    );

    // console.log("\n\n --- UTXOs: " + JSON.stringify(utxos));
    // console.log("\n--- Inputs: " + JSON.stringify(inputs));
    // console.log("\n");
    // console.log("--- Outputs: " + JSON.stringify(outputs));
    // console.log("\n");
    // console.log("--- Fee: " + fee);
    // console.log("\n");
    // console.log("--- Change Address: " + changeAddress);
    // console.log("\n\n");

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

      let keyPair;
      if (!skipSigning) {
        // maybe change keyPair gen to v2

        keyPair = bitcoin.ECPair.fromWIF(
          this._getWifForAddress(input.address),
          Marscoin.mainnet
        );
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
        masterFingerprintBuffer = Buffer.from(hexBuffer).reverse();
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

    });

    // Succesfully creates inputs but outputs are invalid

    outputs.forEach(output => {
      if (output.script) {
        psbt.addOutput({ script: output.script, value: output.value });
      } else {
        // Coin selection leaves the change output's destination unspecified.
        if (!output.address) output.address = changeAddress;
        psbt.addOutput({ address: output.address, value: output.value });
      }
    });

    if (!skipSigning) {
      // skiping signing related stuff

      for (let cc = 0; cc < c; cc++) {

        psbt.signInput(cc, keypairs[cc]);
      }
    }

    let tx;
    if (!skipSigning) {
      tx = psbt.finalizeAllInputs().extractTransaction();
    }

    return { tx, inputs, outputs, fee, psbt };
  }

  async getTxHex(adr) {
    const resp = await MARSConnection.getTxHex(adr);
    //console.log(resp);
    return resp;
  }

  _addPsbtInput = (psbt, input, txHex, sequence, masterFingerprintBuffer) => {

    const pubkey = this._getPubkeyByAddress(input.address);

    const path = this._getDerivationPathByAddress(input.address);

    const p2wpkh = bitcoin.payments.p2pkh({
      pubkey: pubkey,
      network: Marscoin.mainnet,
    });

    psbt.addInput({
      hash: input.txId,
      index: input.vout,
      sequence,
      // bip32Derivation: [
      //   {
      //     masterFingerprint: masterFingerprintBuffer,
      //     path,
      //     pubkey,
      //   },
      // ],
      nonWitnessUtxo: Buffer.from(txHex, "hex"),
    });

    return psbt;
  };

  /**
   * Broadcast txhex. Can throw an exception if failed
   *
   * @param {String} txhex
   * @returns {Promise<boolean>}
   */
  async broadcastTx(txhex) {

    const broadcast = await MARSConnection.broadcastV2(txhex);

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
