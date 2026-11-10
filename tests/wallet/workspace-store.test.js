import { randomBytes } from 'crypto';
import { createWorkspaceStorage } from '../../blue_modules/workspace-storage';
import { createWorkspaceStore } from '../../blue_modules/workspace-store';

function fixture() {
  const values = new Map();
  const secrets = new Map();
  const write = jest.fn(async (key, value) => values.set(key, value));
  const storage = createWorkspaceStorage({
    values: { getItem: async key => values.get(key), setItem: write },
    keys: {
      read: async address => secrets.get(address),
      write: async (address, secret) => secrets.set(address, secret),
    },
    randomBytes,
  });
  let counter = 0;
  const request = jest.fn(async () => ({ saved: true }));
  const make = () =>
    createWorkspaceStore({
      storage,
      request,
      randomID: () => `command-${++counter}`,
    });
  return { values, secrets, storage, request, store: make(), make, write };
}
const operation = {
  method: 'POST',
  path: '/organizations/one/records',
  data: { body: 'Water pressure normal.' },
};

describe('Encrypted workspace drafts and durable requests', () => {
  it('keeps record text out of ordinary storage and separates civic identities', async () => {
    const f = fixture();
    await f.store.saveDraft('identity-A', 'record', {
      body: 'Private maintenance details',
    });
    await f.store.saveDraft('identity-B', 'record', { body: 'Other identity' });
    expect([...f.values.values()].join()).not.toContain('Private maintenance details');
    expect((await f.make().read('identity-A')).drafts.record.fields.body).toBe('Private maintenance details');
    expect((await f.store.read('identity-B')).drafts.record.fields.body).toBe('Other identity');
    expect(f.secrets.get('identity-A')).not.toBe(f.secrets.get('identity-B'));
  });
  it('rejects tampering and missing keys without overwriting the saved data', async () => {
    const f = fixture();
    await f.store.saveDraft('A', 'record', { body: 'Keep this' });
    const [key, original] = [...f.values.entries()][0];
    const changed = JSON.parse(original);
    changed.ciphertext = changed.ciphertext.slice(1) + 'a';
    f.values.set(key, JSON.stringify(changed));
    await expect(f.store.read('A')).rejects.toThrow('could not be read');
    await expect(f.store.saveDraft('A', 'record', { body: 'Overwrite' })).rejects.toThrow('could not be read');
    f.values.set(key, original);
    f.secrets.delete('A');
    await expect(f.store.read('A')).rejects.toThrow('could not be read');
    expect(f.values.get(key)).toBe(original);
  });
  it('cannot move authenticated ciphertext to another identity', async () => {
    const f = fixture();
    await f.store.saveDraft('A', 'record', { body: 'Bound to A' });
    f.secrets.set('B', f.secrets.get('A'));
    f.values.set('org.martianrepublic.workspace.B', f.values.get('org.martianrepublic.workspace.A'));
    await expect(f.store.read('B')).rejects.toThrow('could not be read');
  });
  it('persists a request before sending and reuses its ID after restart and lost response', async () => {
    const f = fixture();
    await f.store.saveDraft('A', 'record', { body: operation.data.body });
    f.request.mockImplementationOnce(async () => {
      expect((await f.storage.read('A')).pending.record.clientId).toBe('command-1');
      throw new Error('connection lost after server commit');
    });
    await expect(f.store.submit('A', 'record', operation)).rejects.toThrow('connection lost');
    const restarted = f.make();
    expect((await restarted.read('A')).drafts.record.fields.body).toBe(operation.data.body);
    await restarted.submit('A', 'record');
    expect(f.request.mock.calls[0][1]).toEqual(f.request.mock.calls[1][1]);
    expect((await restarted.read('A')).pending).toEqual({});
    expect((await restarted.read('A')).drafts).toEqual({});
  });
  it('shares an in-flight submission and cannot edit or discard an uncertain request', async () => {
    const f = fixture();
    f.request.mockRejectedValue(new Error('offline'));
    const first = f.store.submit('A', 'record', operation);
    expect(f.store.submit('A', 'record', operation)).toBe(first);
    await expect(first).rejects.toThrow('offline');
    await expect(f.store.saveDraft('A', 'record', { body: 'Changed' })).rejects.toThrow('waiting');
    await expect(f.store.discardDraft('A', 'record')).rejects.toThrow('may already be saved');
    await expect(
      f.store.submit('A', 'record', {
        ...operation,
        data: { body: 'Changed' },
      }),
    ).rejects.toThrow('previous change');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('never sends a command when saving it fails', async () => {
    const f = fixture();
    f.write.mockRejectedValue(new Error('storage full'));
    await expect(f.store.submit('A', 'record', operation)).rejects.toThrow('storage full');
    expect(f.request).not.toHaveBeenCalled();
  });
  it('retains the command if the server responds but saving the receipt fails', async () => {
    const f = fixture();
    f.write.mockImplementationOnce(async (key, value) => f.values.set(key, value)).mockRejectedValueOnce(new Error('storage full'));
    await expect(f.store.submit('A', 'record', operation)).rejects.toThrow('storage full');
    await f.make().submit('A', 'record');
    expect(f.request.mock.calls[0][1].data.client_id).toBe(f.request.mock.calls[1][1].data.client_id);
  });
  it('preserves a conflicted draft and requires review before applying to a newer task', async () => {
    const f = fixture();
    await f.store.saveDraft('A', 'completion', { note: 'Work completed' });
    f.request.mockRejectedValueOnce(
      Object.assign(new Error('Changed elsewhere'), {
        status: 409,
        code: 'version_conflict',
        task: { id: 'task', version: 2 },
      }),
    );
    await expect(f.store.submit('A', 'completion', operation)).rejects.toThrow('Changed elsewhere');
    const saved = await f.store.read('A');
    expect(saved.pending.completion).toMatchObject({
      status: 'conflict',
      latestTask: { version: 2 },
    });
    expect(saved.drafts.completion.fields.note).toBe('Work completed');
    await expect(f.store.submit('A', 'completion')).rejects.toThrow('Review');
    await f.store.reviewRejected('A', 'completion');
    await f.store.submit('A', 'completion', {
      ...operation,
      data: { version: 2 },
    });
    expect(f.request.mock.calls[1][1].data.client_id).not.toBe(f.request.mock.calls[0][1].data.client_id);
  });
  it('serializes parallel drafts, preserves pending changes when evicting caches, and purges revoked caches', async () => {
    const f = fixture();
    await Promise.all(['first', 'second'].map(key => f.store.saveDraft('A', key, { body: key })));
    await Promise.all(Array.from({ length: 28 }, (_, i) => f.store.cache('A', `organization-${i}`, { id: i })));
    const saved = await f.store.read('A');
    expect(Object.keys(saved.drafts)).toEqual(['first', 'second']);
    expect(Object.keys(saved.cache)).toHaveLength(24);
    await f.store.cache('A', 'home', { organization: 'private' });
    await f.store.forgetOrganizationCache('A', 'organization-27');
    const cleared = await f.store.read('A');
    expect(cleared.cache.home).toBeUndefined();
    expect(cleared.cache['organization-27']).toBeUndefined();
    expect(Object.keys(cleared.drafts)).toHaveLength(2);
  });
});
