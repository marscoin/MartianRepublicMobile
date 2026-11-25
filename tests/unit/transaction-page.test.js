// The transaction page, with real numbers from the owner's civic wallet. The network is a stand-in.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import * as bitcoin from 'bitcoinjs-lib';

const mockBlur = [];
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ goBack: jest.fn() }),
    useRoute: () => ({ params: {} }),
    useIsFocused: () => true,
    useFocusEffect: effect =>
      useEffect(() => {
        const cleanup = effect();
        mockBlur.push(cleanup);
        return cleanup;
      }, [effect]),
  };
});
jest.mock('react-native-elements', () => ({ Icon: () => null }));
jest.mock('react-native-svg', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }) => createElement(View, null, children), Path: () => null };
});
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn() }));
jest.mock('../../loc', () => ({ __esModule: true, default: {}, transactionTimeToReadable: () => '5 days ago' }));
jest.mock('../../blue_modules/storage-context', () => ({ BlueStorageContext: require('react').createContext({}) }));
jest.mock('../../blue_modules/hapticFeedback', () => ({ __esModule: true, default: jest.fn(), HapticFeedbackTypes: {} }));
jest.mock('../../components/handoff', () => {
  const Handoff = () => null;
  Handoff.activityTypes = {};
  return Handoff;
});

const Clipboard = require('@react-native-clipboard/clipboard');
const { TransactionView } = require('../../screen/transactions/transactionStatus');

const CIVIC = 'MLVcSocnecoZqXuk8Hy7DXvXHmnSwcBj4J';
const OTHER = 'MVsv5e9Wg6Ph3xqL43MEsjf7XL1a3X8KQJ';
const SWEEP = 'c8511cdb9fd74f0fd15fdff13bbda11d8273bec935d582dfe5c938792911b6a5';
const POST = '81d6347492cf9f185562f8d68725af86114f2fa5d7227fbbe023d0c9de182d95';
const CID = 'QmXrwJULWV3h4uGjiDig35s7vGhmnzTKurfwdUMPUco6hp';
const pay = (address, value) => ({ value, scriptPubKey: { type: 'pubkeyhash', addresses: [address] } });
const wallet = { civic: true, weOwnAddress: address => address === CIVIC, getLabel: () => 'CIVIC WALLET' };

// 328.40676930 MARS from 43 coins to one address, as the wallet stores it (value with the old float error).
const sweep = {
  hash: SWEEP,
  value: -32840676929.999996,
  confirmations: 3390,
  received: Date.UTC(2026, 10, 20, 1, 28),
  inputs: [...Array(42)].map(() => ({ addresses: [CIVIC], value: 7.8 })).concat([{ addresses: [CIVIC], value: 0.8067693 }]),
  outputs: [pay(OTHER, 328.4054593)],
};
const post = {
  hash: POST,
  value: -2580,
  confirmations: 166940,
  received: Date.UTC(2026, 3, 1, 2, 54),
  inputs: [{ addresses: [CIVIC], value: 198.7699742 }],
  outputs: [
    { value: 0, scriptPubKey: { hex: bitcoin.payments.embed({ data: [Buffer.from(`SP_${CID}`)] }).output.toString('hex') } },
    pay(CIVIC, 0.0001),
    pay(CIVIC, 198.7698484),
  ],
};

function network({ height = 3605415, tip = 3608811, hexBytes = 6388, json = null } = {}) {
  return {
    history: jest.fn(async () => [
      { tx_hash: SWEEP, height },
      { tx_hash: POST, height: 3441865 },
    ]),
    tip: jest.fn(async () => tip),
    txHex: jest.fn(async () => 'ab'.repeat(hexBytes)),
    fetchJson: jest.fn(async () => json),
    rate: jest.fn(async () => 0.060795229852647584),
  };
}

// Each outermost Text with everything nested in it, as one string.
const textOf = node => node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
const outermost = node => {
  for (let up = node.parent; up; up = up.parent) if (up.type === 'Text') return false;
  return true;
};
const texts = tree =>
  tree.root
    .findAll(node => node.type === 'Text' && outermost(node))
    .map(textOf)
    .join(' | ');
const host = (tree, testID) => tree.root.find(node => node.props?.testID === testID && typeof node.type === 'string');
const pressable = (tree, testID) => tree.root.find(node => node.props?.testID === testID && typeof node.props.onPress === 'function');

async function page(props) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<TransactionView wallet={wallet} wallets={[wallet]} onBack={() => {}} {...props} />);
  });
  return tree;
}

