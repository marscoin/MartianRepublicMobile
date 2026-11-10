// Transactions of the Republic's anonymous ballot.
//
// 1. Join: every voter in a round contributes one input from their civic
//    address. Each gets change back, and each anonymous ballot address
//    receives 0.1 MARS, in shuffled order. Citizens can audit that every
//    ballot came from the voter registry without learning whose is whose.
// 2. Vote: the ballot address spends its 0.1 MARS into a single data output
//    naming the proposal and the choice. The whole amount goes to miners; the
//    Republic's tally only counts votes shaped exactly like that.
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../constants';

const NETWORK = Marscoin.mainnet;
export const BALLOT_VALUE = 10000000; // 0.1 MARS to the ballot address
export const JOIN_FEE = 10000000; // 0.1 MARS network fee per voter
export const JOIN_COST = BALLOT_VALUE + JOIN_FEE;
const DUST = 546;
// The civic output a voter contributes must leave real change behind.
export const MIN_BALLOT_INPUT = JOIN_COST + DUST;
export const VOTE_TAGS = { yes: 'PRY', no: 'PRN', abstain: 'PRA' };
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;

// The ballot key for one proposal, derived from the civic recovery phrase on a
// branch used for nothing else. It never leaves the phone, and the phone can
// always find its ballot again without storing anything.
export function ballotKey(seed, proposalId) {
  if (!Number.isSafeInteger(proposalId) || proposalId < 0 || proposalId >= 0x80000000) throw new Error('Invalid proposal.');
  const node = bitcoin.bip32.fromSeed(seed, NETWORK).derivePath(`m/999999'/107'/${proposalId}'`);
  const keyPair = bitcoin.ECPair.fromPrivateKey(node.privateKey, { network: NETWORK });
  return { keyPair, address: bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: NETWORK }).address };
}

export function proposalCid(proposal) {
  const cid = String(proposal?.ipfs_hash || '')
    .trim()
    .replace(/^.*\/ipfs\//, '');
  if (!CID.test(cid)) throw new Error('This proposal has no valid on-chain record to vote on.');
  return cid;
}

// Voters for one proposal meet in a room named after its record.
export const ballotRoom = cid => cid.substr(1, 8).toUpperCase();

export function isMarsAddress(address) {
  try {
    bitcoin.address.toOutputScript(address, NETWORK);
    return true;
  } catch {
    return false;
  }
}

// The largest suitable civic output, in the form the shuffle passes around.
export function chooseBallotInput(utxos) {
  const usable = utxos.filter(utxo => utxo.value >= MIN_BALLOT_INPUT).sort((a, b) => b.value - a.value);
  if (!usable.length) {
    const total = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    throw new Error(
      total >= MIN_BALLOT_INPUT
        ? 'Your civic wallet holds enough Marscoin, but in pieces smaller than 0.2 MARS. Send yourself at least 0.21 MARS in one payment, then try again.'
        : 'A ballot costs 0.2 MARS in network fees. Add Marscoin to your civic wallet, then try again.',
    );
  }
  return usable[0];
}

// The web client serialises the raw transaction as a JSON Buffer object.
export function encodeSource({ txid, vout, value, rawTx, address }) {
  return JSON.stringify([
    { txId: txid, vout, rawTx: { type: 'Buffer', data: [...Buffer.from(rawTx, 'hex')] }, value, originator: address },
  ]);
}

function decodeSource(text) {
  const source = JSON.parse(text)[0];
  const raw = source?.rawTx;
  const rawTx = typeof raw === 'string' ? Buffer.from(raw, 'hex') : Buffer.from(raw?.data || []);
  const tx = bitcoin.Transaction.fromBuffer(rawTx);
  if (tx.getId() !== source.txId || !tx.outs[source.vout]) throw new Error('A voter supplied an invalid input.');
  if (!isMarsAddress(source.originator)) throw new Error('A voter supplied an invalid return address.');
  // The amount is read from the transaction itself, not from the voter's claim.
  return { txid: source.txId, vout: source.vout, rawTx, value: tx.outs[source.vout].value, originator: source.originator };
}

// Built by the last voter in the round, in the same layout as the web client.
export function buildJoinPsbt(sources, destinations) {
  const psbt = new bitcoin.Psbt({ network: NETWORK });
  psbt.setVersion(1);
  psbt.setMaximumFeeRate(10000000);
  const originators = [];
  for (const key of Object.keys(sources)) {
    const source = decodeSource(sources[key]);
    if (source.value < MIN_BALLOT_INPUT) throw new Error('A voter supplied an input that is too small.');
    psbt.addInput({ hash: source.txid, index: source.vout, nonWitnessUtxo: source.rawTx });
    if (originators.includes(source.originator)) throw new Error('Two voters used the same civic address.');
    originators.push(source.originator);
    psbt.addOutput({ address: source.originator, value: source.value - JOIN_COST });
  }
  const targets = Object.keys(destinations).map(key => destinations[key]?.target);
  if (targets.length !== originators.length || new Set(targets).size !== targets.length || !targets.every(isMarsAddress)) {
    throw new Error('The ballot list is incomplete or was altered. No ballot was issued.');
  }
  for (const target of targets) psbt.addOutput({ address: target, value: BALLOT_VALUE });
  return psbt.toBase64();
}

// Before signing: our input is present exactly once, and the transaction pays
// our change and our ballot in full. Returns the index of our input.
export function checkJoinPsbt(psbtBase64, { input, civicAddress, ballotAddress }) {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  const hash = Buffer.from(input.txid, 'hex').reverse();
  const mine = psbt.txInputs
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.index === input.vout && Buffer.from(item.hash).equals(hash));
  if (mine.length !== 1) throw new Error('The ballot transaction does not include your input exactly once. Nothing was signed.');
  const pays = (address, value) => psbt.txOutputs.filter(output => output.address === address && output.value === value).length === 1;
  if (!pays(ballotAddress, BALLOT_VALUE)) throw new Error('The ballot transaction does not issue your ballot. Nothing was signed.');
  if (!pays(civicAddress, input.value - JOIN_COST))
    throw new Error('The ballot transaction does not return your change. Nothing was signed.');
  // Our signature commits to this exact output.
  const previous = psbt.data.inputs[mine[0].index].nonWitnessUtxo;
  if (!previous || bitcoin.Transaction.fromBuffer(previous).getId() !== input.txid)
    throw new Error('The ballot transaction misdescribes your input. Nothing was signed.');
  return mine[0].index;
}

