import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../../blue_modules/constants';
import { prepareEndorsement } from '../../blue_modules/civic-endorsement';
import { publishCitizenshipTransaction } from '../../blue_modules/citizenship-publication';

function setup() {
  const source = bitcoin.payments.p2pkh({
    hash: Buffer.alloc(20, 1),
    network: Marscoin.mainnet,
  }).address;
  const recipient = bitcoin.payments.p2pkh({
    hash: Buffer.alloc(20, 2),
    network: Marscoin.mainnet,
  }).address;
  const tx = new bitcoin.Transaction();
  tx.addInput(Buffer.alloc(32, 1), 0);
  tx.addOutput(Buffer.from('6a', 'hex'), 0);
  const draft = {};
  const wallet = {
    civic: true,
    _getExternalAddressByIndex: () => source,
    fetchBalance: jest.fn(),
    fetchUtxo: jest.fn(),
    getUtxo: () => [{ address: source, value: 100000 }],
    createTransaction: jest.fn(async () => ({ tx, fee: 321 })),
    broadcastTx: jest.fn(async () => true),
  };
  return {
    wallet,
    recipient,
    tx,
    draft,
    feeRate: 2,
    pin: jest.fn(async () => 'Qm' + 'a'.repeat(44)),
    readDraft: async () => draft,
    saveDraft: async (_address, patch) => Object.assign(draft, patch),
    findTransaction: jest.fn(),
  };
}

describe('Endorsement review and recovery', () => {
  it('prepares the exact endorsement and fee without broadcasting', async () => {
    const f = setup();
    const publication = await prepareEndorsement(f);
    expect(publication).toMatchObject({
      fee: 321,
      status: 'prepared',
      address: f.wallet._getExternalAddressByIndex(0),
    });
    expect(f.wallet.createTransaction.mock.calls[0][7]).toMatch(/^ED_Qm/);
    expect(f.pin.mock.calls[0][0].data.message).toContain(`endorses ${f.recipient}`);
    expect(f.wallet.broadcastTx).not.toHaveBeenCalled();
  });
  it('rejects self-endorsement, Bitcoin addresses and invalid fee rates before uploading', async () => {
    const f = setup();
    expect(() =>
      prepareEndorsement({
        ...f,
        recipient: f.wallet._getExternalAddressByIndex(0),
      }),
    ).toThrow('own civic identity');
    expect(() =>
      prepareEndorsement({
        ...f,
        recipient: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
      }),
    ).toThrow('valid Marscoin');
    await expect(prepareEndorsement({ ...f, feeRate: NaN })).rejects.toThrow('network fee');
    expect(f.pin).not.toHaveBeenCalled();
  });
  it('retries an uncertain endorsement with the original transaction', async () => {
    const f = setup();
    const publication = await prepareEndorsement(f);
    f.wallet.broadcastTx.mockRejectedValueOnce(new Error('offline'));
    await expect(publishCitizenshipTransaction({ ...f, publication })).rejects.toThrow('same transaction');
    const retry = await prepareEndorsement(f);
    await publishCitizenshipTransaction({ ...f, publication: retry });
    expect(f.wallet.broadcastTx.mock.calls.map(([hex]) => hex)).toEqual([publication.txHex, publication.txHex]);
    expect(f.pin).toHaveBeenCalledTimes(1);
  });
  it('rejects a record belonging to another identity or a changed signed transaction', async () => {
    const f = setup();
    const publication = await prepareEndorsement(f);
    await expect(
      publishCitizenshipTransaction({
        ...f,
        publication: { ...publication, address: f.recipient },
      }),
    ).rejects.toThrow('another civic identity');
    await expect(
      publishCitizenshipTransaction({
        ...f,
        publication: { ...publication, txid: 'f'.repeat(64) },
      }),
    ).rejects.toThrow('invalid');
    expect(f.wallet.broadcastTx).not.toHaveBeenCalled();
  });
});
