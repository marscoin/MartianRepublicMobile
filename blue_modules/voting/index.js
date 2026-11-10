// App wiring for anonymous voting: the civic wallet, the Marscoin network and
// the Republic's ballot server.
//
// Nothing about a ballot is stored on the phone or sent to the Republic's web
// API. The ballot key is derived from the civic recovery phrase, and the state
// of a ballot is read back from the chain each time.
import * as bitcoin from 'bitcoinjs-lib';
import { randomBytes } from '../../class/rng';
import { Marscoin } from '../constants';
import { createGenerator, generateShuffleKeypair } from './ballot-crypto';
import {
  BALLOT_VALUE,
  MIN_BALLOT_INPUT,
  ballotKey,
  ballotRoom,
  ballotStatus,
  buildVote,
  chooseBallotInput,
  proposalCid,
} from './ballot-transactions';
import axios from 'axios';
import { BALLOT_SERVER } from './congress';
import { createBallotExplorer } from './ballot-explorer';
import { createShuffleSession } from './shuffle-session';

const REPUBLIC_API = 'https://martianrepublic.org/api';

const MARSConnection = require('../MARSConnection');
const explorer = createBallotExplorer({ fetch: (...args) => fetch(...args) });

export const civicAddressOf = wallet => wallet._getExternalAddressByIndex(0);

async function unspent(address) {
  const result = await MARSConnection.multiGetUtxoByAddress([address]);
  return (result[address] || []).map(utxo => ({
    txid: utxo.txId,
    vout: utxo.vout,
    value: utxo.value,
    height: utxo.height > 0 ? utxo.height : 0,
  }));
}

// The ballot itself: exactly the amount a round issues. Other coins sent to
// the ballot address (by anyone who saw it in the round) are not ballots.
const ballotCoins = utxos => utxos.filter(utxo => utxo.value === BALLOT_VALUE);

// The state of this citizen's ballot for a proposal. Everything about the
// ballot address goes through the explorer, never the wallet's Electrum
// connection, which already knows the civic address.
export async function readBallot(wallet, proposal) {
  const cid = proposalCid(proposal);
  const { address } = ballotKey(wallet._getSeed(), proposal.id);
  const [votes, utxos] = await Promise.all([explorer.votes(address), explorer.unspent(address)]);
  // A vote, once cast, is final whatever arrives at the address afterwards.
  const vote = votes.find(item => item.cid === cid) || null;
  return { address, ...ballotStatus({ history: vote ? [vote] : [], utxos: vote ? [] : ballotCoins(utxos), votes: [vote] }) };
}

// The civic coin a ballot would be paid from. Throws a readable explanation
// when the civic wallet cannot cover one.
export async function prepareBallotInput(wallet) {
  const address = civicAddressOf(wallet);
  // Confirmed coins only: an unconfirmed parent could invalidate the round for everyone.
  const input = chooseBallotInput((await unspent(address)).filter(utxo => utxo.height > 0));
  // The amount is read from the transaction itself (which must hash to its
  // ID), not taken from the server: our change is computed from it.
  const rawTx = await MARSConnection.getTxHex(input.txid);
  const output = bitcoin.Transaction.fromHex(rawTx).outs[input.vout];
  if (!output || output.value < MIN_BALLOT_INPUT) throw new Error('Your civic wallet could not be read reliably. Try again.');
  return { txid: input.txid, vout: input.vout, value: output.value, rawTx };
}

async function broadcastOnce(hex, txid) {
  try {
    await MARSConnection.broadcastV2(hex);
  } catch (error) {
    // Every voter in a round broadcasts the same transaction, so "already
    // known" is the normal answer. Trust only the transaction's presence.
    let found = null;
    try {
      found = await MARSConnection.getTxHex(txid);
    } catch {
      /* Not found, or offline. */
    }
    if (!found)
      throw new Error(typeof error?.message === 'string' ? error.message : 'The Marscoin network did not accept the transaction.');
  }
  return txid;
}

// Confirms with the Republic's registry that every address is a citizen's.
async function assertCitizens(addresses, refusal) {
  for (const address of addresses) {
    let citizen = false;
    try {
      const response = await axios.get(`${REPUBLIC_API}/citizen/${address}`, { timeout: 15000 });
      citizen = !!response.data?.profile?.isCitizen;
    } catch (error) {
      // "Not found" is an answer; anything else leaves the question open.
      if (error.response?.status !== 404) throw new Error('The citizen registry could not be reached. Nothing was signed. Try again.');
    }
    if (!citizen) throw new Error(refusal);
  }
}
const OUTSIDER = 'This round included someone who is not a citizen, so its ballots would not count. Nothing was signed. Join again.';

