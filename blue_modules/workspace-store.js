const emptyState = () => ({ version: 1, drafts: {}, pending: {}, cache: {} });
const clone = value => JSON.parse(JSON.stringify(value));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonical(value[key])]),
    );
  return value;
}

export function createWorkspaceStore({ storage, request, randomID, now = () => new Date().toISOString() }) {
  const writes = new Map();
  const sending = new Map();
  const listeners = new Map();
  const requireAddress = address => {
    if (typeof address !== 'string' || !address) throw new Error('Connect your civic identity first.');
  };
  const read = async address => {
    requireAddress(address);
    await writes.get(address);
    return clone((await storage.read(address)) || emptyState());
  };
  const update = (address, apply, event = 'change') => {
    requireAddress(address);
    const work = (writes.get(address) || Promise.resolve()).then(async () => {
      const state = (await storage.read(address)) || emptyState();
      const result = apply(state);
      await storage.write(address, state);
      for (const listener of listeners.get(address) || []) {
        try {
          listener(event);
        } catch {
          /* A view must not invalidate a saved write. */
        }
      }
      return result;
    });
    writes.set(
      address,
      work.catch(() => {}),
    );
    return work;
  };
  const store = {
    read,
    subscribe(address, listener) {
      if (!listeners.has(address)) listeners.set(address, new Set());
      listeners.get(address).add(listener);
      return () => {
        listeners.get(address)?.delete(listener);
        if (!listeners.get(address)?.size) listeners.delete(address);
      };
    },
    saveDraft(address, key, fields) {
      return update(address, state => {
        if (state.pending[key]) throw new Error('A saved change is waiting. Resolve it before editing this draft.');
        if (!state.drafts[key] && Object.keys(state.drafts).length >= 30)
          throw new Error('Finish or discard a saved draft before creating another.');
        state.drafts[key] = { fields: clone(fields), updatedAt: now() };
      });
    },
    discardDraft(address, key) {
      return update(address, state => {
        if (state.pending[key]?.status === 'pending')
          throw new Error('This change may already be saved online. Retry it before discarding the draft.');
        delete state.drafts[key];
        delete state.pending[key];
      });
    },
    reviewRejected(address, key) {
      return update(address, state => {
        if (state.pending[key]?.status === 'pending') throw new Error('Retry this saved change first.');
        delete state.pending[key];
      });
    },
    cache(address, key, data) {
      return update(address, state => {
        state.cache[key] = { data: clone(data), savedAt: now() };
        // Bound storage on inexpensive phones. Drafts and pending changes are
        // never evicted; old downloaded snapshots can be fetched again.
        const snapshots = Object.keys(state.cache).sort((a, b) => state.cache[a].savedAt.localeCompare(state.cache[b].savedAt));
        for (const old of snapshots.slice(0, Math.max(0, snapshots.length - 24))) delete state.cache[old];
      });
    },
    forgetOrganizationCache(address, organizationId) {
      return update(address, state => {
        for (const key of Object.keys(state.cache)) if (key.includes(organizationId) || key === 'home') delete state.cache[key];
      });
    },
    submit(address, key, operation) {
      requireAddress(address);
      const lockKey = `${address}/${key}`;
      if (sending.has(lockKey)) return sending.get(lockKey);
      const run = (async () => {
        const command = await update(address, state => {
          const existing = state.pending[key];
          if (existing) {
            if (existing.status !== 'pending') throw new Error('Review this saved change before submitting it again.');
            if (operation && JSON.stringify(canonical(operation)) !== JSON.stringify(canonical(existing.operation))) {
              throw new Error('The previous change is still pending. Retry it before editing.');
            }
            return clone(existing);
          }
          if (!operation) throw new Error('No saved change is waiting.');
          if (!['POST', 'PATCH'].includes(operation.method) || !/^\/organizations(?:\/|$)/.test(operation.path))
            throw new Error('Invalid workspace request.');
          const next = {
            clientId: randomID(),
            operation: clone(operation),
            status: 'pending',
            createdAt: now(),
          };
          state.pending[key] = next;
          return clone(next);
        });
        let response;
        try {
          response = await request(address, {
            ...command.operation,
            data: { ...command.operation.data, client_id: command.clientId },
          });
        } catch (error) {
          if ([400, 403, 404, 409, 413, 422].includes(error.status)) {
            await update(address, state => {
              if (state.pending[key]?.clientId !== command.clientId) return;
              state.pending[key].status = error.code === 'version_conflict' ? 'conflict' : 'rejected';
              state.pending[key].message = error.message;
              if (error.code === 'version_conflict' && error.task) state.pending[key].latestTask = clone(error.task);
            });
          }
          throw error;
        }
        // If persisting the receipt fails, the pending ID survives and safely
        // replays the server receipt after a restart.
        await update(
          address,
          state => {
            if (state.pending[key]?.clientId === command.clientId) {
              delete state.pending[key];
              delete state.drafts[key];
            }
          },
          'submitted',
        );
        return response;
      })();
      sending.set(lockKey, run);
      run
        .finally(() => {
          if (sending.get(lockKey) === run) sending.delete(lockKey);
        })
        .catch(() => {});
      return run;
    },
  };
  return store;
}