// The address behind every input of the joint transaction, read from the
// previous transactions it carries. Used to check that all participants are
// citizens before signing: a round with an outsider issues ballots that the
// Republic will not count.
export function joinParticipants(psbtBase64) {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  return psbt.txInputs.map((input, index) => {
    const previous = psbt.data.inputs[index].nonWitnessUtxo;
    if (!previous) throw new Error('The ballot transaction has an input that cannot be checked. Nothing was signed.');
    const tx = bitcoin.Transaction.fromBuffer(previous);
    if (!tx.getHash().equals(Buffer.from(input.hash)) || !tx.outs[input.index]) {
      throw new Error('The ballot transaction has an input that cannot be checked. Nothing was signed.');
    }
    return bitcoin.address.fromOutputScript(tx.outs[input.index].script, NETWORK);
  });
}

export function signJoinPsbt(psbtBase64, context, keyPair) {
  const index = checkJoinPsbt(psbtBase64, context);
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });
  psbt.setMaximumFeeRate(10000000);
  psbt.signInput(index, keyPair);
  if (!psbt.validateSignaturesOfInput(index)) throw new Error('Unable to sign the ballot transaction.');
  return psbt.toBase64();
}

// Merge every voter's signature into the transaction we checked and signed.
// A copy describing a different transaction cannot be combined.
export function finishJoin(ownSignedBase64, otherBase64s) {
  const psbt = bitcoin.Psbt.fromBase64(ownSignedBase64, { network: NETWORK });
  psbt.setMaximumFeeRate(10000000);
  for (const other of otherBase64s) psbt.combine(bitcoin.Psbt.fromBase64(other, { network: NETWORK }));
  if (!psbt.validateSignaturesOfAllInputs()) throw new Error('Not every voter signed the ballot transaction.');
  const tx = psbt.finalizeAllInputs().extractTransaction(true);
  return { hex: tx.toHex(), txid: tx.getId() };
}

// The vote itself: every coin at the ballot address in, one data output out.
export function buildVote({ utxos, keyPair, choice, cid }) {
  const tag = VOTE_TAGS[choice];
  if (!tag) throw new Error('Choose yes, no or abstain.');
  if (!CID.test(cid)) throw new Error('This proposal has no valid on-chain record to vote on.');
  if (!utxos.length) throw new Error('Your ballot has not arrived yet.');
  // The Republic counts a vote only if it spends exactly one ballot.
  if (utxos.length !== 1) throw new Error('A vote spends exactly one ballot.');
  const psbt = new bitcoin.Psbt({ network: NETWORK });
  psbt.setVersion(1);
  // The ballot's whole value is the fee, by design of the tally.
  psbt.setMaximumFeeRate(10000000);
  psbt.addOutput({ script: bitcoin.payments.embed({ data: [Buffer.from(`${tag}_${cid}`, 'utf8')] }).output, value: 0 });
  for (const utxo of utxos) {
    const rawTx = Buffer.from(utxo.rawTx, 'hex');
    if (bitcoin.Transaction.fromBuffer(rawTx).getId() !== utxo.txid) throw new Error('The ballot record could not be verified.');
    psbt.addInput({ hash: utxo.txid, index: utxo.vout, nonWitnessUtxo: rawTx });
  }
  utxos.forEach((utxo, index) => psbt.signInput(index, keyPair));
  if (!psbt.validateSignaturesOfAllInputs()) throw new Error('Unable to sign the vote.');
  const tx = psbt.finalizeAllInputs().extractTransaction(true);
  return { hex: tx.toHex(), txid: tx.getId() };
}

// Reads a vote back out of a transaction: { choice, cid } or null.
export function readVote(txHex) {
  const tx = bitcoin.Transaction.fromHex(txHex);
  if (tx.outs.length !== 1) return null;
  const chunks = bitcoin.script.decompile(tx.outs[0].script) || [];
  if (chunks[0] !== bitcoin.opcodes.OP_RETURN || !Buffer.isBuffer(chunks[1])) return null;
  const match = /^(PRY|PRN|PRA)_(.+)$/.exec(chunks[1].toString('utf8'));
  if (!match) return null;
  return { choice: Object.keys(VOTE_TAGS).find(key => VOTE_TAGS[key] === match[1]), cid: match[2] };
}

// Where a ballot stands, from the ballot address's history and unspent coins.
export function ballotStatus({ history, utxos, votes }) {
  if (utxos.length) return { status: utxos.every(utxo => utxo.height > 0) ? 'ready' : 'confirming' };
  if (!history.length) return { status: 'none' };
  const vote = votes.find(Boolean);
  if (!vote) return { status: 'none' };
  return { status: vote.confirmed ? 'counted' : 'cast', choice: vote.choice, txid: vote.txid };
}
