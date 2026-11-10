const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

it('protects a fresh dependency install, survives repeated installs, and rejects incompatible source', () => {
  const root = path.resolve(__dirname, '../..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marswallet-security-patches-'));
  const dependencies = [
    'node_modules/electrum-client/lib/client.js',
    'node_modules/react-native-tcp-socket/android/src/main/java/com/asterinet/react/tcpsocket/TcpSocketClient.java',
  ];
  const patches = ['scripts/electrum-authenticated-tls.patch', 'scripts/react-native-tcp-socket-tls.patch'];
  try {
    for (const file of [...dependencies, ...patches, 'scripts/apply-security-patches.cjs']) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      fs.copyFileSync(path.join(root, file), path.join(directory, file));
    }
    // Begin with the actual upstream dependency text, without protections.
    for (const file of patches) {
      const reversed = spawnSync('patch', ['--batch', '--force', '-R', '-p1'], {
        cwd: directory,
        input: fs.readFileSync(path.join(directory, file)),
      });
      expect(reversed.status).toBe(0);
    }
    expect(fs.readFileSync(path.join(directory, dependencies[0]), 'utf8')).toContain('rejectUnauthorized: false');
    for (let run = 0; run < 2; run++) {
      const result = spawnSync(process.execPath, ['scripts/apply-security-patches.cjs'], { cwd: directory });
      expect({ status: result.status, error: result.stderr.toString() }).toEqual({ status: 0, error: '' });
      expect(fs.readFileSync(path.join(directory, dependencies[0]), 'utf8')).toContain('rejectUnauthorized: true');
      expect(fs.readFileSync(path.join(directory, dependencies[1]), 'utf8')).toContain('setEndpointIdentificationAlgorithm("HTTPS")');
    }
    fs.writeFileSync(path.join(directory, dependencies[0]), '// incompatible dependency update\n');
    const incompatible = spawnSync(process.execPath, ['scripts/apply-security-patches.cjs'], { cwd: directory });
    expect(incompatible.status).not.toBe(0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
