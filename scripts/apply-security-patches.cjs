const { spawnSync } = require('child_process');
const { readFileSync } = require('fs');
for (const file of ['scripts/electrum-authenticated-tls.patch', 'scripts/react-native-tcp-socket-tls.patch']) {
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
