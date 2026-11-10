import { validateMnemonic } from 'bip39';

export function validateMarsRecoveryInput(input) {
  const phrase = typeof input === 'string' ? input.normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ') : '';
  const fail = (code, message) => ({ valid: false, code, message });
  if (!phrase) return fail('empty', 'Enter or scan your recovery phrase to continue.');
  if (/^[xtyzuv]pub/i.test(phrase.replace(/ /g, ''))) {
    return fail(
      'public_key',
      'This is an extended public key. It provides read-only access. Scan or enter your recovery phrase to restore this wallet.',
    );
  }
  if (/^(marscoin:|[mM][1-9A-HJ-NP-Za-km-z]{25,34}$)/.test(String(input).trim())) {
    return fail('address', 'This is a public Marscoin address. To restore your wallet, use the recovery phrase from your backup.');
  }
  if (/^[xtyzuv]prv/i.test(phrase) || /^[5KL7][1-9A-HJ-NP-Za-km-z]{49,51}$/.test(String(input).trim())) {
    return fail(
      'private_key',
      'This is a private key. This restore screen needs your wallet’s recovery phrase: the words from your backup.',
    );
  }
  if (![12, 15, 18, 21, 24].includes(phrase.split(' ').length)) {
    return fail('word_count', 'A recovery phrase has 12, 15, 18, 21, or 24 words. Enter all the words from your backup, in order.');
  }
  if (!validateMnemonic(phrase))
    return fail('invalid_phrase', 'The recovery phrase does not match. Check each word and its order against your backup.');
  return { valid: true, phrase };
}

export function requireMarsRecoveryPhrase(input) {
  const result = validateMarsRecoveryInput(input);
  if (!result.valid) {
    const error = new Error(result.message);
    error.name = 'RecoveryInputError';
    error.code = result.code;
    throw error;
  }
  return result.phrase;
}
