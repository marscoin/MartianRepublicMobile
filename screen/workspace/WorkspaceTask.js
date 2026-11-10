import { marsAlert } from '../../components/MarsDialog';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useCivicSession } from '../../blue_modules/civic-api';
import { assertWorkspaceIdentity, workspaceStore } from '../../blue_modules/workspace-api';
import { useWorkspaceData, useWorkspaceDraft } from '../../blue_modules/workspace-hooks';
import { workspaceDraftKey } from '../../blue_modules/workspace-navigation';
import { removeWorkspacePhotos, uploadWorkspacePhotos } from '../../blue_modules/workspace-photos';
import { CivicButton } from '../../components/CivicUi';
import { DraftPhotos } from './WorkspaceForms';
import { dueDateLabel, ResourceStatus, SmallAction, WorkspaceField, WorkspaceNotice, WorkspaceScreen, styles } from './WorkspaceUi';

export default function WorkspaceTask() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const { organizationId, taskId } = params;
  const { address } = useCivicSession();
  const initialTask =
    params.identityAddress === address && params.task?.id === taskId && params.task?.organization_id === organizationId
      ? params.task
      : null;
  const resource = useWorkspaceData(address, `task:${organizationId}:${taskId}`, `/organizations/${organizationId}/tasks/${taskId}`);
  const groupResource = useWorkspaceData(address, `organization:${organizationId}`, `/organizations/${organizationId}`);
  const key = workspaceDraftKey('complete', organizationId, taskId);
  const draft = useWorkspaceDraft(address, key, {
    _kind: 'complete',
    _organizationId: organizationId,
    _taskId: taskId,
    _task: initialTask,
    note: '',
    photos: [],
  });
  const task = resource.data?.task || (!resource.error ? draft.fields._task || initialTask : null);
  const group = groupResource.data?.organization;
  const members = groupResource.data?.members || [];
  const identity = members.find(member => member.address === address);
  const mayUpdate =
    !!task && !!identity && (group?.role === 'owner' || identity.id === task.created_by || identity.id === task.assigned_to);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const lock = useRef(false);
  const scope = useRef({ address, key });
  scope.current = { address, key };
  const focused = useRef(false);
  focused.current = useIsFocused();
  useEffect(() => {
    lock.current = false;
    setBusy(false);
  }, [address, key]);
  const current = () => focused.current && scope.current.address === address && scope.current.key === key;
  const disabled = busy || photoBusy || !!draft.pending || !draft.ready || !mayUpdate || !!group?.archived_at;

  const submit = async status => {
    if (lock.current || photoBusy) return;
    const marker = {};
    lock.current = marker;
    setBusy(true);
    try {
      let fields = draft.fields;
      if (draft.pending) await workspaceStore.submit(address, key);
      else {
        if (!task) throw new Error('Reconnect to review this task before saving a change.');
        fields = await draft.save();
        const attachmentIds = await uploadWorkspacePhotos(address, organizationId, fields.photos, async photos => {
          fields = { ...fields, photos };
          if ((await draft.change({ photos })) === false) throw new Error('The photo could not be saved in your draft. Try again.');
        });
        await workspaceStore.submit(address, key, {
          method: 'PATCH',
          path: `/organizations/${organizationId}/tasks/${taskId}`,
          data: {
            version: task.version,
            status,
            note: fields.note.trim() || null,
            attachment_ids: attachmentIds,
          },
          label: `${status === 'done' ? 'Complete' : 'Reopen'} task: ${task.title}`,
        });
      }
      await removeWorkspacePhotos(address, fields.photos);
      assertWorkspaceIdentity(address);
      if (current())
        navigation.navigate({
          name: 'WorkspaceOrganization',
          params: { organizationId, section: 'activity' },
          merge: true,
        });
    } catch (error) {
      if (current()) marsAlert('Could not update task', error.message);
      await draft.reload();
    } finally {
      if (lock.current === marker) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  const review = async () => {
    try {
      await workspaceStore.reviewRejected(address, key);
      await Promise.all([draft.reload(), resource.refresh(), groupResource.refresh()]);
    } catch (error) {
      marsAlert('Update kept', error.message);
    }
  };
  const action = () => {
    if (draft.pending || task?.status !== 'done') {
      submit('done');
      return;
    }
    marsAlert(
      'Reopen this task?',
      'The task will return to the open list. Its completed work and earlier records will remain in the activity log.',
      [
        { text: 'Keep completed', style: 'cancel' },
        { text: 'Reopen task', onPress: () => submit('open') },
      ],
    );
  };
  const discard = () =>
    marsAlert('Discard this update draft?', 'The task and its existing records will stay as they are.', [
      { text: 'Keep draft', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await workspaceStore.discardDraft(address, key);
            await removeWorkspacePhotos(address, draft.fields.photos);
            await draft.reload();
          } catch (error) {
            marsAlert('Draft kept', error.message);
          }
        },
      },
    ]);

  return (
    <WorkspaceScreen
      title={task?.title || 'Task details'}
      eyebrow="MCR / SHARED WORK"
      onRefresh={() => {
        resource.refresh();
        groupResource.refresh();
      }}
      refreshing={!!resource.loading && !!task}
    >
      <ResourceStatus resource={resource} />
      <ResourceStatus resource={groupResource} />
      {task && (
        <>
          <View style={styles.card}>
            <Text style={styles.caption}>
              {task.status === 'done' ? 'COMPLETED' : 'OPEN TASK'}
              {group ? ` · ${group.name.toUpperCase()}` : ''}
            </Text>
            <Text style={styles.body}>
              Assigned to {members.find(member => member.id === task.assigned_to)?.name || (task.assigned_to ? 'a member' : 'no one yet')}
            </Text>
            <Text style={styles.secondaryText}>{task.due_date ? `Due ${dueDateLabel(task.due_date)}` : 'No due date'}</Text>
            {!!task.details && (
              <Text selectable style={styles.body}>
                {task.details}
              </Text>
            )}
            {task.completed_at && <Text style={styles.caption}>Completed {new Date(task.completed_at).toLocaleString()}</Text>}
          </View>
          {!!group?.archived_at && <WorkspaceNotice>This organization is archived. Its work is available to read.</WorkspaceNotice>}
          {!mayUpdate && group && (
            <Text style={styles.secondaryText}>The assignee, task creator, or organization owner can update this task.</Text>
          )}
        </>
      )}
      {draft.error && <WorkspaceNotice error>{draft.error}</WorkspaceNotice>}
      {draft.pending && (
        <WorkspaceNotice error={draft.pending.status !== 'pending'}>
          {draft.pending.status === 'pending'
            ? 'This update is saved. Retrying checks the same change without recording it twice.'
            : draft.pending.message || 'Review the latest task before retrying this update.'}
        </WorkspaceNotice>
      )}
      {draft.pending?.latestTask && (
        <View style={styles.card}>
          <Text style={styles.caption}>LATEST SAVED TASK</Text>
          <Text style={styles.body}>{draft.pending.latestTask.title}</Text>
          <Text style={styles.secondaryText}>
            {draft.pending.latestTask.status === 'done' ? 'Already completed' : 'Still open'} · Your note and photos have been kept.
          </Text>
        </View>
      )}
      {(mayUpdate || draft.pending) && (
        <>
          <WorkspaceField
            label={task?.status === 'done' ? 'Reopening note · optional' : 'Completion note · optional'}
            value={draft.fields.note}
            onChangeText={note => draft.change({ note })}
            maxLength={5000}
            multiline
            editable={!disabled}
            placeholder="What changed? What should the next person know?"
          />
          <DraftPhotos
            address={address}
            photos={draft.fields.photos}
            onChange={photos => draft.change({ photos })}
            disabled={disabled}
            onBusy={setPhotoBusy}
          />
          <Text style={styles.caption}>
            {draft.pending
              ? 'SAVED CHANGE'
              : draft.saving
                ? 'Saving on this phone…'
                : draft.saved
                  ? 'Saved on this phone'
                  : 'Your update will leave a dated entry in the activity log.'}
          </Text>
          {draft.pending && draft.pending.status !== 'pending' ? (
            <CivicButton title="Review latest task" onPress={review} secondary disabled={busy} />
          ) : (
            <CivicButton
              title={busy ? 'Saving…' : draft.pending ? 'Retry saved change' : task?.status === 'done' ? 'Reopen task' : 'Complete task'}
              onPress={action}
              disabled={busy || photoBusy || !draft.ready || !!group?.archived_at || (!draft.pending && !mayUpdate)}
              icon="check"
            />
          )}
          {draft.pending?.status !== 'pending' && (draft.saved || draft.error) && (
            <SmallAction title="Discard update draft" onPress={discard} disabled={busy || photoBusy} danger />
          )}
        </>
      )}
    </WorkspaceScreen>
  );
}
