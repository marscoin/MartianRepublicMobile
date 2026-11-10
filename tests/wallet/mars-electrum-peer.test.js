import {
  assertMarsMainnet,
  defaultMarsElectrumPeer,
  MARS_MAINNET_GENESIS,
  selectMarsElectrumPeer,
} from '../../blue_modules/mars-electrum-peer';

describe('Marscoin server selection', () => {
  it('accepts the verified Marscoin network and rejects another chain or missing metadata', () => {
    expect(() => assertMarsMainnet({ genesis_hash: MARS_MAINNET_GENESIS })).not.toThrow();
    expect(() =>
      assertMarsMainnet({
        genesis_hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      }),
    ).toThrow('Marscoin mainnet');
    expect(() => assertMarsMainnet({})).toThrow('Marscoin mainnet');
  });
  it.each([null, undefined, {}, { host: 'localhost' }])('selects TLS for an unconfigured wallet', peer => {
    expect(selectMarsElectrumPeer(peer)).toEqual(defaultMarsElectrumPeer);
    expect(selectMarsElectrumPeer(peer).tcp).toBeUndefined();
  });

  it.each(['161.35.136.251', '164.90.138.207', '147.182.177.23'])('migrates the former bundled server %s', host => {
    expect(selectMarsElectrumPeer({ host, tcp: '50001' })).toEqual(defaultMarsElectrumPeer);
    expect(selectMarsElectrumPeer({ host, ssl: '50002' })).toEqual(defaultMarsElectrumPeer);
  });

  it('tries the second bundled server after a failed connection, and comes back round', () => {
    expect(selectMarsElectrumPeer(null, 0)).toEqual({ host: 'electrum.marscoin.org', ssl: '50002' });
    expect(selectMarsElectrumPeer(null, 1)).toEqual({ host: 'electrum2.marscoin.org', ssl: '50002' });
    expect(selectMarsElectrumPeer(null, 2)).toEqual({ host: 'electrum.marscoin.org', ssl: '50002' });
    // A retired address migrates into the same rotation.
    expect(selectMarsElectrumPeer({ host: '147.182.177.23', ssl: '50002' }, 1).host).toBe('electrum2.marscoin.org');
    // The server last connected to is stored like a custom one, but still rotates.
    expect(selectMarsElectrumPeer({ host: 'electrum.marscoin.org', ssl: '50002' }, 1).host).toBe('electrum2.marscoin.org');
    expect(selectMarsElectrumPeer({ host: 'electrum2.marscoin.org', ssl: '50002' }, 0).host).toBe('electrum.marscoin.org');
  });

  it('never rotates away from a server the person configured', () => {
    for (const attempt of [0, 1, 2, 7]) {
      expect(selectMarsElectrumPeer({ host: 'my-server.example', ssl: '443' }, attempt)).toEqual({ host: 'my-server.example', ssl: '443' });
      expect(selectMarsElectrumPeer({ host: 'electrum.marscoin.org', ssl: '60002' }, attempt).ssl).toBe('60002');
    }
  });

  it('defaults to a named host so the certificate can be validated', () => {
    expect(defaultMarsElectrumPeer).toEqual({ host: 'electrum.marscoin.org', ssl: '50002' });
  });

  it.each([
    { host: 'my-server.example', ssl: '443' },
    { host: 'private-server.onion', tcp: '50001' },
    { host: '161.35.136.251', ssl: '60002' },
  ])('preserves an explicitly configured server: %p', peer => {
    expect(selectMarsElectrumPeer(peer)).toEqual(peer);
    expect(selectMarsElectrumPeer(peer)).not.toBe(peer);
  });
});
