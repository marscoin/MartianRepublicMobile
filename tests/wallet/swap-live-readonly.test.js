// Read-only checks against the live swap relay, Marscoin explorer and Bitcoin
// services. Skipped unless SWAP_LIVE=1. Nothing is accepted, signed or sent.
import tls from 'tls';
import { headerMerkleRoot, merkleRoot } from '../../blue_modules/swap/htlc';
import { createEsplora } from '../../blue_modules/swap/esplora';
import { createMarsSwapChain, SWAP_RELAY } from '../../blue_modules/swap/mars-chain';
import { bitsToTarget, targetDifficulty, verifyHeaderChain } from '../../blue_modules/swap/mars-headers';
import { rankOffers } from '../../blue_modules/swap/safety';
import { MARS_MAINNET_GENESIS } from '../../blue_modules/mars-electrum-peer';

const live = process.env.SWAP_LIVE === '1' ? describe : describe.skip;

// A minimal Electrum JSON-RPC client over validated TLS.
function connect() {
  const socket = tls.connect({ host: SWAP_RELAY.host, port: Number(SWAP_RELAY.ssl), servername: SWAP_RELAY.host });
  const pending = new Map();
  let buffer = '';
  let id = 0;
  socket.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const waiting = pending.get(message.id);
      if (!waiting) continue;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message));
      else waiting.resolve(message.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.once('secureConnect', () => (socket.authorized ? resolve() : reject(new Error(socket.authorizationError))));
    socket.once('error', reject);
  });
  const request = async (method, params) => {
    await ready;
    return new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      socket.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };
  return { request, close: () => socket.destroy() };
}

live('Live swap services (read-only)', () => {
  let client;
  let chain;
  const esplora = createEsplora({ fetch });
  beforeAll(async () => {
    client = connect();
    chain = createMarsSwapChain({ request: client.request, fetch });
    await client.request('server.version', ['martianrepublic-test', '1.4']);
  });
  afterAll(() => client.close());

  it('reaches the relay over validated TLS on Marscoin mainnet', async () => {
    expect((await client.request('server.features', [])).genesis_hash).toBe(MARS_MAINNET_GENESIS);
    expect(await chain.tipHeight()).toBeGreaterThan(3598000);
  });

  it('agrees on the Bitcoin tip across both services and reads a fee rate', async () => {
    const [agreed, tip, feeRate] = await Promise.all([esplora.agreedTipHeight(), esplora.tipHeight(), esplora.feeRate()]);
    expect(tip - agreed).toBeLessThanOrEqual(2);
    expect(agreed).toBeGreaterThan(900000);
    expect(feeRate).toBeGreaterThan(0);
    console.log(`Bitcoin tip ${agreed}, fee ${feeRate} sat/vB`);
  });

  it('agrees on the Marscoin height between the relay and the explorer node', async () => {
    const [relay, agreed] = await Promise.all([chain.tipHeight(), chain.agreedTipHeight()]);
    expect(Math.abs(agreed - relay)).toBeLessThanOrEqual(3);
  });

  it('follows a real Bitcoin output to its spender and verifies the bytes', async () => {
    // The first output of the first transaction in block 170 was spent long ago.
    const txid = 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16';
    const spend = await esplora.outspend(txid, 0);
    expect(spend).toMatchObject({ spent: true, confirmed: true });
    expect(await esplora.transactionHex(spend.txid)).toMatch(/^[0-9a-f]+$/);
  });

  it('verifies proof of work on the newest confirmed blocks', async () => {
    const tip = await chain.tipHeight();
    const hexes = [];
    for (let height = tip - 4; height <= tip - 2; height++) hexes.push(await chain.header(height));
    const headers = verifyHeaderChain(hexes);
    expect(headers).toHaveLength(3);
    console.log(`difficulty ${Math.round(targetDifficulty(bitsToTarget(headers[2].bits)))} at block ${tip - 2}`);
  });

  it('reads and ranks the live order book', async () => {
    const [offers, marsHeight, btcHeight, feeRate] = await Promise.all([
      chain.offers(),
      chain.tipHeight(),
      esplora.tipHeight(),
      esplora.feeRate(),
    ]);
    const ranked = rankOffers(offers, { marsHeight, btcHeight, feeRate, now: Date.now() / 1000 });
    console.log(
      ranked.map(o => `${o.marsAmount / 1e8} MARS for ${o.btcAmount} sats${o.problem ? ` [${o.problem}]` : ''}`).join('\n') || 'no offers',
    );
    for (const offer of ranked) expect(offer.makerPubkey).toMatch(/^0[23][0-9a-f]{64}$/);
  });

  it('proves a confirmed Marscoin transaction against its merge-mined block header, and the explorer agrees', async () => {
    const height = (await chain.tipHeight()) - 10;
    // The coinbase of a recent block, located through the explorer.
    const hash = (await (await fetch(`https://explore.marscoin.org/api/block-index/${height}`)).json()).blockHash;
    const txid = (await (await fetch(`https://explore.marscoin.org/api/block/${hash}`)).json()).tx[0];
    const proof = await chain.merkle(txid, height);
    expect(merkleRoot(txid, proof.branch, proof.position)).toBe(headerMerkleRoot(await chain.header(height)));
    const output = await chain.explorerOutput(txid, 0);
    expect(output.confirmations).toBeGreaterThanOrEqual(10);
    expect(output.value).toBeGreaterThan(0);
    expect(output.scriptHex).toMatch(/^[0-9a-f]+$/);
    const hex = await chain.transactionHex(txid);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });
});
