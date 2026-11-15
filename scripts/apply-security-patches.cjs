const { spawnSync } = require('child_process');
const { readFileSync } = require('fs');

// Every patch is applied once, however often `npm install` runs. A plain `patch -p1 < file`
// on an already patched tree offers to reverse the patch, and takes that offer when nobody answers.
const patches = [
  // Android build fixes for old native modules
  'scripts/rn-ldk.patch',
  'scripts/react-native-widget-center.patch',
  'scripts/react-native-qrcode-local-image.patch',
  'scripts/react-native-document-picker.patch',
  'scripts/realm.patch',
  // Certificate checks for the Electrum connection
  'scripts/electrum-authenticated-tls.patch',
  'scripts/react-native-tcp-socket-tls.patch',
];

for (const file of patches) {
  const input = readFileSync(file);
  // Repeated installs must retain the protection; unexpected dependency changes
  // fail the install so a release cannot silently lose certificate checks.
  // --force prevents GNU patch from silently ignoring -R when a dependency is
  // still unpatched; without it a clean Linux install can look protected.
  const applied = spawnSync('patch', ['--batch', '--force', '--dry-run', '-R', '-p1'], {
    input,
  });
  if (applied.status === 0) continue;
  const result = spawnSync('patch', ['--batch', '--forward', '-p1'], {
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
