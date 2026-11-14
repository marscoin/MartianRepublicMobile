import * as bitcoin from 'bitcoinjs-lib';
import {
  isInsufficientFunds,
  prepareCitizenshipPublication,
  publishCitizenshipTransaction,
} from '../../blue_modules/citizenship-publication';
function setup() {
  const address = 'MHBba2wdTaxZkRisBTe69VJW5JHjTtjCU1';
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, 1), 0);
  tx.addOutput(Buffer.from('6a', 'hex'), 0);
  const wallet = {
    civic: true,
    _getExternalAddressByIndex: () => address,
    fetchBalance: jest.fn(),
    fetchUtxo: jest.fn(),
    getUtxo: () => [{ address, value: 100000 }],
    createTransaction: jest.fn(async () => ({ tx, fee: 654 })),
    broadcastTx: jest.fn(async () => true),
  };
  const draft = {};
  const saveDraft = jest.fn(async (_address, patch) => Object.assign(draft, patch));
  const readDraft = async () => draft;
  const pin = jest.fn(async () => 'Qm' + 'a'.repeat(44));
  const form = {
    firstName: 'Test',
    lastName: 'Citizen',
    displayName: 'Test Citizen',
    bio: 'Synthetic test',
    photo: 'photo',
    video: 'video',
  };
  return {
    wallet,
    form,
    feeRate: 3,
    pin,
    readDraft,
    saveDraft,
    draft,
    findTransaction: jest.fn(),
    tx,
  };
}
describe('Citizenship publication and interrupted connections', () => {
  it('marks an empty civic wallet as something more Marscoin fixes, before uploading', async () => {
    const options = setup();
    options.wallet.getUtxo = () => [];
    const error = await prepareCitizenshipPublication(options).catch(e => e);
    expect(error.message).toMatch(/Receive Marscoin/);
    expect(isInsufficientFunds(error)).toBe(true);
    expect(options.pin).not.toHaveBeenCalled();
  });
  it('notices too few coins before uploading anything', async () => {
    const options = setup();
    options.wallet.coinselect = jest.fn(() => {
      throw new Error('Not enough balance');
    });
    const error = await prepareCitizenshipPublication(options).catch(e => e);
    expect(isInsufficientFunds(error)).toBe(true);
    expect(error.message).toMatch(/does not hold enough Marscoin/);
    expect(options.pin).not.toHaveBeenCalled();
    expect(options.wallet.createTransaction).not.toHaveBeenCalled();
    expect(options.draft).toEqual({});
    // The trial run is sized like the real record: fee rate, change address and a data output.
    const [utxos, targets, feeRate, change] = options.wallet.coinselect.mock.calls[0];
    expect(utxos).toHaveLength(1);
    expect(targets[0]).toEqual({ address: change });
    expect(targets[1].value).toBe(0);
    expect(targets[1].script.length).toBe(51); // OP_RETURN, one push, "GP_" and a 46-character reference
    expect(feeRate).toBe(3);
  });
  it('still reports too few coins if only signing finds out', async () => {
    const options = setup();
    options.wallet.createTransaction.mockRejectedValueOnce(new Error('Not enough balance'));
    expect(isInsufficientFunds(await prepareCitizenshipPublication(options).catch(e => e))).toBe(true);
    // Other failures are not mistaken for an empty wallet.
    const other = setup();
    other.pin.mockRejectedValueOnce(new Error('Network Error'));
    expect(isInsufficientFunds(await prepareCitizenshipPublication(other).catch(e => e))).toBe(false);
  });
  it('prepares and persists the exact fee and transaction without broadcasting', async () => {
    const options = setup();
    const publication = await prepareCitizenshipPublication(options);
    expect(publication).toMatchObject({
      status: 'prepared',
      fee: 654,
      txid: options.tx.getId(),
    });
    expect(options.wallet.broadcastTx).not.toHaveBeenCalled();
    expect(options.draft.publication).toEqual(publication);
    expect(options.wallet.createTransaction.mock.calls[0][2]).toBe(3);
  });
  it('reuses a prepared record without uploading the same metadata again', async () => {
    const options = setup();
    const first = await prepareCitizenshipPublication(options);
    expect(await prepareCitizenshipPublication(options)).toEqual(first);
    expect(options.pin).toHaveBeenCalledTimes(1);
    expect(options.wallet.createTransaction).toHaveBeenCalledTimes(1);
  });
  it('keeps an uncertain broadcast for retry even if form fields change', async () => {
    const options = setup();
    const publication = await prepareCitizenshipPublication(options);
    options.wallet.broadcastTx.mockRejectedValueOnce(new Error('connection lost'));
    await expect(publishCitizenshipTransaction({ ...options, publication })).rejects.toThrow('same transaction');
    expect(options.draft.publication.status).toBe('pending');
    options.form.bio = 'Changed after connection loss';
    const retry = await prepareCitizenshipPublication(options);
    expect(retry.txHex).toBe(publication.txHex);
    await publishCitizenshipTransaction({ ...options, publication: retry });
    expect(options.wallet.broadcastTx.mock.calls.map(call => call[0])).toEqual([publication.txHex, publication.txHex]);
    expect(options.wallet.createTransaction).toHaveBeenCalledTimes(1);
  });
  it('recognizes an already broadcast transaction by its exact txid', async () => {
    const options = setup();
    const publication = await prepareCitizenshipPublication(options);
    options.wallet.broadcastTx.mockRejectedValue(new Error('already known'));
    options.findTransaction.mockResolvedValue(options.tx.toHex());
    const submitted = await publishCitizenshipTransaction({
      ...options,
      publication,
    });
    expect(submitted.status).toBe('submitted');
  });
  it('does not broadcast when progress cannot be saved', async () => {
    const options = setup();
    const publication = await prepareCitizenshipPublication(options);
    options.saveDraft.mockRejectedValue(new Error('storage full'));
    await expect(publishCitizenshipTransaction({ ...options, publication })).rejects.toThrow('storage full');
    expect(options.wallet.broadcastTx).not.toHaveBeenCalled();
  });
  it('stops before uploading when the civic wallet has no funds', async () => {
    const options = setup();
    options.wallet.getUtxo = () => [];
    await expect(prepareCitizenshipPublication(options)).rejects.toThrow('Receive Marscoin');
    expect(options.pin).not.toHaveBeenCalled();
  });
  it('does not sign when the upload fails', async () => {
    const options = setup();
    options.pin.mockRejectedValue(new Error('offline'));
    await expect(prepareCitizenshipPublication(options)).rejects.toThrow('offline');
    expect(options.wallet.createTransaction).not.toHaveBeenCalled();
    expect(options.wallet.broadcastTx).not.toHaveBeenCalled();
  });
});
