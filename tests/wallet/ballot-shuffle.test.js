import crypto from 'crypto';
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../../blue_modules/constants';
import {
  createGenerator,
  decryptWith,
  encryptFor,
  generateShuffleKeypair,
  onionEncrypt,
  shuffled,
} from '../../blue_modules/voting/ballot-crypto';
import {
  BALLOT_VALUE,
  ballotKey,
  ballotRoom,
  buildJoinPsbt,
  buildVote,
  checkJoinPsbt,
  chooseBallotInput,
  encodeSource,
  proposalCid,
  readVote,
} from '../../blue_modules/voting/ballot-transactions';
import { createShuffleSession } from '../../blue_modules/voting/shuffle-session';

const NETWORK = Marscoin.mainnet;
const CID = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const generatorFor = label => createGenerator(crypto.createHash('sha512').update(label).digest());

// RSA key generation in pure JavaScript is slow; share keys across tests.
const keypairs = ['a', 'b', 'c', 'd'].map(label => generateShuffleKeypair(generatorFor(`rsa-${label}`)));

function voter(n) {
  const seed = Buffer.alloc(64, n);
  const node = bitcoin.bip32.fromSeed(seed, NETWORK).derivePath("m/44'/2'/0'/0/0");
  const civicKey = bitcoin.ECPair.fromPrivateKey(node.privateKey, { network: NETWORK });
  const civicAddress = bitcoin.payments.p2pkh({ pubkey: civicKey.publicKey, network: NETWORK }).address;
  // A previous transaction paying this voter's civic address.
  const funding = new bitcoin.Transaction();
  funding.addInput(Buffer.alloc(32, n), 0);
  funding.addOutput(bitcoin.address.toOutputScript(civicAddress, NETWORK), 50000000 + n);
  const input = { txid: funding.getId(), vout: 0, value: 50000000 + n, rawTx: funding.toHex() };
  const ballot = ballotKey(seed, 14);
  return { seed, civicKey, civicAddress, input, ballot, keypair: keypairs[n - 1] };
}

// A faithful model of ballotserver/server.py for one room.
function ballotServer() {
  const room = [];
  const keys = [];
  const names = [];
  const shuffle = {};
  const signatures = {};
  let response = null;
  const toName = name => room.find(member => member.name === name);
  const server = {
    sent: [],
    join(name, deliver) {
      const member = { name, deliver };
      return message => server.receive(member, message);
    },
    receive(member, message) {
      server.sent.push(message);
      if (!member.joined) {
        // A socket enters the room with its first frame.
        member.joined = true;
        room.push(member);
        member.deliver('Welcome to the Ballot issuing server.');
        for (const other of room) {
          other.deliver(`${member.name} has joined the Ballot issuance procedures`);
          other.deliver(`...waiting for ${3 - room.length} more voters to join before ballot shuffle commences...`);
          other.deliver('Please wait...');
        }
        // The real server sends this before the room notices, but a client's
        // reply to it is only processed after they have all been sent.
        member.deliver('JOINED_ACK');
        return;
      }
      if (message.includes('SUBMIT_KEY')) {
        keys.push(message.split('#')[1]);
        names.push(member.name);
        if (room.length >= 3) {
          response = {
            order: Object.fromEntries(keys.map((key, i) => [i, key])),
            peers: Object.fromEntries(keys.map((key, i) => [key, names[i]])),
          };
          const encoded = JSON.stringify({ order: JSON.stringify(response.order), peers: JSON.stringify(response.peers) });
          for (let i = keys.length - 1; i >= 0; i--) toName(names[i]).deliver('INITIATE_SHUFFLE_' + encoded);
          toName(names[0]).deliver('PERFORM_SHUFFLE#{}#{}');
        }
      }
      if (message.includes('PERFORM_SHUFFLE_ACK')) {
        let peer = Number(message.split('#')[1]);
        shuffle[peer] = message.split('#')[2];
        if (Object.keys(shuffle).length < room.length) {
          // Python's ast.literal_eval of {'data': <json>,'sources': <json>}.
          const literal = shuffle[peer];
          expect(literal.startsWith("{'data': ")).toBe(true);
          expect(literal).not.toMatch(/\b(true|false|null)\b/);
          const split = literal.indexOf(",'sources': ");
          const data = JSON.parse(literal.slice("{'data': ".length, split));
          const sources = JSON.parse(literal.slice(split + ",'sources': ".length, -1));
          peer += 1;
          toName(response.peers[response.order[peer]]).deliver(`PERFORM_SHUFFLE#${JSON.stringify(data)}#${JSON.stringify(sources)}`);
        }
      }
      if (message.includes('COLLECT_SIGNATURES')) for (const other of room) other.deliver(`SIGN_TX#${message.split('#')[1]}`);
      if (message.includes('SIGN_TX_COMPLETE')) {
        signatures[Number(message.split('#')[1])] = message.split('#')[2];
        if (Object.keys(signatures).length === room.length)
          for (const other of room) other.deliver(`COMBINE_AND_BROADCAST#${JSON.stringify(signatures)}`);
      }
    },
  };
  return server;
}

