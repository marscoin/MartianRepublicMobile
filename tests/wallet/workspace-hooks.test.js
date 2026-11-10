import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useWorkspaceData, useWorkspaceDraft } from '../../blue_modules/workspace-hooks';
import { workspaceRequest, workspaceStore } from '../../blue_modules/workspace-api';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: effect => require('react').useEffect(effect, [effect]) }));
jest.mock('../../blue_modules/workspace-api', () => ({
  workspaceRequest: jest.fn(),
  workspaceStore: { read: jest.fn(), cache: jest.fn(), saveDraft: jest.fn() },
}));

const deferred = () => {
  let resolve;
  const promise = new Promise(_resolve => {
    resolve = _resolve;
  });
  return { promise, resolve };
};
const empty = () => ({ drafts: {}, cache: {}, pending: {} });

describe('workspace identity boundaries', () => {
  beforeEach(() => {
    workspaceStore.read.mockReset().mockResolvedValue(empty());
    workspaceStore.cache.mockReset().mockResolvedValue();
    workspaceStore.saveDraft.mockReset().mockResolvedValue();
    workspaceRequest.mockReset();
  });

  it('does not display or cache an old identity’s delayed response, including an old refresh callback', async () => {
    const oldResponse = deferred();
    workspaceRequest.mockImplementation(address => (address === 'A' ? oldResponse.promise : Promise.resolve({ identity: 'B' })));
    let current;
    function View({ address }) {
      current = useWorkspaceData(address, 'home', '/workspace');
      return null;
    }
    let tree;
    await act(async () => {
      tree = renderer.create(<View address="A" />);
    });
    const oldRefresh = current.refresh;
    await act(async () => {
      tree.update(<View address="B" />);
    });
    expect(current.data).toEqual({ identity: 'B' });
    await act(async () => {
      oldResponse.resolve({ identity: 'private-A' });
    });
    expect(current.data).toEqual({ identity: 'B' });
    expect(workspaceStore.cache).not.toHaveBeenCalledWith('A', expect.anything(), expect.anything());
    workspaceRequest.mockClear();
    await act(async () => {
      await oldRefresh();
    });
    expect(workspaceRequest).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('keeps draft fields and delayed edits bound to their original identity', async () => {
    const oldRead = deferred();
    workspaceStore.read.mockImplementation(address => (address === 'A' ? oldRead.promise : Promise.resolve(empty())));
    let current;
    function View({ address }) {
      current = useWorkspaceDraft(address, 'record', { body: '' });
      return null;
    }
    let tree;
    await act(async () => {
      tree = renderer.create(<View address="A" />);
    });
    const stale = current;
    await act(async () => {
      tree.update(<View address="B" />);
    });
    await act(async () => {
      oldRead.resolve({ ...empty(), drafts: { record: { fields: { body: 'private-A' } } } });
    });
    expect(current.fields).toEqual({ body: '' });
    await expect(stale.change({ body: 'late-A' })).rejects.toThrow('draft changed');
    await expect(stale.save()).rejects.toThrow('draft changed');
    expect(workspaceStore.saveDraft).not.toHaveBeenCalled();
    await act(async () => {
      await current.change({ body: 'B-only' });
    });
    expect(workspaceStore.saveDraft).toHaveBeenCalledWith('B', 'record', { body: 'B-only' });
    expect(current.fields.body).toBe('B-only');
    act(() => tree.unmount());
  });

  it('persists the last edit even when the view unmounts before storage completes', async () => {
    const write = deferred();
    workspaceStore.saveDraft.mockReturnValue(write.promise);
    let current;
    function View() {
      current = useWorkspaceDraft('A', 'record', { body: '' });
      return null;
    }
    let tree;
    await act(async () => {
      tree = renderer.create(<View />);
    });
    let saving;
    act(() => {
      saving = current.change({ body: 'last keystroke' });
      tree.unmount();
    });
    expect(workspaceStore.saveDraft).toHaveBeenCalledWith('A', 'record', { body: 'last keystroke' });
    await act(async () => {
      write.resolve();
      await saving;
    });
  });
});
