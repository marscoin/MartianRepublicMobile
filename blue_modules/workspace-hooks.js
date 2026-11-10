import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { workspaceRequest, workspaceStore } from './workspace-api';

export function useWorkspaceData(address, key, path) {
  const [state, setState] = useState({});
  const generation = useRef(0);
  const scope = useRef({ address, key, path });
  scope.current = { address, key, path };
  const refresh = useCallback(async () => {
    if (scope.current.address !== address || scope.current.key !== key || scope.current.path !== path) return;
    const current = ++generation.current;
    const apply = next => {
      if (current === generation.current)
        setState(previous => ({
          ...(previous.address === address && previous.key === key ? previous : {}),
          ...next,
          address,
          key,
        }));
    };
    if (!address) {
      apply({ data: null, loading: false, error: null });
      return;
    }
    apply({ loading: true, error: null });
    try {
      const local = await workspaceStore.read(address);
      if (local.cache[key])
        apply({
          data: local.cache[key].data,
          savedAt: local.cache[key].savedAt,
          cached: true,
        });
    } catch (error) {
      apply({ storageError: error.message });
    }
    try {
      const data = await workspaceRequest(address, { path });
      if (current !== generation.current) return;
      const savedAt = new Date().toISOString();
      try {
        await workspaceStore.cache(address, key, data);
        apply({ storageError: null });
      } catch (error) {
        apply({ storageError: error.message });
      }
      apply({ data, savedAt, cached: false, error: null });
    } catch (error) {
      apply({
        error: error.message,
        ...(error.status === 403 || error.status === 404 ? { data: null } : {}),
      });
    } finally {
      apply({ loading: false });
    }
  }, [address, key, path]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        generation.current++;
      };
    }, [refresh]),
  );
  const visible = state.address === address && state.key === key ? state : { loading: !!address };
  return { ...visible, refresh };
}

export function useWorkspaceDraft(address, key, initial) {
  const defaults = useRef(initial);
  const latest = useRef(initial);
  const scope = useRef({ address, key });
  if (scope.current.address !== address || scope.current.key !== key) {
    scope.current = { address, key };
    defaults.current = initial;
    latest.current = initial;
  }
  const generation = useRef(0);
  const [state, setState] = useState({ fields: initial, ready: false });
  const reload = useCallback(async () => {
    if (scope.current.address !== address || scope.current.key !== key) return;
    const current = ++generation.current;
    if (!address) return;
    try {
      const saved = await workspaceStore.read(address);
      if (current !== generation.current) return;
      const fields = saved.drafts[key]?.fields || defaults.current;
      latest.current = fields;
      setState({
        address,
        key,
        fields,
        pending: saved.pending[key],
        ready: true,
        saved: !!saved.drafts[key],
      });
    } catch (error) {
      if (current === generation.current)
        setState({
          address,
          key,
          fields: defaults.current,
          ready: false,
          error: error.message,
        });
    }
  }, [address, key]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    reload();
    return invalidate;
  }, [reload, invalidate]);
  const change = useCallback(
    patch => {
      if (scope.current.address !== address || scope.current.key !== key)
        return Promise.reject(new Error('Your draft changed. Open it again before editing.'));
      const fields = { ...latest.current, ...patch };
      latest.current = fields;
      setState(previous => ({
        ...previous,
        fields,
        saving: true,
        saved: false,
        error: null,
      }));
      const current = generation.current;
      // Persist each change through the serialized store, including the last
      // keystroke before navigating back or putting the app in the background.
      return workspaceStore
        .saveDraft(address, key, fields)
        .then(() => {
          if (current === generation.current && latest.current === fields)
            setState(previous => ({
              ...previous,
              saving: false,
              saved: true,
            }));
        })
        .catch(error => {
          if (current === generation.current)
            setState(previous => ({
              ...previous,
              saving: false,
              saved: false,
              error: error.message,
            }));
          return false;
        });
    },
    [address, key],
  );
  const save = useCallback(async () => {
    if (scope.current.address !== address || scope.current.key !== key) throw new Error('Your draft changed. Open it again before saving.');
    await workspaceStore.saveDraft(address, key, latest.current);
    return latest.current;
  }, [address, key]);
  const visible = state.address === address && state.key === key ? state : { fields: initial, ready: false };
  return { ...visible, change, save, reload };
}
