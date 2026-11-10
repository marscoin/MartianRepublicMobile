// A small native-segwit (BIP84) Bitcoin wallet derived from the same recovery
// phrase as the Marscoin wallet, so one backup covers both coins. It exists to
// fund atomic swaps and to receive refunds; chain data comes from Esplora.
import * as bitcoin from 'bitcoinjs-lib';

const NETWORK = bitcoin.networks.bitcoin;
export const BTC_ACCOUNT_PATH = "m/84'/0'/0'";
const EXTERNAL_GAP = 5;
const CHANGE_GAP = 3;
const P2WPKH_DUST = 294;

// Virtual sizes: 11 overhead, 68 per native-segwit input, 9 + script per output.
const inputVBytes = 68;
const outputVBytes = script => 9 + script.length;
const estimateFee = (inputs, scripts, feeRate) =>
  Math.ceil((11 + inputs * inputVBytes + scripts.reduce((sum, script) => sum + outputVBytes(script), 0)) * feeRate);

export function isBitcoinAddress(address) {
  try {
    bitcoin.address.toOutputScript(address, NETWORK);
    return true;
  } catch {
    return false;
  }
}

export function createBtcWallet({ seed, esplora }) {
  const account = bitcoin.bip32.fromSeed(seed, NETWORK).derivePath(BTC_ACCOUNT_PATH);
  const node = (chain, index) => account.derive(chain).derive(index);
  const address = (chain, index) => bitcoin.payments.p2wpkh({ pubkey: node(chain, index).publicKey, network: NETWORK }).address;

  async function scan(chain, gap) {
    const used = [];
    let unused = 0;
    for (let index = 0; unused < gap; index++) {
      const stats = await esplora.addressStats(address(chain, index));
      if (stats.transactions > 0) {
        used.push({ index, ...stats });
        unused = 0;
      } else {
        unused++;
      }
    }
    // The first index after the last one that has been used.
    return { used, next: used.length ? used[used.length - 1].index + 1 : 0 };
  }

  return {
    address,

    // Balance, spendable outputs and fresh addresses.
    async sync() {
      const [external, change] = await Promise.all([scan(0, EXTERNAL_GAP), scan(1, CHANGE_GAP)]);
      const utxos = [];
      let confirmed = 0;
      let unconfirmed = 0;
      for (const [chain, result] of [
        [0, external],
        [1, change],
      ]) {
        for (const entry of result.used) {
          confirmed += entry.confirmed;
          unconfirmed += entry.unconfirmed;
          if (entry.confirmed + entry.unconfirmed <= 0) continue;
          for (const utxo of await esplora.utxos(address(chain, entry.index))) {
            utxos.push({ ...utxo, chain, index: entry.index });
          }
        }
      }
      return {
        utxos,
        confirmed,
        unconfirmed,
        balance: utxos.reduce((sum, utxo) => sum + utxo.value, 0),
        receiveAddress: address(0, external.next),
        changeAddress: address(1, change.next),
      };
    },

    // Build and sign a payment of exactly `amount` satoshis, or of everything
    // when `sweep` is set. Returns the transaction without broadcasting it.
    createPayment({ utxos, to, amount, feeRate, changeAddress, sweep = false }) {
      if (!Number.isFinite(feeRate) || feeRate <= 0) throw new Error('The Bitcoin network fee is unavailable.');
      let target;
      try {
        target = bitcoin.address.toOutputScript(to, NETWORK);
      } catch {
        throw new Error('That is not a valid Bitcoin address.');
      }
      const changeScript = bitcoin.address.toOutputScript(changeAddress, NETWORK);
      const available = [...utxos].sort((a, b) => b.confirmed - a.confirmed || b.value - a.value);
      const total = available.reduce((sum, utxo) => sum + utxo.value, 0);
      let inputs;
      let fee;
      let change = 0;
      if (sweep) {
        inputs = available;
        fee = estimateFee(inputs.length, [target], feeRate);
        amount = total - fee;
        if (!inputs.length || amount < P2WPKH_DUST) throw new Error('The Bitcoin balance is too small to send after the network fee.');
      } else {
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a Bitcoin amount.');
        inputs = [];
        let gathered = 0;
        let enough = false;
        for (const utxo of available) {
          inputs.push(utxo);
          gathered += utxo.value;
          const withChange = estimateFee(inputs.length, [target, changeScript], feeRate);
          const withoutChange = estimateFee(inputs.length, [target], feeRate);
          if (gathered >= amount + withChange + P2WPKH_DUST) {
            fee = withChange;
            change = gathered - amount - fee;
            enough = true;
            break;
          }
          if (gathered >= amount + withoutChange) {
            // The remainder is too small for its own output; it joins the fee.
            fee = gathered - amount;
            enough = true;
            break;
          }
        }
        if (!enough) {
          const needed = amount + estimateFee(Math.max(available.length, 1), [target], feeRate);
          const error = new Error('Not enough Bitcoin for this amount and the network fee.');
          error.shortfall = Math.max(needed - total, 1);
          throw error;
        }
      }
      const psbt = new bitcoin.Psbt({ network: NETWORK });
      psbt.setVersion(2);
      for (const utxo of inputs) {
        const key = node(utxo.chain, utxo.index);
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          sequence: 0xfffffffd,
          witnessUtxo: { script: bitcoin.payments.p2wpkh({ pubkey: key.publicKey, network: NETWORK }).output, value: utxo.value },
        });
      }
      psbt.addOutput({ script: target, value: amount });
      if (change > 0) psbt.addOutput({ script: changeScript, value: change });
      inputs.forEach((utxo, i) => psbt.signInput(i, node(utxo.chain, utxo.index)));
      if (!psbt.validateSignaturesOfAllInputs()) throw new Error('Unable to sign the Bitcoin payment.');
      const tx = psbt.finalizeAllInputs().extractTransaction(true);
      return {
        tx,
        fee,
        amount,
        txid: tx.getId(),
        hex: tx.toHex(),
        // What was spent, so the payment can later be replaced if it gets stuck.
        inputs: inputs.map(({ txid, vout, value, chain, index }) => ({ txid, vout, value, chain, index })),
      };
    },
  };
}
