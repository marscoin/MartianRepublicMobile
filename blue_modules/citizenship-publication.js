import sha256 from 'crypto-js/sha256';
import * as bitcoin from 'bitcoinjs-lib';

export async function prepareCitizenshipPublication({ wallet, form, feeRate, pin, readDraft, saveDraft }) {
  if (!wallet?.civic) throw new Error('Restore your civic wallet before publishing.');
  for (const field of ['firstName', 'lastName', 'displayName', 'bio', 'photo', 'video']) {
    if (typeof form[field] !== 'string' || !form[field].trim()) throw new Error('Complete every application field before publishing.');
  }
  const address = wallet._getExternalAddressByIndex(0);
  const data = { ...form, civic: address };
  return prepareCivicPublication({
    wallet,
    data,
    prefix: 'GP_',
    feeRate,
    pin,
    readDraft,
    saveDraft,
  });
}

// Both applications and endorsements require a persisted, reviewed transaction.
// Each caller supplies a separate draft store so one record cannot replace another.
export async function prepareCivicPublication({ wallet, data, prefix, feeRate, pin, readDraft, saveDraft }) {
  if (!wallet?.civic) throw new Error('Restore your civic wallet before publishing.');
  if (!['GP_', 'ED_'].includes(prefix)) throw new Error('Unsupported civic record.');
  if (!Number.isFinite(feeRate) || feeRate <= 0) throw new Error('Unable to determine the network fee. Try again.');
  const address = wallet._getExternalAddressByIndex(0);
  const fingerprint = sha256(JSON.stringify(data)).toString();
  const draft = await readDraft(address);
  // A retry after a lost connection reuses the identical transaction. Never
  // create a second publication while the first might already be in the chain.
  if (draft.publication?.status === 'pending' || draft.publication?.status === 'submitted') return draft.publication;
  if (draft.publication?.fingerprint === fingerprint) return draft.publication;
  await wallet.fetchBalance();
  await wallet.fetchUtxo();
  const utxos = wallet.getUtxo().filter(input => input.address === address);
  if (!utxos.length) throw new Error('Receive Marscoin in your civic wallet to cover the publication fee.');
  let cid = draft.metadataFingerprint === fingerprint ? draft.metadataCID : null;
  if (!cid) {
    cid = await pin({ data, meta: { hash: fingerprint } }, address);
    if (typeof cid !== 'string' || !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid))
      throw new Error('The application upload returned an invalid reference.');
    await saveDraft(address, {
      metadataCID: cid,
      metadataFingerprint: fingerprint,
    });
  }
  const { tx, fee } = await wallet.createTransaction(
    utxos,
    [{ address }],
    feeRate,
    address,
    0xffffffff,
    false,
    undefined,
    `${prefix}${cid}`,
  );
  const publication = {
    address,
    fingerprint,
    txHex: tx.toHex(),
    txid: tx.getId(),
    fee,
    status: 'prepared',
  };
  await saveDraft(address, { publication });
  return publication;
}

export async function publishCitizenshipTransaction({ wallet, publication, saveDraft, findTransaction }) {
  if (!wallet?.civic) throw new Error('Restore your civic wallet before publishing.');
  const address = wallet._getExternalAddressByIndex(0);
  if (publication.address && publication.address !== address) throw new Error('This record belongs to another civic identity.');
  if (bitcoin.Transaction.fromHex(publication.txHex).getId() !== publication.txid) throw new Error('The saved transaction is invalid.');
  if (publication.status === 'submitted') return publication;
  const pending = { ...publication, status: 'pending' };
  await saveDraft(address, { publication: pending });
  try {
    if (!(await wallet.broadcastTx(publication.txHex))) throw new Error('The network did not acknowledge the transaction.');
  } catch {
    // An "already known" response or a lost acknowledgement can still mean
    // success. Verify the exact txid instead of signing another transaction.
    let found;
    try {
      found = await findTransaction(publication.txid);
    } catch {
      /* Offline. */
    }
    if (typeof found !== 'string' || bitcoin.Transaction.fromHex(found).getId() !== publication.txid) {
      throw new Error('Submission is not confirmed yet. Your signed transaction is saved; retry to submit the same transaction.');
    }
  }
  const submitted = { ...pending, status: 'submitted' };
  await saveDraft(address, { publication: submitted });
  return submitted;
}
