// The Marscoin Foundation server with a publicly trusted certificate. Verified
// against the Marscoin mainnet genesis and a live header subscription on
// 2026-11-09. It is also the atomic swap relay.
/** @type {{ host: string, ssl?: string, tcp?: string }} */
export const defaultMarsElectrumPeer = { host: 'electrum.marscoin.org', ssl: '50002' };
export const MARS_MAINNET_GENESIS = '06e005f86644f15d2e4c62b59a038c798a3b0816ba58dcc8c91e02ce5a685299';

export function assertMarsMainnet(features) {
  if (features?.genesis_hash !== MARS_MAINNET_GENESIS) {
    throw new Error('Electrum server is not on Marscoin mainnet.');
  }
}

export function selectMarsElectrumPeer(savedPeer) {
  if (!savedPeer?.host || (!savedPeer.tcp && !savedPeer.ssl)) {
    return { ...defaultMarsElectrumPeer };
  }

  // Migrate the bundled endpoints used by old releases: bare addresses cannot
  // pass certificate validation (147.182.177.23 presents a certificate that
  // expired on 2026-10-28). Keep custom servers and nonstandard ports intact,
  // including privately operated and onion servers.
  const oldHost = ['161.35.136.251', '164.90.138.207', '147.182.177.23'].includes(savedPeer.host);
  const oldPorts = (!savedPeer.tcp || String(savedPeer.tcp) === '50001') && (!savedPeer.ssl || String(savedPeer.ssl) === '50002');
  return oldHost && oldPorts ? { ...defaultMarsElectrumPeer } : { ...savedPeer };
}
