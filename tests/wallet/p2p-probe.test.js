import { EventEmitter } from 'events';
import * as bitcoin from 'bitcoinjs-lib';
import { MARSQNET, frame, probePeer, readVersion, versionMessage } from '../../blue_modules/p2p-probe';

// What a marsqnet node sent on 2026-11-10 (rebuilt from its fields).
function nodeVersion({ protocol = 70060, agent = '/Marscoin:28.1.0(marsqnet-v2)/', height = 22394, magic = MARSQNET.magic } = {}) {
  const head = Buffer.alloc(80);
  head.writeInt32LE(protocol, 0);
  const tail = Buffer.alloc(5);
  tail.writeInt32LE(height, 0);
  return frame(magic, 'version', Buffer.concat([head, Buffer.from([agent.length]), Buffer.from(agent, 'ascii'), tail]));
}

function fakeNet(script) {
  const sockets = [];
  return {
    sockets,
    createConnection: () => {
      const socket = new EventEmitter();
      socket.written = [];
      socket.write = data => {
        socket.written.push(data);
        script(socket, data);
      };
      socket.destroy = () => {
        socket.destroyed = true;
      };
      sockets.push(socket);
      setTimeout(() => socket.emit('connect'), 0);
      return socket;
    },
  };
}
const ask = (net, extra = {}) => probePeer({ net, ...MARSQNET.peers[0], magic: MARSQNET.magic, protocol: MARSQNET.protocol, nonce: Buffer.alloc(8, 7), ...extra });

describe('peer-to-peer handshake', () => {
  it('sends a well-formed greeting for the right network', () => {
    const message = versionMessage({ magic: MARSQNET.magic, protocol: 70060, time: 1794330000, nonce: Buffer.alloc(8, 7) });
    expect(message.slice(0, 4).toString('hex')).toBe('4d5132fa');
    expect(message.slice(4, 11).toString('ascii')).toBe('version');
    const payload = message.slice(24);
    expect(message.readUInt32LE(16)).toBe(payload.length);
    expect(bitcoin.crypto.hash256(payload).slice(0, 4).equals(message.slice(20, 24))).toBe(true);
    expect(payload.readInt32LE(0)).toBe(70060);
    expect(payload.readUInt32LE(12)).toBe(1794330000);
    expect(payload.slice(81, 81 + payload[80]).toString('ascii')).toBe('/martianrepublic/');
  });

  it('reads the node’s software and chain height', () => {
    expect(readVersion(MARSQNET.magic, nodeVersion())).toEqual({ protocol: 70060, agent: '/Marscoin:28.1.0(marsqnet-v2)/', height: 22394 });
  });

  it('waits for the whole answer and rejects anything that is not this network', () => {
    const full = nodeVersion();
    expect(readVersion(MARSQNET.magic, full.slice(0, 10))).toBeNull();
    expect(readVersion(MARSQNET.magic, full.slice(0, 60))).toBeNull();
    expect(() => readVersion(MARSQNET.magic, nodeVersion({ magic: 'f9beb4d9' }))).toThrow('not a node of that network');
    const damaged = Buffer.from(full);
    damaged[40] ^= 1; // eslint-disable-line no-bitwise
    expect(() => readVersion(MARSQNET.magic, damaged)).toThrow('damaged');
    expect(() => readVersion(MARSQNET.magic, frame(MARSQNET.magic, 'verack', Buffer.alloc(0)))).toThrow('unexpectedly');
  });

  it('greets, reads the answer in pieces and hangs up', async () => {
    const answer = nodeVersion();
    const net = fakeNet(socket => {
      socket.emit('data', answer.slice(0, 30));
      socket.emit('data', answer.slice(30));
    });
    await expect(ask(net)).resolves.toMatchObject({ height: 22394 });
    expect(net.sockets[0].written).toHaveLength(1);
    expect(net.sockets[0].destroyed).toBe(true);
  });

  it('reports a node that hangs up, refuses or stays silent', async () => {
    await expect(ask(fakeNet(socket => socket.emit('close')))).rejects.toThrow('closed the connection');
    await expect(ask(fakeNet(socket => socket.emit('error', new Error('ECONNREFUSED'))))).rejects.toThrow('Could not connect');
    await expect(ask(fakeNet(() => {}), { timeout: 20 })).rejects.toThrow('No answer in time');
  });
});
