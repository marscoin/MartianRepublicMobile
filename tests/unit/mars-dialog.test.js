import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MarsDialogHost, dialogBlocks, dialogButtons, marsAlert } from '../../components/MarsDialog';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-screens', () => ({ FullWindowOverlay: ({ children }) => children }));

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const texts = tree => tree.root.findAllByType('Text').map(node => [].concat(node.props.children).join(''));

describe('themed dialog', () => {
  it('turns numbered paragraphs into steps and keeps the rest as text', () => {
    expect(dialogBlocks('1. Reserve.\n\n2. Pay.\n\nRefunds take four hours.')).toEqual([
      { number: '1', text: 'Reserve.' },
      { number: '2', text: 'Pay.' },
      { text: 'Refunds take four hours.' },
    ]);
    expect(dialogBlocks(undefined)).toEqual([]);
    expect(dialogBlocks('Fee 1. 5 sats')).toEqual([{ text: 'Fee 1. 5 sats' }]);
  });

  it('draws the action first, cancel last, and marks destructive actions', () => {
    const buttons = dialogButtons([{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive' }]);
    expect(buttons.map(button => [button.text, button.kind])).toEqual([
      ['Delete', 'danger'],
      ['Cancel', 'quiet'],
    ]);
    expect(dialogButtons(undefined).map(button => [button.text, button.kind])).toEqual([['OK', 'primary']]);
    expect(dialogButtons([{ text: 'Cancel', style: 'cancel' }, { text: 'Send' }])[0]).toMatchObject({ text: 'Send', kind: 'primary' });
  });

  it('falls back to the system alert when no host is mounted', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    marsAlert('Title', 'Message');
    expect(spy).toHaveBeenCalledWith('Title', 'Message');
    spy.mockRestore();
  });

  it('shows one dialog at a time and runs the chosen action after closing', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let tree;
    await act(async () => {
      tree = TestRenderer.create(<MarsDialogHost />);
    });
    const chosen = [];
    await act(async () => {
      marsAlert('Send 500 sats?', 'To an address', [
        { text: 'Cancel', style: 'cancel', onPress: () => chosen.push('cancel') },
        { text: 'Send', onPress: () => chosen.push('send') },
      ]);
      marsAlert('Second', 'Queued');
    });
    expect(spy).not.toHaveBeenCalled();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Send 500 sats?', 'To an address', 'Send', 'Cancel']));
    expect(texts(tree)).not.toContain('Second');

    await act(async () => {
      tree.root.findByProps({ testID: 'MarsDialogButton-0' }).props.onPress();
      await wait(400);
    });
    expect(chosen).toEqual(['send']);
    expect(texts(tree)).toContain('Second');

    await act(async () => {
      tree.root.findByProps({ testID: 'MarsDialogButton-0' }).props.onPress();
      await wait(400);
    });
    expect(tree.toJSON()).toBeNull();
    await act(async () => tree.unmount());
    spy.mockRestore();
  });
});
