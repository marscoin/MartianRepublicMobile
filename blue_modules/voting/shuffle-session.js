// One voter's part in a ballot shuffle round, speaking the Republic ballot
// server's text protocol (the same one the web voting page uses), so phones
// and browsers can share a round.
//
// The server and the other voters are not trusted with our money: we sign one
// transaction only, and only after checking that it issues our ballot and
// returns our change.
import { decryptWith, onionEncrypt, shuffled } from './ballot-crypto';
import { buildJoinPsbt, encodeSource, finishJoin, isMarsAddress, joinParticipants, signJoinPsbt } from './ballot-transactions';

export const VOTERS_PER_ROUND = 3;

export function createShuffleSession({
  civicAddress,
  room,
  keypair,
  ballotAddress,
  input,
  civicKey,
  generator,
  send,
  onProgress,
  onJoin,
  onError,
  verifyParticipants,
}) {
  const context = { input, civicAddress, ballotAddress };
  const source = encodeSource({ ...input, address: civicAddress });
  const compact = text => String(text).replace(/\s/g, '');
  let order = null;
  let index = -1;
  let encryptedTarget = null;
  let shuffledOnce = false;
  let signed = null;
  let finished = false;

  const fail = error => {
    if (finished) return;
    finished = true;
    onError(error instanceof Error ? error : new Error(String(error)));
  };

  function begin(message) {
    const payload = JSON.parse(message.slice(message.indexOf('INITIATE_SHUFFLE_') + 'INITIATE_SHUFFLE_'.length));
    const peers = JSON.parse(payload.peers);
    const sequence = JSON.parse(payload.order);
    order = Object.keys(sequence)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => sequence[key]);
    index = order.findIndex(key => compact(key) === compact(keypair.publicKey));
    if (index < 0 || peers[order[index]] !== civicAddress)
      throw new Error('The ballot server started a round without you. Leave and join again.');
    if (order.length < VOTERS_PER_ROUND) throw new Error('The ballot server started a round with too few voters.');
    encryptedTarget = onionEncrypt(ballotAddress, order, index, generator);
    shuffledOnce = false;
    signed = null;
    onProgress({ stage: 'shuffling', voters: order.length });
  }

  function shuffle(message) {
    if (!order) throw new Error('The ballot server skipped a step. Leave and join again.');
    // Our destination enters the list exactly once per round.
    if (shuffledOnce) throw new Error('The ballot server repeated a step. Leave and join again.');
    const parts = message.split('#');
    const incoming = JSON.parse(parts[1]);
    const sources = JSON.parse(parts[2]);
    if (Object.keys(incoming).length !== index || Object.keys(sources).length !== index) {
      throw new Error('The ballot list is incomplete or was altered. No ballot was issued.');
    }
    // Remove our layer from every destination that arrived before ours.
    const entries = Object.keys(incoming).map(key => ({ ...incoming[key], target: decryptWith(keypair.privateKey, incoming[key].target) }));
    // The web client attaches its public key to its entry, which would let the
    // last voter match ballots to citizens. Nothing reads the field; leave it empty.
    entries.push({ public_key: '', target: encryptedTarget });
    const mixed = shuffled(entries, generator);
    const data = {};
    mixed.forEach((entry, position) => (data[position] = entry));
    sources[index] = source;
    shuffledOnce = true;
    if (index === order.length - 1) {
      if (!mixed.every(entry => isMarsAddress(entry.target)))
        throw new Error('The ballot list is incomplete or was altered. No ballot was issued.');
      send(`COLLECT_SIGNATURES#${buildJoinPsbt(sources, data)}`);
    } else {
      // The server parses this frame as a Python literal: single-quoted keys
      // around JSON whose values are all strings.
      send(`PERFORM_SHUFFLE_ACK#${index}#{'data': ${JSON.stringify(data)},'sources': ${JSON.stringify(sources)}}`);
    }
    onProgress({ stage: 'signing', voters: order.length });
  }

  function sign(message) {
    if (!shuffledOnce) throw new Error('The ballot server skipped a step. Leave and join again.');
    const psbt = message.split('#')[1];
    // One signature per round. Signing a second, different transaction for the
    // same input would let someone choose between them.
    if (signed) {
      if (signed.request !== psbt) throw new Error('The ballot server asked for a second signature. Nothing more was signed.');
      if (signed.psbt) send(`SIGN_TX_COMPLETE#${index}#${signed.psbt}`);
      return;
    }
    const participants = joinParticipants(psbt);
    if (participants.length < VOTERS_PER_ROUND || new Set(participants).size !== participants.length) {
      throw new Error('The ballot transaction does not have enough separate participants. Nothing was signed.');
    }
    signed = { request: psbt, psbt: null };
    const complete = () => {
      signed.psbt = signJoinPsbt(psbt, context, civicKey);
      send(`SIGN_TX_COMPLETE#${index}#${signed.psbt}`);
    };
    if (!verifyParticipants) return complete();
    // Every participant must be a citizen, or the Republic counts none of the
    // ballots this transaction issues. If that cannot be confirmed, do not sign.
    const request = signed;
    Promise.resolve()
      .then(() => verifyParticipants(participants))
      .then(() => {
        if (!finished && signed === request) complete();
      })
      .catch(fail);
  }

  function combine(message) {
    if (!signed?.psbt) throw new Error('The ballot server skipped a step. Leave and join again.');
    const parts = JSON.parse(message.slice(message.indexOf('#') + 1));
    const join = finishJoin(signed.psbt, Object.values(parts));
    finished = true;
    onJoin(join);
  }

  return {
    start() {
      onProgress({ stage: 'waiting', present: 1 });
      send(`${civicAddress}_${room}`);
    },

    handle(message) {
      if (finished || typeof message !== 'string') return;
      try {
        const waiting = /waiting for (-?\d+) more/.exec(message);
        if (waiting && !order) {
          onProgress({ stage: 'waiting', present: Math.max(1, Math.min(VOTERS_PER_ROUND, VOTERS_PER_ROUND - Number(waiting[1]))) });
        }
        // Newer servers report how many voters are ready, and keep the round
        // open briefly after the minimum is reached so that more can join.
        const present = /^VOTERS_PRESENT#(\d+)$/.exec(message);
        if (present && !order) onProgress({ stage: 'waiting', present: Number(present[1]) });
        const gathering = /^GATHERING#(\d+)$/.exec(message);
        if (gathering && !order) onProgress({ stage: 'gathering', seconds: Number(gathering[1]) });
        if (message === 'JOINED_ACK') {
          // Sent on arrival, and again when the server restarts a round that a
          // voter abandoned: offer our key for the next one.
          order = null;
          shuffledOnce = false;
          send(`SUBMIT_KEY#${keypair.publicKey}#`);
        } else if (message.startsWith('INITIATE_SHUFFLE_')) begin(message);
        else if (message.startsWith('PERFORM_SHUFFLE#')) shuffle(message);
        else if (message.startsWith('SIGN_TX#')) sign(message);
        else if (message.startsWith('COMBINE_AND_BROADCAST#')) combine(message);
      } catch (error) {
        fail(error);
      }
    },

    get finished() {
      return finished;
    },

    // True once our signature has left the phone: from then on the other
    // voters could complete and publish the transaction without us.
    get committed() {
      return !!signed?.psbt;
    },
  };
}