describe('the transaction page', () => {
  it('shows the sweep in MARS, exactly, with what it was and where it went', async () => {
    const tree = await page({ tx: sweep, network: network() });
    const all = texts(tree);
    expect(all).toContain('SENT · 5 DAYS AGO');
    // Not -32840676929.999996: whole MARS, eight decimals, the unit.
    expect(textOf(host(tree, 'TransactionAmount'))).toBe('−328.40676930 MARS');
    expect(all).toContain("≈ $19.97 at today's price");
    expect(all).toContain('BLK 3,605,415');
    expect(all).toContain('SETTLED');
    expect(all).toContain('3,397 blocks deep');
    expect(all).toContain('01:28 UTC');
    expect(all).toContain('43 in · 1 out');
    expect(all).toContain('Your civic wallet');
    expect(all).toContain('43 coins spent');
    expect(all).toContain('Network fee, to the miners');
    expect(all).toContain('MVsv5e9W…L1a3X8KQJ');
    expect(all).toContain('Not one of your wallets');
    expect(all).toContain('328.40545930');
    expect(all).toContain('6,388 bytes');
    expect(all).toContain('20.5 zubrins/byte');
    expect(all).not.toContain('REPUBLIC RECORD');
  });

  it('reads the Republic record and quotes it from IPFS', async () => {
    const net = network({ json: { data: { post: 'New version of the Marscoin Electrum Wallet released today' } } });
    const tree = await page({ tx: post, network: net });
    const all = texts(tree);
    expect(net.fetchJson).toHaveBeenCalledWith(`https://ipfs.marscoin.org/ipfs/${CID}`);
    expect(all).toContain('REPUBLIC RECORD · 5 DAYS AGO');
    expect(textOf(host(tree, 'TransactionAmount'))).toBe('−0.00002580 MARS');
    expect(all).toContain('Network fee only. The coins stayed in your wallet.');
    expect(all).toContain('Signed forum post');
    expect(all).toContain('New version of the Marscoin Electrum Wallet released today');
    expect(all).toContain('The record, carrying no coins');
    expect(all).toContain('Back to your civic wallet');
    expect(all).toContain('Returned, 2 outputs');
    expect(all).toContain('198.76994840');
  });

  it('watches a transaction that is waiting for a block, and says when it lands', async () => {
    jest.useFakeTimers();
    try {
      const net = network({ height: 0 });
      const onConfirmed = jest.fn();
      const tree = await page({ tx: { ...sweep, confirmations: 0 }, network: net, onConfirmed });
      expect(texts(tree)).toContain('WAITING FOR A BLOCK');
      expect(texts(tree)).toContain('Checking for the next block every 30 seconds.');
      net.history.mockImplementation(async () => [{ tx_hash: SWEEP, height: 3608811 }]);
      await act(async () => {
        jest.advanceTimersByTime(30000);
      });
      expect(onConfirmed).toHaveBeenCalledTimes(1);
      expect(texts(tree)).toContain('CONFIRMING');
      expect(texts(tree)).toContain('1 of 6 blocks');
    } finally {
      jest.useRealTimers();
    }
  });

  it("tells the sender's change apart from what you received", async () => {
    const incoming = {
      hash: SWEEP,
      value: 500000000,
      confirmations: 10,
      received: Date.UTC(2026, 2, 27, 20, 0),
      inputs: [{ addresses: [OTHER], value: 24.852879 }],
      outputs: [pay(CIVIC, 5), pay(OTHER, 19.849376)],
    };
    const tree = await page({ tx: incoming, network: network() });
    const all = texts(tree);
    expect(all).toContain('RECEIVED · 5 DAYS AGO');
    expect(textOf(host(tree, 'TransactionAmount'))).toBe('+5.00000000 MARS');
    expect(all).toContain('Change, back to the sender');
    expect(all).toContain('19.84937600');
    expect(all).not.toContain('Not one of your wallets');
  });

  it('keeps the note and copies the transaction ID', async () => {
    const onNote = jest.fn();
    const tree = await page({ tx: sweep, network: network(), onNote });
    const input = host(tree, 'TransactionNote');
    await act(async () => input.props.onChangeText('Moved to the swap maker'));
    await act(async () => host(tree, 'TransactionNote').props.onEndEditing());
    expect(onNote).toHaveBeenCalledWith('Moved to the swap maker');
    expect(texts(tree)).toContain('SAVED');
    await act(async () => pressable(tree, 'TransactionCopyId').props.onPress());
    expect(Clipboard.setString).toHaveBeenCalledWith(SWEEP);
    expect(texts(tree)).toContain('Copied');
  });

  it('still shows the transaction when the network does not answer', async () => {
    const net = network();
    net.history.mockRejectedValue(new Error('offline'));
    net.txHex.mockRejectedValue(new Error('offline'));
    net.rate.mockResolvedValue(null);
    const tree = await page({ tx: sweep, network: net });
    const all = texts(tree);
    expect(all).toContain('SETTLED');
    expect(all).toContain('3,390 blocks deep');
    expect(all).not.toContain('BLK');
    expect(all).not.toContain('at today');
    expect(all).toContain('−328.40676930');
  });
});
