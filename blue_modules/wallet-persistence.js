// First launch can ask for the backup twice at once. Both callers must use the
// same key, including while the first Keychain write is still pending.
export function createRealmKeyLoader(keychain, randomBytes) {
  let pending;
  return () => {
    if (!pending) {
      pending = (async () => {
        const service = 'realm_encryption_key';
        const credentials = await keychain.getGenericPassword({ service });
        if (credentials) return credentials.password;
        const password = (await randomBytes(64)).toString('hex');
        if (!(await keychain.setGenericPassword(service, password, { service }))) {
          throw new Error('Could not initialize secure backup storage.');
        }
        return password;
      })().catch(error => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}

export async function persistWalletData({ setItem, data, flagKey, encrypted, openBackup, writeBackup, onBackupError }) {
  await setItem('data', data);
  await setItem(flagKey, encrypted);
  // Secure storage is authoritative. A cache/backup failure after this point
  // must not roll an imported wallet out of memory or report a failed import.
  let backup;
  try {
    backup = await openBackup();
    writeBackup(backup, 'data', data);
    writeBackup(backup, flagKey, encrypted);
  } catch (_) {
    onBackupError();
  } finally {
    try {
      backup?.close();
    } catch (_) {
      onBackupError();
    }
  }
}