function round(voters, { intercept } = {}) {
  const server = ballotServer();
  const results = voters.map(() => ({ progress: [], join: null, error: null }));
  const sessions = voters.map((v, i) => {
    const link = {};
    const session = createShuffleSession({
      civicAddress: v.civicAddress,
      room: ballotRoom(CID),
      keypair: v.keypair,
      ballotAddress: v.ballot.address,
      input: v.input,
      civicKey: v.civicKey,
      generator: generatorFor(`session-${i}`),
      send: message => link.receive(message),
      onProgress: event => results[i].progress.push(event),
      onJoin: join => (results[i].join = join),
      onError: error => (results[i].error = error),
    });
    link.receive = server.join(v.civicAddress, message => session.handle(intercept ? intercept(i, message) : message));
    return session;
  });
  sessions.forEach(session => session.start());
  return { server, results, sessions };
}

describe('Ballot shuffle encryption', () => {
  const generator = generatorFor('encryption');

  it('publishes a 1024-bit key in the form the web client expects', () => {
    const key = crypto.createPublicKey({ key: Buffer.from(keypairs[0].publicKey, 'base64'), format: 'der', type: 'spki' });
    expect(key.asymmetricKeyType).toBe('rsa');
    expect(key.asymmetricKeyDetails.modulusLength).toBe(1024);
    expect(keypairs[0].publicKey).not.toBe(keypairs[1].publicKey);
  });

  it('round-trips a message with a 172-character wrapped key and an OpenSSL ciphertext', () => {
    const text = encryptFor(keypairs[0].publicKey, 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1', generator);
    expect(Buffer.from(text.slice(172), 'base64').slice(0, 8).toString()).toBe('Salted__');
    expect(decryptWith(keypairs[0].privateKey, text)).toBe('MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1');
    expect(() => decryptWith(keypairs[1].privateKey, text)).toThrow('could not be decrypted');
    expect(encryptFor(keypairs[0].publicKey, 'same', generator)).not.toBe(encryptFor(keypairs[0].publicKey, 'same', generator));
  });

  it('decrypts what a standard RSA and OpenSSL implementation produces', () => {
    // The web client: RSA PKCS#1 v1.5 of a passphrase, then OpenSSL AES-256-CBC with an MD5 key schedule.
    const passphrase = crypto.randomBytes(32).toString('base64');
    const key = crypto.createPublicKey({ key: Buffer.from(keypairs[0].publicKey, 'base64'), format: 'der', type: 'spki' });
    const wrapped = crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(passphrase)).toString('base64');
    const salt = crypto.randomBytes(8);
    let material = Buffer.alloc(0);
    let block = Buffer.alloc(0);
    while (material.length < 48) {
      block = crypto
        .createHash('md5')
        .update(Buffer.concat([block, Buffer.from(passphrase), salt]))
        .digest();
      material = Buffer.concat([material, block]);
    }
    const cipher = crypto.createCipheriv('aes-256-cbc', material.slice(0, 32), material.slice(32, 48));
    const body = Buffer.concat([Buffer.from('Salted__'), salt, cipher.update('ballot destination'), cipher.final()]).toString('base64');
    expect(wrapped).toHaveLength(172);
    expect(decryptWith(keypairs[0].privateKey, wrapped + body)).toBe('ballot destination');
  });

  it('wraps one layer per later voter and none for the last', () => {
    const order = keypairs.slice(0, 3).map(pair => pair.publicKey);
    expect(onionEncrypt('target', order, 2, generator)).toBe('target');
    const onion = onionEncrypt('target', order, 0, generator);
    expect(decryptWith(keypairs[2].privateKey, decryptWith(keypairs[1].privateKey, onion))).toBe('target');
    expect(() => decryptWith(keypairs[2].privateKey, onion)).toThrow();
  });

  it('accepts the 1023-bit moduli the website generates about four times in ten', () => {
    const forge = require('node-forge');
    // Any odd 1023-bit number serves for the public operation.
    const n = new forge.jsbn.BigInteger('5' + 'a'.repeat(254) + 'b', 16);
    expect(n.bitLength()).toBe(1023);
    const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(forge.pki.setRsaPublicKey(n, new forge.jsbn.BigInteger('65537')))).getBytes();
    const key = Buffer.from(der, 'binary').toString('base64');
    expect(encryptFor(key, 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1', generator).slice(0, 172)).toMatch(/^[A-Za-z0-9+/]{171}=$/);
    const tooSmall = new forge.jsbn.BigInteger('1' + 'a'.repeat(252) + 'b', 16);
    expect(tooSmall.bitLength()).toBe(1013);
    const smallDer = forge.asn1
      .toDer(forge.pki.publicKeyToAsn1(forge.pki.setRsaPublicKey(tooSmall, new forge.jsbn.BigInteger('65537'))))
      .getBytes();
    expect(() => encryptFor(Buffer.from(smallDer, 'binary').toString('base64'), 'target', generator)).toThrow('unusable');
  });

  it('refuses a weak key from another voter', () => {
    const weak = crypto
      .generateKeyPairSync('rsa', { modulusLength: 512 })
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64');
    expect(() => encryptFor(weak, 'target', generator)).toThrow('unusable');
  });

  it('draws unbiased, seed-dependent permutations', () => {
    const counts = {};
    const g = generatorFor('permutations');
    for (let i = 0; i < 600; i++) {
      const key = shuffled([0, 1, 2], g).join('');
      counts[key] = (counts[key] || 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(6);
    for (const count of Object.values(counts)) expect(count).toBeGreaterThan(60);
    expect(() => createGenerator(Buffer.alloc(8))).toThrow('entropy');
  });
});

describe('Ballot shuffle round', () => {
  const voters = [voter(1), voter(2), voter(3)];

  it('issues every voter an anonymous ballot in one jointly signed transaction', () => {
    const { results } = round(voters);
    expect(results.map(result => result.error)).toEqual([null, null, null]);
    const txid = results[0].join.txid;
    expect(results.map(result => result.join.txid)).toEqual([txid, txid, txid]);
    const tx = bitcoin.Transaction.fromHex(results[0].join.hex);
    expect(tx.ins).toHaveLength(3);
    expect(tx.outs).toHaveLength(6);
    const paid = Object.fromEntries(tx.outs.map(out => [bitcoin.address.fromOutputScript(out.script, NETWORK), out.value]));
    for (const v of voters) {
      expect(paid[v.ballot.address]).toBe(BALLOT_VALUE);
      expect(paid[v.civicAddress]).toBe(v.input.value - 20000000);
    }
    const spent = voters.reduce((sum, v) => sum + v.input.value, 0);
    expect(spent - tx.outs.reduce((sum, out) => sum + out.value, 0)).toBe(30000000);
    expect(results[0].progress.map(event => event.stage)).toEqual(expect.arrayContaining(['waiting', 'shuffling', 'signing']));
    expect(results[2].progress.filter(event => event.stage === 'waiting').pop().present).toBe(3);
  });

  it('never puts a ballot address on the wire unencrypted, nor a voter key beside it', () => {
    const { server } = round(voters);
    const beforeSigning = server.sent.filter(message => message.includes('PERFORM_SHUFFLE_ACK')).join('\n');
    for (const v of voters) expect(beforeSigning).not.toContain(v.ballot.address);
    for (const v of voters) expect(beforeSigning).not.toContain(`"public_key":"${v.keypair.publicKey}"`);
    expect(beforeSigning).toContain('"public_key":""');
  });

  it('refuses to sign a transaction that redirects its ballot', () => {
    const thief = voter(4);
    const { results } = round(voters, {
      intercept: (i, message) => {
        if (i !== 0 || !message.startsWith('SIGN_TX#')) return message;
        const psbt = bitcoin.Psbt.fromBase64(message.split('#')[1], { network: NETWORK });
        const forged = new bitcoin.Psbt({ network: NETWORK });
        forged.setVersion(1);
        psbt.txInputs.forEach((input, n) =>
          forged.addInput({ hash: input.hash, index: input.index, nonWitnessUtxo: psbt.data.inputs[n].nonWitnessUtxo }),
        );
        psbt.txOutputs.forEach(output =>
          forged.addOutput({
            address: output.address === voters[0].ballot.address ? thief.ballot.address : output.address,
            value: output.value,
          }),
        );
        return `SIGN_TX#${forged.toBase64()}`;
      },
    });
    expect(results[0].error.message).toMatch(/does not issue your ballot. Nothing was signed/);
    expect(results.every(result => result.join === null)).toBe(true);
  });

  it('refuses to sign when its change is reduced or its input is missing', () => {
    const [a] = voters;
    const sources = Object.fromEntries(voters.map((v, i) => [i, encodeSource({ ...v.input, address: v.civicAddress })]));
    const targets = Object.fromEntries(voters.map((v, i) => [i, { target: v.ballot.address }]));
    const honest = buildJoinPsbt(sources, targets);
    const context = { input: a.input, civicAddress: a.civicAddress, ballotAddress: a.ballot.address };
    expect(checkJoinPsbt(honest, context)).toBe(0);
    expect(() => checkJoinPsbt(honest, { ...context, input: { ...a.input, value: a.input.value + 1000 } })).toThrow(
      'does not return your change',
    );
    const without = buildJoinPsbt(
      { 0: sources[1], 1: sources[2], 2: encodeSource({ ...voter(4).input, address: voter(4).civicAddress }) },
      targets,
    );
    expect(() => checkJoinPsbt(without, context)).toThrow('does not include your input');
  });

  it('gives only one signature per round', () => {
    // A different transaction that would also pay voter 0 correctly.
    const other = round([voters[0], voters[1], voter(4)]);
    const request = other.server.sent.find(message => message.startsWith('COLLECT_SIGNATURES#')).replace('COLLECT_SIGNATURES#', 'SIGN_TX#');
    const { results, server } = round(voters, {
      intercept: (i, message) => (i === 0 && message.startsWith('COMBINE_AND_BROADCAST#') ? request : message),
    });
    expect(results[0].error.message).toMatch(/second signature. Nothing more was signed/);
    expect(results[0].join).toBeNull();
    expect(server.sent.filter(message => message.startsWith('SIGN_TX_COMPLETE#0#'))).toHaveLength(1);
    expect(results[1].join).not.toBeNull();
  });

  it('reports when its signature has left the phone', () => {
    const { sessions } = round(voters);
    expect(sessions.every(session => session.committed)).toBe(true);
    const [a] = voters;
    const fresh = createShuffleSession({
      civicAddress: a.civicAddress,
      room: 'ROOM',
      keypair: a.keypair,
      ballotAddress: a.ballot.address,
      input: a.input,
      civicKey: a.civicKey,
      generator: generatorFor('fresh'),
      send: () => {},
      onProgress: () => {},
      onJoin: () => {},
      onError: () => {},
    });
    fresh.start();
    fresh.handle('JOINED_ACK');
    expect(fresh.committed).toBe(false);
  });

  it('signs only after every participant is confirmed to be a citizen', async () => {
    const checked = [];
    const run = verify => {
      const server = ballotServer();
      const results = voters.map(() => ({ join: null, error: null }));
      const sessions = voters.map((v, i) => {
        const link = {};
        const session = createShuffleSession({
          civicAddress: v.civicAddress,
          room: ballotRoom(CID),
          keypair: v.keypair,
          ballotAddress: v.ballot.address,
          input: v.input,
          civicKey: v.civicKey,
          generator: generatorFor(`citizens-${i}`),
          send: message => link.receive(message),
          onProgress: () => {},
          onJoin: join => (results[i].join = join),
          onError: error => (results[i].error = error),
          verifyParticipants: i === 0 ? verify : undefined,
        });
        link.receive = server.join(v.civicAddress, message => session.handle(message));
        return session;
      });
      sessions.forEach(session => session.start());
      return { results, server };
    };

    const honest = run(async addresses => checked.push(...addresses));
    expect(honest.server.sent.filter(message => message.startsWith('SIGN_TX_COMPLETE#0#'))).toHaveLength(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(checked.sort()).toEqual(voters.map(v => v.civicAddress).sort());
    expect(honest.results[0].error).toBeNull();
    expect(honest.results[0].join).not.toBeNull();

    const outsider = run(async () => {
      throw new Error('This round included someone who is not a citizen. Nothing was signed.');
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(outsider.results[0].error.message).toMatch(/not a citizen/);
    expect(outsider.server.sent.filter(message => message.startsWith('SIGN_TX_COMPLETE#0#'))).toHaveLength(0);
    expect(outsider.results.every(result => result.join === null)).toBe(true);
  });

  it('reports how many voters are present as a larger round gathers', () => {
    const [a] = voters;
    const progress = [];
    const session = createShuffleSession({
      civicAddress: a.civicAddress,
      room: 'ROOM',
      keypair: a.keypair,
      ballotAddress: a.ballot.address,
      input: a.input,
      civicKey: a.civicKey,
      generator: generatorFor('gathering'),
      send: () => {},
      onProgress: event => progress.push(event),
      onJoin: () => {},
      onError: () => {},
    });
    session.start();
    session.handle('VOTERS_PRESENT#5');
    session.handle('GATHERING#90');
    expect(progress.slice(-2)).toEqual([
      { stage: 'waiting', present: 5 },
      { stage: 'gathering', seconds: 90 },
    ]);
  });

  it('ignores everything after the round is finished', () => {
    const { results, sessions, server } = round(voters);
    const before = server.sent.length;
    expect(sessions[0].finished).toBe(true);
    sessions[0].handle('JOINED_ACK');
    sessions[0].handle('PERFORM_SHUFFLE#{}#{}');
    expect(server.sent).toHaveLength(before);
    expect(results[0].error).toBeNull();
  });

  it('stops when the server starts a round without it or with too few voters', () => {
    const [a] = voters;
    const errors = [];
    const session = createShuffleSession({
      civicAddress: a.civicAddress,
      room: 'ROOM',
      keypair: a.keypair,
      ballotAddress: a.ballot.address,
      input: a.input,
      civicKey: a.civicKey,
      generator: generatorFor('alone'),
      send: () => {},
      onProgress: () => {},
      onJoin: () => {},
      onError: error => errors.push(error.message),
    });
    const others = {
      order: JSON.stringify({ 0: keypairs[1].publicKey, 1: keypairs[2].publicKey, 2: keypairs[3].publicKey }),
      peers: JSON.stringify({}),
    };
    session.handle('INITIATE_SHUFFLE_' + JSON.stringify(others));
    expect(errors[0]).toMatch(/without you/);
  });

  it('rejects a list the wrong length for its position', () => {
    const [a, b] = voters;
    const errors = [];
    const sent = [];
    const session = createShuffleSession({
      civicAddress: b.civicAddress,
      room: 'ROOM',
      keypair: b.keypair,
      ballotAddress: b.ballot.address,
      input: b.input,
      civicKey: b.civicKey,
      generator: generatorFor('middle'),
      send: message => sent.push(message),
      onProgress: () => {},
      onJoin: () => {},
      onError: error => errors.push(error.message),
    });
    const order = { 0: a.keypair.publicKey, 1: b.keypair.publicKey, 2: keypairs[2].publicKey };
    const peers = {
      [a.keypair.publicKey]: a.civicAddress,
      [b.keypair.publicKey]: b.civicAddress,
      [keypairs[2].publicKey]: voters[2].civicAddress,
    };
    session.handle('INITIATE_SHUFFLE_' + JSON.stringify({ order: JSON.stringify(order), peers: JSON.stringify(peers) }));
    session.handle('PERFORM_SHUFFLE#{}#{}');
    expect(errors[0]).toMatch(/incomplete or was altered/);
    expect(sent).toHaveLength(0);
  });
});

describe('Ballot and vote transactions', () => {
  const v = voter(1);

  it('derives a stable ballot address per proposal, separate from civic addresses', () => {
    expect(ballotKey(v.seed, 14).address).toBe(v.ballot.address);
    expect(ballotKey(v.seed, 15).address).not.toBe(v.ballot.address);
    expect(v.ballot.address).not.toBe(v.civicAddress);
    expect(v.ballot.address).toMatch(/^M[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(() => ballotKey(v.seed, -1)).toThrow('Invalid proposal');
  });

  it('reads the proposal record and room from the stored gateway link', () => {
    expect(proposalCid({ ipfs_hash: `https://ipfs.marscoin.org/ipfs/${CID}` })).toBe(CID);
    expect(proposalCid({ ipfs_hash: CID })).toBe(CID);
    expect(ballotRoom(CID)).toBe('MYWAPJZV');
    expect(() => proposalCid({ ipfs_hash: 'https://ipfs.marscoin.org/ipfs/' })).toThrow('no valid on-chain record');
    expect(() => proposalCid({})).toThrow('no valid on-chain record');
  });

  it('chooses the largest suitable civic output and explains when there is none', () => {
    expect(chooseBallotInput([{ value: 21000000 }, { value: 90000000 }, { value: 5 }]).value).toBe(90000000);
    expect(() => chooseBallotInput([{ value: 15000000 }, { value: 15000000 }])).toThrow('in pieces smaller');
    expect(() => chooseBallotInput([{ value: 1000 }])).toThrow('costs 0.2 MARS');
    expect(() => chooseBallotInput([{ value: 20000000 }])).toThrow('costs 0.2 MARS');
  });

  it('describes its input in the form the web client parses', () => {
    const [source] = JSON.parse(encodeSource({ ...v.input, address: v.civicAddress }));
    expect(source).toMatchObject({ txId: v.input.txid, vout: 0, value: v.input.value, originator: v.civicAddress });
    expect(source.rawTx.type).toBe('Buffer');
    expect(Buffer.from(source.rawTx.data).toString('hex')).toBe(v.input.rawTx);
  });

  it('casts a vote as a single data output, spending the whole ballot', () => {
    const ballotTx = new bitcoin.Transaction();
    ballotTx.addInput(Buffer.alloc(32, 8), 0);
    ballotTx.addOutput(bitcoin.address.toOutputScript(v.ballot.address, NETWORK), BALLOT_VALUE);
    const utxos = [{ txid: ballotTx.getId(), vout: 0, value: BALLOT_VALUE, rawTx: ballotTx.toHex() }];
    for (const [choice, tag] of [
      ['yes', 'PRY'],
      ['no', 'PRN'],
      ['abstain', 'PRA'],
    ]) {
      const vote = buildVote({ utxos, keyPair: v.ballot.keyPair, choice, cid: CID });
      const tx = bitcoin.Transaction.fromHex(vote.hex);
      expect(tx.outs).toHaveLength(1);
      expect(tx.outs[0].value).toBe(0);
      expect(bitcoin.script.toASM(tx.outs[0].script)).toBe(`OP_RETURN ${Buffer.from(`${tag}_${CID}`).toString('hex')}`);
      expect(tx.version).toBe(1);
      expect(readVote(vote.hex)).toEqual({ choice, cid: CID });
      expect(vote.txid).toBe(tx.getId());
    }
    expect(() => buildVote({ utxos, keyPair: v.ballot.keyPair, choice: 'maybe', cid: CID })).toThrow('Choose yes');
    expect(() => buildVote({ utxos: [], keyPair: v.ballot.keyPair, choice: 'yes', cid: CID })).toThrow('not arrived');
    expect(() => buildVote({ utxos: [...utxos, ...utxos], keyPair: v.ballot.keyPair, choice: 'yes', cid: CID })).toThrow(
      'exactly one ballot',
    );
    expect(() => buildVote({ utxos, keyPair: v.ballot.keyPair, choice: 'yes', cid: 'PRY_injected' })).toThrow('no valid on-chain record');
    expect(readVote(ballotTx.toHex())).toBeNull();
  });
});
