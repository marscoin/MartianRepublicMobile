/**
 * Let's keep config vars, constants and definitions here
 */


/**
 * Let's keep config vars, constants and definitions here
 */

//import { type BitcoinUnitResp } from "../models/bitcoinUnits";

export const groundControlUri =
  "https://groundcontrol-bluewallet.herokuapp.com/";

export const LITECOIN = {
  mainnet: {
    messagePrefix: "\x19Litecoin Signed Message:\n",
    bech32: "ltc",
    bip44: 2,
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0,
  },
  testnet: {
    messagePrefix: "\x19Litecoin Signed Message:\n",
    bech32: "tltc",
    bip44: 2,
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
  },
};

export const Marscoin = {
  mainnet: {
    messagePrefix: "\x19Marscoin Signed Message:\n",
    bech32: "M",
    bip44: 2,
    bip32: {
      public: 0x043587cf,
      private: 0x04358394,
    },
    pubKeyHash: 0x32,
    scriptHash: 0x32,
    wif: 0x80,
  },
  minConfirmations: 6,
};

export const Dogecoin = {
  mainnet: {
    messagePrefix: "\x19Dogecoin Signed Message:\n",
    bip32: {
      public: 0x02facafd,
      private: 0x02fac398,
    },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e,
  },
  minConfirmations: 20,
};

export const LitecoinMainnet = {
  messagePrefix: "\x19Litecoin Signed Message:\n",
  bech32: "ltc",
  bip44: 2,
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0x80,
};

export const BITCOIN = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};




export const Ethereum = {
  minConfirmations: 12,
};

export const ETH_LONG = 1000000000000000000;

export const ConfirmationsToComplete: Record<BitcoinUnitResp, number> = {
  BTC: 7,
  LTC: 6,
  MARS: 6,
  ETH: Ethereum.minConfirmations,
  DOGE: Dogecoin.minConfirmations,
};

export const NETWORKS = {
  BTC: BITCOIN,
  MARS: Marscoin.mainnet, 
  LTC: LITECOIN.mainnet,
  DOGE: Dogecoin.mainnet,
}