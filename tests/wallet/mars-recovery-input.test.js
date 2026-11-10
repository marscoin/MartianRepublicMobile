import { validateMarsRecoveryInput } from '../../blue_modules/mars-recovery-input';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('recovery input guidance', () => {
  it.each(['xpub', 'tpub', 'ypub', 'zpub', 'upub', 'vpub'])('recognizes a scanned %s as public information', prefix => {
    const result = validateMarsRecoveryInput(`${prefix}D6NzVbkrYhZ4Y`);
    expect(result).toMatchObject({ valid: false, code: 'public_key' });
    expect(result.message).toContain('recovery phrase');
    expect(result.message).not.toContain('D6NzVbkrYhZ4Y');
  });
  it('explains a public address and a payment QR', () => {
    expect(validateMarsRecoveryInput('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1').code).toBe('address');
    expect(validateMarsRecoveryInput('marscoin:MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1?amount=1').code).toBe('address');
  });
  it('normalizes whitespace and capitalization without changing word order', () => {
    expect(validateMarsRecoveryInput(`  ${phrase.toUpperCase().replace(/ /g, '\n  ')} `)).toEqual({ valid: true, phrase });
  });
  it('distinguishes empty, incomplete, and checksum-invalid input', () => {
    expect(validateMarsRecoveryInput(null).code).toBe('empty');
    expect(validateMarsRecoveryInput('abandon about').code).toBe('word_count');
    expect(validateMarsRecoveryInput(Array(12).fill('abandon').join(' ')).code).toBe('invalid_phrase');
  });
});
