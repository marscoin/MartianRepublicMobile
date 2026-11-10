import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCivicSession } from '../../blue_modules/civic-api';
import { workspaceStore } from '../../blue_modules/workspace-api';
import { openWorkspaceDraft, savedChangeLabel } from '../../blue_modules/workspace-navigation';
import { removeWorkspacePhotos } from '../../blue_modules/workspace-photos';
import { CivicButton } from '../../components/CivicUi';
import { SmallAction, WorkspaceNotice, WorkspaceScreen, styles } from './WorkspaceUi';

export default function WorkspaceDrafts() {
  const navigation = useNavigation();
  const { address } = useCivicSession();
  const [local, setLocal] = useState({});
  const [busy, setBusy] = useState('');
  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setLocal({ address, data: await workspaceStore.read(address) });
    } catch (error) {
      setLocal({ address, error: error.message });
    }
  }, [address]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      if (address) return workspaceStore.subscribe(address, refresh);
    }, [address, refresh]),
  );
  const data = local.address === address ? local.data : null;
  const keys = [...new Set([...Object.keys(data?.pending || {}), ...Object.keys(data?.drafts || {})])];
  const retry = async key => {
    if (busy) return;
    setBusy(key);
    try {
      await workspaceStore.submit(address, key);
    } catch (error) {
      Alert.alert('Saved change', error.message);
    } finally {
      setBusy('');
      refresh();
    }
  };
  const discard = (key, fields) =>
    Alert.alert('Discard this saved draft?', 'Its text and local photos will be removed from this phone.', [
      { text: 'Keep draft', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await workspaceStore.discardDraft(address, key);
            await removeWorkspacePhotos(address, fields?.photos);
            refresh();
          } catch (error) {
            Alert.alert('Draft kept', error.message);
          }
        },
      },
    ]);
  const review = async (key, fields) => {
    try {
      await workspaceStore.reviewRejected(address, key);
      if (fields) openWorkspaceDraft(navigation, fields, address);
      else refresh();
    } catch (error) {
      Alert.alert('Saved change', error.message);
    }
  };
  return (
    <WorkspaceScreen title="Pick up where you left off.">
      <Text style={styles.secondaryText}>Drafts stay on this phone. Changes waiting for a connection can be retried safely.</Text>
      {local.address === address && local.error && (
        <WorkspaceNotice error action="Try again" onPress={refresh}>
          {local.error}
        </WorkspaceNotice>
      )}
      {data && !keys.length && <Text style={styles.body}>You’re all caught up. Your shared work is in your organizations.</Text>}
      {keys.map(key => {
        const draft = data.drafts[key];
        const pending = data.pending[key];
        const fields = draft?.fields;
        const title = pending
          ? savedChangeLabel(pending)
          : fields?.name ||
            fields?.title ||
            {
              record: 'Activity record',
              task: 'New task',
              invitation: 'Member invitation',
              organization: 'New organization',
              complete: 'Task completion',
            }[fields?._kind] ||
            'Saved draft';
        return (
          <View key={key} style={styles.card}>
            <Text style={styles.caption}>
              {pending ? (pending.status === 'pending' ? 'WAITING TO SYNC' : 'NEEDS REVIEW') : 'SAVED ON THIS PHONE'}
            </Text>
            <Text style={styles.cardTitle}>{title}</Text>
            {!!fields?.body && (
              <Text numberOfLines={3} style={styles.secondaryText}>
                {fields.body}
              </Text>
            )}
            {!!pending?.message && <Text style={styles.secondaryText}>{pending.message}</Text>}
            {pending?.status === 'pending' ? (
              <CivicButton title={busy === key ? 'Retrying…' : 'Retry saved change'} disabled={!!busy} onPress={() => retry(key)} />
            ) : pending ? (
              <CivicButton title={fields ? 'Review draft' : 'Dismiss failed change'} secondary onPress={() => review(key, fields)} />
            ) : (
              <CivicButton title="Continue draft" secondary onPress={() => openWorkspaceDraft(navigation, fields, address)} />
            )}
            {pending?.status !== 'pending' && <SmallAction title="Discard draft" danger onPress={() => discard(key, fields)} />}
          </View>
        );
      })}
    </WorkspaceScreen>
  );
}
