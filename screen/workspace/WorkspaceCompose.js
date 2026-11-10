import React, { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import * as bitcoin from 'bitcoinjs-lib';
import { Marscoin } from '../../blue_modules/constants';
import { useCivicSession } from '../../blue_modules/civic-api';
import { assertWorkspaceIdentity, workspaceStore } from '../../blue_modules/workspace-api';
import { useWorkspaceData, useWorkspaceDraft } from '../../blue_modules/workspace-hooks';
import { workspaceDraftKey } from '../../blue_modules/workspace-navigation';
import { removeWorkspacePhotos, uploadWorkspacePhotos } from '../../blue_modules/workspace-photos';
import { CivicButton } from '../../components/CivicUi';
import { DraftPhotos, MemberPicker } from './WorkspaceForms';
import { ResourceStatus, SmallAction, WorkspaceField, WorkspaceNotice, WorkspaceScreen, styles } from './WorkspaceUi';

const titles = {
  organization: 'Start your organization.',
  task: 'Give the work a next step.',
  record: 'Leave a useful record.',
  invitation: 'Bring someone aboard.',
};
const buttons = {
  organization: 'Create organization',
  task: 'Create task',
  record: 'Share record with members',
  invitation: 'Send invitation',
};

function localDateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function WorkspaceCompose() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const kind = params.kind;
  const organizationId = params.organizationId;
  const { address } = useCivicSession();
  const key = workspaceDraftKey(kind, organizationId);
  const draft = useWorkspaceDraft(address, key, {
    _kind: kind,
    _organizationId: organizationId,
    name: '',
    description: '',
    title: '',
    details: '',
    body: '',
    address: '',
    assigned_to: null,
    due_date: '',
    photos: [],
  });
  const groupResource = useWorkspaceData(
    organizationId ? address : null,
    `organization:${organizationId}`,
    `/organizations/${organizationId}`,
  );
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const lock = useRef(false);
  const scope = useRef({ address, key });
  scope.current = { address, key };
  useEffect(() => {
    lock.current = false;
    setBusy(false);
  }, [address, key]);
  const focused = useRef(false);
  focused.current = useIsFocused();
  const fields = draft.fields;
  const disabled = busy || photoBusy || !draft.ready || !!draft.pending || !address;
  const group = groupResource.data?.organization;
  const change = patch => draft.change(patch);

  const validate = form => {
    if (kind === 'organization' && !form.name.trim()) throw new Error('Give your organization a name.');
    if (kind === 'task') {
      if (!form.title.trim()) throw new Error('Give this task a title.');
      const due = new Date(`${form.due_date}T12:00:00Z`);
      if (
        form.due_date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(form.due_date) || Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== form.due_date)
      ) {
        throw new Error('Use a valid date in YYYY-MM-DD format, or leave it empty.');
      }
    }
    if (kind === 'record' && !form.body.trim()) throw new Error('Add a short note so members know what the record is about.');
    if (kind === 'invitation') {
      try {
        bitcoin.address.toOutputScript(form.address.trim(), Marscoin.mainnet);
      } catch {
        throw new Error('Enter the member’s Marscoin civic address. You can copy it from their civic ID.');
      }
      if (form.address.trim() === address) throw new Error('You are already a member of this organization.');
    }
    if (!titles[kind]) throw new Error('This draft type is unavailable.');
  };

  const submit = async () => {
    if (lock.current || photoBusy) return;
    const marker = {};
    lock.current = marker;
    setBusy(true);
    try {
      let result;
      let form = fields;
      if (draft.pending) {
        result = await workspaceStore.submit(address, key);
      } else {
        form = await draft.save();
        validate(form);
        let attachmentIds = [];
        if (kind === 'record') {
          attachmentIds = await uploadWorkspacePhotos(address, organizationId, form.photos, async photos => {
            form = { ...form, photos };
            if ((await draft.change({ photos })) === false)
              throw new Error('The uploaded photo could not be saved in this draft. Try again.');
          });
        }
        const operations = {
          organization: {
            method: 'POST',
            path: '/organizations',
            data: {
              name: form.name.trim(),
              description: form.description.trim() || null,
            },
            label: `Create ${form.name.trim()}`,
          },
          task: {
            method: 'POST',
            path: `/organizations/${organizationId}/tasks`,
            data: {
              title: form.title.trim(),
              details: form.details.trim() || null,
              assigned_to: form.assigned_to,
              due_date: form.due_date || null,
            },
            label: `Create task: ${form.title.trim()}`,
          },
          record: {
            method: 'POST',
            path: `/organizations/${organizationId}/records`,
            data: { body: form.body.trim(), attachment_ids: attachmentIds },
            label: `Share a record with ${group?.name || 'your organization'}`,
          },
          invitation: {
            method: 'POST',
            path: `/organizations/${organizationId}/invitations`,
            data: { address: form.address.trim() },
            label: `Invite a member to ${group?.name || 'your organization'}`,
          },
        };
        result = await workspaceStore.submit(address, key, operations[kind]);
      }
      await removeWorkspacePhotos(address, form.photos);
      assertWorkspaceIdentity(address);
      if (!focused.current || scope.current.address !== address || scope.current.key !== key) return;
      if (kind === 'organization')
        navigation.replace('WorkspaceOrganization', {
          organizationId: result.organization.id,
          section: 'members',
        });
      else if (kind === 'task')
        navigation.replace('WorkspaceTask', {
          identityAddress: address,
          organizationId,
          taskId: result.task.id,
          task: result.task,
        });
      else
        navigation.navigate({
          name: 'WorkspaceOrganization',
          params: {
            organizationId,
            section: kind === 'record' ? 'activity' : 'members',
          },
          merge: true,
        });
    } catch (error) {
      if (focused.current && scope.current.address === address && scope.current.key === key) Alert.alert('Could not submit', error.message);
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
      await draft.reload();
    } catch (error) {
      Alert.alert('Draft unavailable', error.message);
    }
  };
  const discard = () =>
    Alert.alert('Discard this draft?', 'This removes its saved text and local photos from this phone.', [
      { text: 'Keep draft', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await workspaceStore.discardDraft(address, key);
            await removeWorkspacePhotos(address, fields.photos);
            navigation.goBack();
          } catch (error) {
            Alert.alert('Draft kept', error.message);
          }
        },
      },
    ]);

  return (
    <WorkspaceScreen title={titles[kind] || 'Saved draft'}>
      {organizationId && <ResourceStatus resource={groupResource} />}
      {!!group?.name && <Text style={styles.caption}>{group.name.toUpperCase()} · MEMBERS ONLY</Text>}
      {draft.error && <WorkspaceNotice error>{draft.error}</WorkspaceNotice>}
      {draft.pending && (
        <WorkspaceNotice error={draft.pending.status !== 'pending'}>
          {draft.pending.status === 'pending'
            ? 'This change is saved and may already be online. Retry submits the same change without creating a duplicate.'
            : draft.pending.message || 'Review the saved change before trying again.'}
        </WorkspaceNotice>
      )}
      {kind === 'organization' && (
        <>
          <Text style={styles.secondaryText}>
            A home for your crew, project, or community. Only people who accept your invitation can see its work and records.
          </Text>
          <WorkspaceField
            label="Organization name"
            value={fields.name}
            onChangeText={name => change({ name })}
            maxLength={100}
            editable={!disabled}
            placeholder="e.g., Habitat systems crew"
            autoCapitalize="words"
          />
          <WorkspaceField
            label="What brings you together? · optional"
            value={fields.description}
            onChangeText={description => change({ description })}
            maxLength={2000}
            multiline
            editable={!disabled}
            placeholder="A short description of your purpose."
          />
        </>
      )}
      {kind === 'invitation' && (
        <>
          <Text style={styles.secondaryText}>
            Invite someone using the public address on their civic ID. They will see the invitation on their home screen and choose whether
            to join.
          </Text>
          <WorkspaceField
            label="Civic address"
            value={fields.address}
            onChangeText={value => change({ address: value })}
            maxLength={50}
            editable={!disabled}
            placeholder="Marscoin civic address"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        </>
      )}
      {kind === 'task' && (
        <>
          <WorkspaceField
            label="Task title"
            value={fields.title}
            onChangeText={title => change({ title })}
            maxLength={160}
            editable={!disabled}
            placeholder="What needs to be done?"
          />
          <WorkspaceField
            label="Details · optional"
            value={fields.details}
            onChangeText={details => change({ details })}
            maxLength={5000}
            multiline
            editable={!disabled}
            placeholder="What would help someone take this on?"
          />
          <MemberPicker
            members={groupResource.data?.members || []}
            value={fields.assigned_to}
            onChange={assigned_to => change({ assigned_to })}
            disabled={disabled}
          />
          <WorkspaceField
            label="Due date · optional"
            value={fields.due_date}
            onChangeText={due_date => change({ due_date })}
            maxLength={10}
            editable={!disabled}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <View style={styles.row}>
            {[
              [0, 'Today'],
              [1, 'Tomorrow'],
              [7, 'In a week'],
            ].map(([days, title]) => (
              <SmallAction key={days} title={title} disabled={disabled} onPress={() => change({ due_date: localDateAfter(days) })} />
            ))}
            {!!fields.due_date && <SmallAction title="Clear" disabled={disabled} onPress={() => change({ due_date: '' })} />}
          </View>
        </>
      )}
      {kind === 'record' && (
        <>
          <WorkspaceField
            label="What happened?"
            value={fields.body}
            onChangeText={body => change({ body })}
            maxLength={5000}
            multiline
            editable={!disabled}
            placeholder="An observation, a decision, or the outcome of your work."
          />
          <DraftPhotos
            address={address}
            photos={fields.photos}
            onChange={photos => change({ photos })}
            disabled={disabled}
            onBusy={setPhotoBusy}
          />
          <Text style={styles.secondaryText}>
            Your name and the time will accompany this record. Add a follow-up record if something changes later.
          </Text>
        </>
      )}
      <Text style={styles.caption}>
        {draft.pending
          ? 'SAVED CHANGE'
          : draft.saving
            ? 'Saving on this phone…'
            : draft.saved
              ? 'Saved on this phone'
              : 'Your draft will be saved on this phone as you write.'}
      </Text>
      {draft.pending && draft.pending.status !== 'pending' ? (
        <CivicButton title="Review draft" secondary onPress={review} disabled={busy} />
      ) : (
        <CivicButton
          title={busy ? 'Saving…' : draft.pending ? 'Retry saved change' : buttons[kind] || 'Save'}
          onPress={submit}
          disabled={!address || !draft.ready || busy || photoBusy || !!group?.archived_at}
        />
      )}
      {draft.pending?.status !== 'pending' && <SmallAction title="Discard draft" disabled={busy || photoBusy} danger onPress={discard} />}
    </WorkspaceScreen>
  );
}
