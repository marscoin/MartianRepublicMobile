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
