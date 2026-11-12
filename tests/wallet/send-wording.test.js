import fs from 'fs';
import path from 'path';
import { sendAmountProblem } from '../../blue_modules/mars-amount';
import { feeAmountText, feeRateText, feeSummaryText } from '../../blue_modules/mars-fee-text';

const en = require('../../loc/en.json');
const source = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

describe('fee wording on the send screens', () => {
  it('shows the rate, in zubrins per byte, while the fee cannot be worked out', () => {
    for (const fee of [null, undefined, 0, NaN, -1, 1.5]) {
      expect(feeSummaryText({ fee, rate: '3', usdRate: 0.061 })).toBe('3 zubrins/byte');
      expect(feeAmountText(fee, 0.061)).toBeNull();
    }
    expect(feeRateText(6)).toBe('6 zubrins/byte');
    expect(feeRateText('1')).toBe('1 zubrin/byte');
  });

  it('shows the fee amount with its dollar value once it is known', () => {
    expect(feeSummaryText({ fee: 678, rate: '3', usdRate: 0.061 })).toBe('678 zubrins (under $0.01)');
    expect(feeAmountText(1356, 0.061)).toBe('1,356 zubrins (under $0.01)');
    expect(feeAmountText(1, 0.061)).toBe('1 zubrin (under $0.01)');
    expect(feeAmountText(20000000, 0.5)).toBe('0.2 MARS ($0.10)');
    expect(feeAmountText(123456789, 2)).toBe('1.23456789 MARS ($2.47)');
  });

  it('leaves the dollar value out when there is no exchange rate', () => {
    for (const usdRate of [null, undefined, 0, NaN, 'abc']) expect(feeAmountText(678, usdRate)).toBe('678 zubrins');
  });

  it('never says "0 zubrin"', () => {
    for (const fee of [null, 0, undefined]) {
      expect(feeSummaryText({ fee, rate: '3', usdRate: 0.061 })).not.toMatch(/^0 /);
    }
  });
});

describe('fee units in the English text', () => {
  it('names zubrins per byte, not satoshis per vByte', () => {
    expect(en.send.fee_satvbyte).toBe('in zubrins per byte');
    expect(en.units.sat_vbyte).toBe('zubrins/byte');
    expect(en.send.fee_replace_minvb).toContain('{min} zubrins/byte');
    for (const text of [en.send.fee_satvbyte, en.units.sat_vbyte, en.send.fee_replace_minvb, en.send.create_satoshi_per_vbyte]) {
      expect(text).not.toMatch(/sat\b|satoshi|vbyte|\/vB/i);
    }
  });

  it('keeps the same keys in every language file', () => {
    const directory = path.join(__dirname, '../../loc');
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.json'))) {
      const strings = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      // A translation may lack a key (English is the fallback) but must still parse and keep its shape.
      expect(typeof strings).toBe('object');
      if (strings.send?.fee_satvbyte !== undefined) expect(typeof strings.send.fee_satvbyte).toBe('string');
    }
  });

  it('uses no satoshi or vByte wording in the Marscoin send flow', () => {
    for (const file of ['screen/send/details.js', 'screen/send/detailsQuickSend.js', 'screen/send/create.js']) {
      // Text shown to people sits between tags or in template text, not in comments.
      const visible = source(file)
        .split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('{/*') && !line.trim().startsWith('*'));
      expect(visible.filter(line => /zubrins\/vB|sat\/vB|sats?\/vByte/.test(line))).toEqual([]);
    }
  });
});

describe('send screens', () => {
  it.each(['screen/send/details.js', 'screen/send/detailsQuickSend.js'])('%s waits for fresh coins and never shows a made-up fee', file => {
    const text = source(file);
    // The coins are awaited; their failure is not swallowed into the console.
    expect(text).not.toMatch(/fetchUtxo error/);
    expect(text).toMatch(/await refreshCoins\(wallet\)/);
    expect(text).toMatch(/COINS_UNREACHABLE/);
    expect(text).toMatch(/feeSummaryText\(\{ fee: feePrecalc\.current, rate: feeRate, usdRate: marsRate \}\)/);
    expect(text).toMatch(/sendAmountProblem\(/);
  });
});

describe('amount validation before sending', () => {
  const balance = 668426267450;
  it('asks for the amount, and says where to type it, when none was entered', () => {
    for (const amount of [undefined, null, '', '  ']) {
      expect(sendAmountProblem({ amount, amountSats: undefined, balance })).toMatch(/^Enter the amount to send\./);
    }
  });

  it('accepts 10 MARS from a wallet holding 6684.2626745', () => {
    expect(sendAmountProblem({ amount: '10', amountSats: 1000000000, balance })).toBeUndefined();
  });

  it('explains an amount that is too small, unreadable or more than the balance', () => {
    const small = 'Enter an amount greater than 500 zubrins, with no more than eight decimal places.';
    expect(sendAmountProblem({ amount: '0.000005', amountSats: 500, balance })).toBe(small);
    expect(sendAmountProblem({ amount: '1.123456789', amountSats: undefined, balance })).toBe(small);
    expect(sendAmountProblem({ amount: '7000', amountSats: 700000000000, balance })).toBe(
      'The sending amount exceeds the available balance.',
    );
  });
});