// Join the proposal's ballot round and wait for two other citizens. Resolves
// with the ID of the transaction that issues the ballots. `cancel()` leaves
// the room; nothing is spent unless the round completes.
export function joinBallotRound({ wallet, proposal, onProgress }) {
  let socket = null;
  let cancelled = false;
  let settled = false;
  const promise = (async () => {
    const cid = proposalCid(proposal);
    const civicAddress = civicAddressOf(wallet);
    const seed = wallet._getSeed();
    const ballot = ballotKey(seed, proposal.id);
    onProgress({ stage: 'preparing' });
    await assertCitizens([civicAddress], 'Ballots are issued to citizens. Your civic identity is not yet a citizen of the Republic.');
    const input = await prepareBallotInput(wallet);
    const civicKey = bitcoin.ECPair.fromWIF(wallet._getWifForAddress(civicAddress), Marscoin.mainnet);
    const generator = createGenerator(await randomBytes(64));
    // Key generation takes a moment on a phone; let the screen draw first.
    await new Promise(resolve => setTimeout(resolve, 50));
    const keypair = generateShuffleKeypair(generator);
    if (cancelled) throw new Error('cancelled');

    const join = await new Promise((resolve, reject) => {
      const finish = (settle, value) => {
        if (settled) return;
        settled = true;
        try {
          socket.close();
        } catch {
          /* Already closed. */
        }
        settle(value);
      };
      socket = new WebSocket(BALLOT_SERVER);
      const session = createShuffleSession({
        civicAddress,
        room: ballotRoom(cid),
        keypair,
        ballotAddress: ballot.address,
        input,
        civicKey,
        generator,
        send: message => socket.send(message),
        onProgress,
        onJoin: result => finish(resolve, result),
        onError: error => finish(reject, error),
        verifyParticipants: addresses => assertCitizens(addresses, OUTSIDER),
      });
      socket.onopen = () => session.start();
      socket.onmessage = event => session.handle(typeof event.data === 'string' ? event.data : String(event.data));
      socket.onerror = () => finish(reject, new Error('Unable to reach the ballot server. Check your connection and try again.'));
      socket.onclose = () => {
        if (cancelled && !session.committed) return finish(reject, new Error('cancelled'));
        finish(
          reject,
          new Error(
            session.committed
              ? 'The connection was lost after you signed. The other voters may still complete the round, so your ballot may yet be issued. This screen will show it if so; do not request another until it has had a few minutes.'
              : 'The connection to the ballot server was lost before the round completed. Nothing was spent. Join again.',
          ),
        );
      };
    });
    onProgress({ stage: 'broadcasting' });
    return broadcastOnce(join.hex, join.txid);
  })();
  return {
    promise,
    cancel() {
      cancelled = true;
      try {
        socket?.close();
      } catch {
        /* Already closed. */
      }
    },
  };
}

// Cast the vote with the ballot. Rebuilding produces the identical
// transaction, so repeating this after a lost connection cannot vote twice.
export async function castVote({ wallet, proposal, choice }) {
  const cid = proposalCid(proposal);
  const ballot = ballotKey(wallet._getSeed(), proposal.id);
  if ((await explorer.votes(ballot.address)).some(item => item.cid === cid)) throw new Error('You have already voted on this proposal.');
  const coins = ballotCoins(await explorer.unspent(ballot.address));
  const utxos = [];
  // One ballot per vote. A second ballot at this address is left untouched.
  for (const coin of coins.slice(0, 1)) utxos.push({ ...coin, rawTx: await MARSConnection.getTxHex(coin.txid) });
  const vote = buildVote({ utxos, keyPair: ballot.keyPair, choice, cid });
  try {
    await explorer.broadcast(vote.hex);
  } catch (failure) {
    // Already there (a repeated attempt) is success. Otherwise fall back to
    // the wallet's own connection: a vote that links slightly more is better
    // than a vote that is lost.
    if (!(await explorer.hasTransaction(vote.txid))) await broadcastOnce(vote.hex, vote.txid);
  }
  return vote.txid;
}
