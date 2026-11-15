// The words and numbers of the send flow.
import {
  addressParts,
  amountFontSize,
  customFeeRate,
  explorerTxUrl,
  fiatOfZubrins,
  fiatText,
  marsText,
  ownWalletLabel,
  sendBlocker,
  shortAddress,
} from '../../components/send/sendFormat';
import { networkFeeText, NEXT_BLOCK_TEXT } from '../../blue_modules/mars-fee-text';

const ADDRESS = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';

describe('dollar values', () => {
  it('shows two decimals, never eight', () => {
    expect(fiatText(0.60786211)).toBe('$0.61');
    expect(fiatText(406.3149)).toBe('$406.31');
    expect(fiatText(1234567.891)).toBe('$1,234,567.89');
    expect(fiatText(0.01)).toBe('$0.01');
  });

  it('says "under $0.01" for an amount too small to show, and $0.00 only for nothing', () => {
    expect(fiatText(0.0000008)).toBe('under $0.01');
    expect(fiatText(0.0099)).toBe('under $0.01');
    expect(fiatText(0)).toBe('$0.00');
  });

  it('shows nothing when there is no number', () => {
    for (const value of [null, undefined, '', NaN, -1, 'abc', Infinity]) expect(fiatText(value)).toBeNull();
  });

  it('values an amount in zubrins at the exchange rate', () => {
    expect(fiatOfZubrins(1000000000, 0.060786211)).toBe('$0.61');
    expect(fiatOfZubrins(1356, 0.060786211)).toBe('under $0.01');
    expect(fiatOfZubrins(668426267450, 0.060786211)).toBe('$406.31');
    expect(fiatOfZubrins(0, 0.06)).toBe('$0.00');
  });

  it('shows no dollar value without a usable rate', () => {
    for (const rate of [null, undefined, 0, NaN, 'abc', -2]) expect(fiatOfZubrins(1000000000, rate)).toBeNull();
    expect(fiatOfZubrins(undefined, 0.06)).toBeNull();
  });
});

describe('Marscoin amounts', () => {
  it('groups thousands and drops trailing zeros', () => {
    expect(marsText(1000000000)).toBe('10');
    expect(marsText(668426267450)).toBe('6,684.2626745');
    expect(marsText(1356)).toBe('0.00001356');
    expect(marsText(0)).toBe('0');
    expect(marsText(123456789012345)).toBe('1,234,567.89012345');
  });

  it('keeps eight decimals for columns of figures', () => {
    expect(marsText(1000000000, { fixed: true })).toBe('10.00000000');
    expect(marsText(1000001356, { fixed: true })).toBe('10.00001356');
  });

  it('shows nothing for a value that is not a whole number of zubrins', () => {
    for (const value of [undefined, null, NaN, 1.5, -1, '10']) expect(marsText(value)).toBe('');
  });
});

describe('the network fee line', () => {
  it('gives the fee in MARS with its dollar value', () => {
    expect(networkFeeText(1356, 0.060786211)).toBe('0.00001356 MARS · under $0.01');
    expect(networkFeeText(226, 0.06)).toBe('0.00000226 MARS · under $0.01');
    expect(networkFeeText(50000000, 2)).toBe('0.50000000 MARS · $1.00');
  });

  it('leaves the dollar value out without a rate, and is empty while the fee is unknown', () => {
    expect(networkFeeText(1356, null)).toBe('0.00001356 MARS');
    for (const fee of [null, undefined, 0, -1, 1.5, NaN]) expect(networkFeeText(fee, 0.06)).toBeNull();
  });

  it('makes no promise about speed beyond the next block', () => {
    expect(NEXT_BLOCK_TEXT).toBe('Included in the next block, usually within a few minutes. Blocks sometimes take longer.');
    expect(NEXT_BLOCK_TEXT).not.toMatch(/fast|slow|~|\dm\b/i);
  });
});

describe('addresses', () => {
  it('splits an address into the characters people check and the middle', () => {
    expect(addressParts(ADDRESS)).toEqual({ head: 'MHBba2', middle: 'wdTaxZkRisBTe69VJW5JHj', tail: 'TtjCU1' });
    const parts = addressParts(ADDRESS);
    expect(parts.head + parts.middle + parts.tail).toBe(ADDRESS);
  });

  it('shortens an address or a transaction ID and leaves a short one alone', () => {
    expect(shortAddress(ADDRESS)).toBe('MHBba2…TtjCU1');
    expect(shortAddress('ab'.repeat(32), 8, 8)).toBe('abababab…abababab');
    expect(shortAddress('short')).toBe('short');
    expect(shortAddress('')).toBe('');
    expect(shortAddress(undefined)).toBe('');
  });

  it('links a transaction to the explorer', () => {
    expect(explorerTxUrl('ab'.repeat(32))).toBe(`https://explore.marscoin.org/tx/${'ab'.repeat(32)}`);
  });

  it('recognises an address of one of the wallets on the phone, without asking anyone', () => {
    const civic = { weOwnAddress: address => address === ADDRESS, getLabel: () => 'CIVIC WALLET' };
    const other = { weOwnAddress: () => false, getLabel: () => 'Savings' };
    const broken = {
      weOwnAddress: () => {
        throw new Error('locked');
      },
    };
    expect(ownWalletLabel(ADDRESS, [other, broken, civic])).toBe('CIVIC WALLET');
    expect(ownWalletLabel('MP1D2qY6Eb3fVAf1Xxbm1frmhdDSQYufJR', [other, broken, civic])).toBeNull();
    expect(ownWalletLabel('', [civic])).toBeNull();
    expect(ownWalletLabel(ADDRESS, undefined)).toBeNull();
  });
});

