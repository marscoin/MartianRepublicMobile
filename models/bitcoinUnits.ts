export const BitcoinUnit = {
  BTC: 'BTC',
  SATS: 'sats',
  MARS: 'MARS',
  ZUBRINS: 'zubrins',
  LOCAL_CURRENCY: 'local_currency',
  MAX: 'MAX',
} as const;
export type BitcoinUnit = (typeof BitcoinUnit)[keyof typeof BitcoinUnit];

export const Chain = {
  ONCHAIN: 'ONCHAIN',
  OFFCHAIN: 'OFFCHAIN',
} as const;
export type Chain = (typeof Chain)[keyof typeof Chain];
