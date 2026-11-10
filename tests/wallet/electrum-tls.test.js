import { EventEmitter } from 'events';
const Client = require('electrum-client/lib/client');
class Socket extends EventEmitter {
  setTimeout() {}
  setEncoding() {}
  setKeepAlive() {}
  setNoDelay() {}
}

describe('Electrum certificate verification', () => {
  it('requires authenticated TLS even when the caller requests an insecure connection, including reconnects', () => {
    const options = [];
    class TLSSocket extends Socket {
      constructor(socket, settings) {
        super();
        options.push(settings);
      }
    }
    const client = new Client({ Socket }, { TLSSocket }, 50002, 'electrum.example.org', 'tls', { rejectUnauthorized: false });
    client.initSocket();
    expect(options).toEqual([
      { rejectUnauthorized: true, servername: 'electrum.example.org' },
      { rejectUnauthorized: true, servername: 'electrum.example.org' },
    ]);
  });
});