describe('the amount gets smaller as it gets longer', () => {
  it('fits a long amount on a narrow phone', () => {
    expect(amountFontSize('10')).toBe(56);
    expect(amountFontSize('10', 320)).toBe(46);
    expect(amountFontSize('1234.5678')).toBeLessThan(56);
    expect(amountFontSize('6684.2626745', 320)).toBeLessThan(amountFontSize('1234.5678', 320));
    expect(amountFontSize('123456.12345678', 320)).toBeGreaterThanOrEqual(22);
  });
});

describe('a custom fee rate', () => {
  it('takes whole numbers of zubrins per byte', () => {
    expect(customFeeRate('3')).toEqual({ rate: '3' });
    expect(customFeeRate(' 12 ')).toEqual({ rate: '12' });
    expect(customFeeRate('007')).toEqual({ rate: '7' });
  });

  it('never goes below the minimum of 1', () => {
    expect(customFeeRate('0')).toEqual({ rate: '1' });
  });

  it('refuses anything else', () => {
    for (const text of ['', '1.5', '-2', 'abc', '1e3', '9'.repeat(30), null, undefined]) {
      expect(customFeeRate(text)).toEqual({ error: 'Enter a whole number of zubrins per byte.' });
    }
  });
});

describe('why the payment cannot be reviewed yet', () => {
  const balance = 668426267450;
  const isAddressValid = address => address === ADDRESS;
  const ready = { address: ADDRESS, amount: '10', amountSats: 1000000000 };
  const reason = input => sendBlocker({ balance, isAddressValid, ...input })?.reason;

  it('is nothing once there is an amount and a valid recipient', () => {
    expect(sendBlocker({ recipients: [ready], balance, isAddressValid })).toBeNull();
    expect(sendBlocker({ recipients: [ready], balance, isAddressValid, fee: 1356 })).toBeNull();
  });

  it('asks for the amount first', () => {
    expect(reason({ recipients: [{ address: '', amount: '' }] })).toBe('Enter an amount');
    expect(reason({ recipients: [{ address: ADDRESS }] })).toBe('Enter an amount');
    expect(sendBlocker({ recipients: [{ address: ADDRESS }], balance, isAddressValid }).field).toBe('amount');
  });

  it('then for the recipient', () => {
    expect(reason({ recipients: [{ ...ready, address: '' }] })).toBe('Add a recipient');
    expect(reason({ recipients: [{ ...ready, address: 'MHBba2' }] })).toBe('Check the address');
    expect(reason({ recipients: [] })).toBe('Add a recipient');
  });

  it('says when the amount is more than the balance, or leaves no room for the fee', () => {
    expect(reason({ recipients: [{ ...ready, amount: '7000', amountSats: 700000000000 }] })).toBe('More than your balance');
    expect(reason({ recipients: [{ ...ready, amount: '6684.2626745', amountSats: balance }], fee: 1356 })).toBe(
      'Leave room for the network fee',
    );
    expect(reason({ recipients: [{ ...ready, amount: '6684.2626745', amountSats: balance }] })).toBeUndefined();
  });

  it('refuses an amount that cannot be read or is too small to send', () => {
    expect(reason({ recipients: [{ ...ready, amount: '1.', amountSats: undefined }] })).toBe('Enter a valid amount');
    expect(reason({ recipients: [{ ...ready, amount: '0', amountSats: undefined }] })).toBe('Enter a valid amount');
    expect(reason({ recipients: [{ ...ready, amount: '0.000005', amountSats: 500 }] })).toBe('Amount is too small');
  });

  it('accepts the full balance, unless the wallet is empty', () => {
    expect(reason({ recipients: [{ address: ADDRESS, amount: 'MAX', amountSats: 'MAX' }] })).toBeUndefined();
    expect(sendBlocker({ recipients: [{ address: ADDRESS, amount: 'MAX' }], balance: 0, isAddressValid }).reason).toBe(
      'This wallet is empty',
    );
    expect(reason({ recipients: [{ address: ADDRESS, amount: 'MAX' }], fee: 1356 })).toBeUndefined();
  });

  it('names the recipient at fault when there are several, and adds them up', () => {
    expect(reason({ recipients: [ready, { address: '', amount: '1', amountSats: 100000000 }] })).toBe('Add a recipient (recipient 2)');
    expect(reason({ recipients: [ready, { address: ADDRESS, amount: '' }] })).toBe('Enter an amount (recipient 2)');
    const half = { address: ADDRESS, amount: '4000', amountSats: 400000000000 };
    expect(reason({ recipients: [half, half] })).toBe('More than your balance');
  });

  it('does not guess at the balance while it is unknown', () => {
    expect(sendBlocker({ recipients: [{ ...ready, amountSats: 700000000000 }], balance: undefined, isAddressValid })).toBeNull();
  });
});
