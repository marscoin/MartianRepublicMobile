// Runs three phone voters through a real ballot server (ballotserver/server.py
// from the martianrepublic repository). Skipped unless BALLOT_SERVER_URL points
// at a locally started test instance, for example ws://127.0.0.1:3679. Never
// point it at the production server: it uses synthetic identities.
import crypto from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../../blue_modules/constants';
import { createGenerator, generateShuffleKeypair } from '../../blue_modules/voting/ballot-crypto';
import { BALLOT_VALUE, ballotKey } from '../../blue_modules/voting/ballot-transactions';
import { createShuffleSession } from '../../blue_modules/voting/shuffle-session';

const URL = process.env.BALLOT_SERVER_URL;
const ROOM = process.env.BALLOT_ROOM || 'LIVETEST';
const NETWORK = Marscoin.mainnet;
const live = URL && /^wss?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL) ? describe : describe.skip;

function voter(n) {
  const seed = crypto.createHash('sha512').update(`live-voter-${ROOM}-${n}`).digest();
  const node = bitcoin.bip32.fromSeed(seed, NETWORK).derivePath("m/44'/2'/0'/0/0");
  const civicKey = bitcoin.ECPair.fromPrivateKey(node.privateKey, { network: NETWORK });
  const civicAddress = bitcoin.payments.p2pkh({ pubkey: civicKey.publicKey, network: NETWORK }).address;
  const funding = new bitcoin.Transaction();
  funding.addInput(Buffer.alloc(32, n), 0);
  funding.addOutput(bitcoin.address.toOutputScript(civicAddress, NETWORK), 60000000 + n);
  const generator = createGenerator(crypto.randomBytes(64));
  return {
    civicKey,
    civicAddress,
    generator,
    input: { txid: funding.getId(), vout: 0, value: 60000000 + n, rawTx: funding.toHex() },
    ballot: ballotKey(seed, 14),
    keypair: generateShuffleKeypair(generator),
  };
}

// Connects one voter and resolves with the joint transaction. `leaveOn` makes
// the voter drop the connection when a frame with that prefix arrives.
function vote(v, room, { delay = 0, leaveOn } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(URL);
    const timer = setTimeout(() => done(reject, new Error(`${v.civicAddress} timed out`)), 40000);
    const done = (settle, value) => {
      clearTimeout(timer);
      socket.close();
      settle(value);
    };
    const session = createShuffleSession({
      civicAddress: v.civicAddress,
      room,
      keypair: v.keypair,
      ballotAddress: v.ballot.address,
      input: v.input,
      civicKey: v.civicKey,
      generator: v.generator,
      send: message => socket.send(message),
      onProgress: () => {},
      onJoin: join => done(resolve, join),
      onError: error => done(reject, error),
    });
    socket.onmessage = event => {
      const message = String(event.data);
      if (leaveOn && message.startsWith(leaveOn)) return done(resolve, null);
      session.handle(message);
    };
    socket.onerror = () => done(reject, new Error(`${v.civicAddress} could not connect`));
    // Stagger arrivals as real voters would.
    socket.onopen = () => setTimeout(() => session.start(), delay);
  });
}

function expectBallots(joins, voters) {
  expect(new Set(joins.map(join => join.txid)).size).toBe(1);
  const tx = bitcoin.Transaction.fromHex(joins[0].hex);
  expect(tx.ins).toHaveLength(voters.length);
  const paid = Object.fromEntries(tx.outs.map(out => [bitcoin.address.fromOutputScript(out.script, NETWORK), out.value]));
  for (const v of voters) {
    expect(paid[v.ballot.address]).toBe(BALLOT_VALUE);
    expect(paid[v.civicAddress]).toBe(v.input.value - 20000000);
  }
}

live('Ballot shuffle against the real server', () => {
  it('completes a three-voter round', async () => {
    const voters = [voter(1), voter(2), voter(3)];
    expectBallots(await Promise.all(voters.map((v, i) => vote(v, ROOM, { delay: i * 400 }))), voters);
  }, 60000);

  it('completes a second round in the same room, and one in another room', async () => {
    const again = [voter(4), voter(5), voter(6)];
    expectBallots(await Promise.all(again.map((v, i) => vote(v, ROOM, { delay: i * 400 }))), again);
    const elsewhere = [voter(7), voter(8), voter(9)];
    expectBallots(await Promise.all(elsewhere.map((v, i) => vote(v, `${ROOM}B`, { delay: i * 400 }))), elsewhere);
  }, 90000);

  // Needs a server started with a short BALLOT_GATHER_SECONDS (for example 3).
  it('lets a round grow beyond the minimum while it gathers', async () => {
    const voters = [voter(20), voter(21), voter(22), voter(23), voter(24)];
    expectBallots(await Promise.all(voters.map((v, i) => vote(v, `${ROOM}D`, { delay: i * 300 }))), voters);
  }, 90000);

  it('starts over with the remaining voters when one leaves mid-shuffle', async () => {
    const [a, b, quitter, late] = [voter(10), voter(11), voter(12), voter(13)];
    const room = `${ROOM}C`;
    const staying = [vote(a, room), vote(b, room, { delay: 400 })];
    // The third voter disappears when asked to shuffle; a fourth arrives later.
    expect(await vote(quitter, room, { delay: 800, leaveOn: 'PERFORM_SHUFFLE#' })).toBeNull();
    const joins = await Promise.all([...staying, vote(late, room, { delay: 500 })]);
    expectBallots(joins, [a, b, late]);
  }, 90000);
});
