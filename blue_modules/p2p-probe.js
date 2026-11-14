// A first handshake with a Marscoin-family node over its peer-to-peer
// protocol: we send `version` and read the node's own `version`, which names
// its software and the height of its chain. Nothing else is exchanged.
import * as bitcoin from 'bitcoinjs-lib';

// Marsqnet v2, Marscoin's post-quantum test network (doc/wiki-marsqnet-quickstart.md
// in the marscoin repository).
export const MARSQNET = {
  magic: '4d5132fa',
  protocol: 70060, // nodes drop peers below 70050
  peers: [
    { host: '161.35.136.251', port: 29348 },
    { host: '137.184.66.189', port: 29348 },
    { host: '159.203.79.101', port: 29348 },
  ],
};

const AGENT = '/martianrepublic/';
const HEADER = 24;

function int64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32LE(value >>> 0, 0); // eslint-disable-line no-bitwise
  buffer.writeUInt32LE(Math.floor(value / 4294967296), 4);
  return buffer;
}

export function frame(magic, command, payload) {
  const header = Buffer.alloc(HEADER);
  Buffer.from(magic, 'hex').copy(header, 0);
  header.write(command, 4, 'ascii');
  header.writeUInt32LE(payload.length, 16);
  bitcoin.crypto.hash256(payload).copy(header, 20, 0, 4);
  return Buffer.concat([header, payload]);
}

export function versionMessage({ magic, protocol, time, nonce }) {
  const version = Buffer.alloc(4);
  version.writeInt32LE(protocol, 0);
  // An address of "nobody": we neither accept connections nor relay.
  const address = Buffer.concat([Buffer.alloc(8), Buffer.alloc(10), Buffer.from('ffff', 'hex'), Buffer.alloc(4), Buffer.alloc(2)]);
  const agent = Buffer.from(AGENT, 'ascii');
  const payload = Buffer.concat([
    version,
    Buffer.alloc(8), // no services
    int64(time),
    address,
    address,
    nonce,
    Buffer.from([agent.length]),
    agent,
    Buffer.alloc(4), // our height: we have no chain
    Buffer.from([0]), // do not send us transactions
  ]);
  return frame(magic, 'version', payload);
}

// The node's `version` from the bytes received so far, or null while it is
// incomplete. Throws when the bytes are not this network's protocol.
export function readVersion(magic, received) {
  if (received.length < HEADER) return null;
  if (received.slice(0, 4).toString('hex') !== magic) throw new Error('This is not a node of that network.');
  const command = received.slice(4, 16).toString('ascii').replace(/\0+$/, '');
  const length = received.readUInt32LE(16);
  if (command !== 'version' || length < 85 || length > 1024) throw new Error('The node answered unexpectedly.');
  if (received.length < HEADER + length) return null;
  const payload = received.slice(HEADER, HEADER + length);
  if (!bitcoin.crypto.hash256(payload).slice(0, 4).equals(received.slice(20, 24))) throw new Error('The node’s answer was damaged.');
  const agentLength = payload[80];
  if (agentLength > 200 || 81 + agentLength + 4 > payload.length) throw new Error('The node answered unexpectedly.');
  return {
    protocol: payload.readInt32LE(0),
    agent: payload
      .slice(81, 81 + agentLength)
      .toString('ascii')
      .replace(/[^\x20-\x7e]/g, ''),
    height: payload.readInt32LE(81 + agentLength),
  };
}

// Connect, greet, read the answer, hang up. `net` is Node's or the app's TCP module.
export function probePeer({ net, host, port, magic, protocol, now = Date.now, nonce, timeout = 8000 }) {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let done = false;
    const socket = net.createConnection({ host, port });
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* already closed */
      }
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('No answer in time.')), timeout);
    socket.on('connect', () => socket.write(versionMessage({ magic, protocol, time: Math.floor(now() / 1000), nonce })));
    socket.on('data', chunk => {
      received = Buffer.concat([received, Buffer.from(chunk)]);
      try {
        const version = readVersion(magic, received);
        if (version) finish(null, version);
      } catch (error) {
        finish(error);
      }
    });
    socket.on('error', () => finish(new Error('Could not connect.')));
    socket.on('close', () => finish(new Error('The node closed the connection.')));
  });
}
