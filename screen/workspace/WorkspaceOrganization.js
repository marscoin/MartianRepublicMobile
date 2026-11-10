import { marsAlert } from '../../components/MarsDialog';
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCivicSession } from '../../blue_modules/civic-api';
import { assertWorkspaceIdentity, workspaceRequest, workspaceStore } from '../../blue_modules/workspace-api';
import { useWorkspaceData } from '../../blue_modules/workspace-hooks';
import { CivicButton } from '../../components/CivicUi';
import {
  ActivityCard,
  ResourceStatus,
  SectionHeading,
  SmallAction,
  TaskCard,
  WorkspaceNotice,
  WorkspaceScreen,
  styles,
} from './WorkspaceUi';

export default function WorkspaceOrganization() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const organizationId = params.organizationId;
  const { address } = useCivicSession();
  const [section, setSection] = useState(params.section || 'tasks');
  const [filter, setFilter] = useState('open');
  const resource = useWorkspaceData(address, `organization:${organizationId}`, `/organizations/${organizationId}`);
  const taskResource = useWorkspaceData(
    address,
    `tasks:${organizationId}:${filter}`,
    `/organizations/${organizationId}/tasks?status=${filter}`,
  );
  const activityResource = useWorkspaceData(address, `activity:${organizationId}`, `/organizations/${organizationId}/activity`);
  const [taskList, setTaskList] = useState({});
  const [activityList, setActivityList] = useState({});
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (params.section) setSection(params.section);
  }, [params.section]);
  useEffect(() => {
    setTaskList({
      address,
      organizationId,
      filter,
      items: taskResource.data?.data || [],
      next: taskResource.data?.next_page,
    });
  }, [address, organizationId, filter, taskResource.data]);
  useEffect(() => {
    setActivityList({
      address,
      organizationId,
      items: activityResource.data?.data || [],
      next: activityResource.data?.next_cursor,
    });
  }, [address, organizationId, activityResource.data]);
  const tasks = taskList.address === address && taskList.organizationId === organizationId && taskList.filter === filter ? taskList : {};
  const activity = activityList.address === address && activityList.organizationId === organizationId ? activityList : {};
  const group = resource.data?.organization;
  const members = resource.data?.members || [];
  const identity = members.find(member => member.address === address);
  const owner = group?.role === 'owner';
  const archived = !!group?.archived_at;
  const refresh = async () => {
    await Promise.all([resource.refresh(), taskResource.refresh(), activityResource.refresh()]);
  };
  const more = async type => {
    if (busy) return;
    const list = type === 'tasks' ? tasks : activity;
    if (!list.next) return;
    setBusy('more');
    try {
      const path =
        type === 'tasks'
          ? `/organizations/${organizationId}/tasks?status=${filter}&page=${list.next}`
          : `/organizations/${organizationId}/activity?before=${list.next}`;
      const result = await workspaceRequest(address, { path });
      assertWorkspaceIdentity(address);
      const setter = type === 'tasks' ? setTaskList : setActivityList;
      setter(previous => {
        if (previous.address !== address || previous.organizationId !== organizationId || (type === 'tasks' && previous.filter !== filter))
          return previous;
        return {
          ...previous,
          items: [...new Map([...(previous.items || []), ...result.data].map(item => [item.id, item])).values()],
          next: result.next_page || result.next_cursor,
        };
      });
    } catch (error) {
      marsAlert('Could not load more', error.message);
    } finally {
      setBusy('');
    }
  };
  const mutate = async (key, path, label) => {
    if (busy) return;
    setBusy(key);
    try {
      await workspaceStore.submit(address, key, {
        method: 'POST',
        path,
        data: {},
        label,
      });
      assertWorkspaceIdentity(address);
      if (key.startsWith('leave:')) navigation.goBack();
      else await refresh();
    } catch (error) {
      marsAlert('Could not save change', error.message);
    } finally {
      setBusy('');
    }
  };
  const remove = member =>
    marsAlert(
      member.status === 'invited' ? 'Cancel this invitation?' : `Remove ${member.name}?`,
      'They will no longer have access to this organization. Open tasks assigned to them will become unassigned.',
      [
        { text: 'Keep member', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            mutate(
              `remove:${organizationId}:${member.id}`,
              `/organizations/${organizationId}/members/${member.id}/remove`,
              `Remove ${member.name} from ${group.name}`,
            ),
        },
      ],
    );
  const archive = () =>
    marsAlert('Archive this organization?', 'Members will still be able to read its records. New tasks and records will be paused.', [
      { text: 'Keep active', style: 'cancel' },
      {
        text: 'Archive',
        onPress: () => mutate(`archive:${organizationId}`, `/organizations/${organizationId}/archive`, `Archive ${group.name}`),
      },
    ]);
  const leave = () =>
    marsAlert('Leave this organization?', 'You will lose access to its tasks and records until you are invited again.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          mutate(`leave:${organizationId}`, `/organizations/${organizationId}/members/${identity.id}/remove`, `Leave ${group.name}`),
      },
    ]);
  const footer =
    section === 'activity' && activity.next ? (
      <SmallAction title={busy === 'more' ? 'Loading…' : 'Earlier records'} disabled={!!busy} onPress={() => more('activity')} />
    ) : null;
  return (
    <WorkspaceScreen
      title={group?.name || 'Your organization'}
      eyebrow="MCR / SHARED WORK"
      refreshing={!!resource.loading && !!group}
      onRefresh={refresh}
      listItems={section === 'activity' && group ? activity.items || [] : undefined}
      renderListItem={item => <ActivityCard activity={item} address={address} />}
      listFooter={footer}
    >
      <ResourceStatus resource={resource} />
      {group && (
        <>
          {!!group.description && <Text style={styles.secondaryText}>{group.description}</Text>}
          <Text style={styles.caption}>
            {group.member_count} {group.member_count === 1 ? 'MEMBER' : 'MEMBERS'} · PRIVATE TO MEMBERS
          </Text>
          {archived && <WorkspaceNotice>This organization is archived. Its records remain available.</WorkspaceNotice>}
          <View style={styles.row}>
            {[
              ['tasks', 'Tasks'],
              ['activity', 'Activity log'],
              ['members', 'Members'],
            ].map(([value, label]) => (
              <TouchableOpacity
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: section === value }}
                onPress={() => setSection(value)}
                style={[styles.choice, section === value && styles.choiceSelected]}
              >
                <Text style={styles.choiceLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {section === 'tasks' && (
            <>
              {!archived && (
                <CivicButton
                  title="Add a task"
                  icon="plus"
                  onPress={() =>
                    navigation.navigate('WorkspaceCompose', {
                      kind: 'task',
                      organizationId,
                    })
                  }
                />
              )}
              <View style={styles.row}>
                {['open', 'done'].map(value => (
                  <SmallAction
                    key={value}
                    title={value === 'open' ? 'Open tasks' : 'Completed'}
                    icon={filter === value ? 'check' : undefined}
                    onPress={() => setFilter(value)}
                  />
                ))}
              </View>
              <ResourceStatus resource={taskResource} />
              {taskResource.data && !tasks.items?.length && (
                <View style={styles.empty}>
                  <Text style={styles.body}>{filter === 'open' ? 'A clear place to start.' : 'Completed work will appear here.'}</Text>
                  <Text style={styles.secondaryText}>
                    {filter === 'open'
                      ? 'Add the first task, give it an owner, and keep the outcome with the work.'
                      : 'Each completion also leaves a dated entry in the activity log.'}
                  </Text>
                </View>
              )}
              {(tasks.items || []).map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assignee={members.find(member => member.id === task.assigned_to)?.name}
                  onPress={() =>
                    navigation.navigate('WorkspaceTask', {
                      identityAddress: address,
                      organizationId,
                      taskId: task.id,
                      task,
                    })
                  }
                />
              ))}
              {!!tasks.next && (
                <SmallAction title={busy === 'more' ? 'Loading…' : 'Load more tasks'} disabled={!!busy} onPress={() => more('tasks')} />
              )}
            </>
          )}
          {section === 'activity' && (
            <>
              {!archived && (
                <CivicButton
                  title="Add a record"
                  icon="edit-3"
                  onPress={() =>
                    navigation.navigate('WorkspaceCompose', {
                      kind: 'record',
                      organizationId,
                    })
                  }
                />
              )}
              <Text style={styles.secondaryText}>A shared memory of the work. Add observations, decisions, and photos as they happen.</Text>
              <ResourceStatus resource={activityResource} />
              {activityResource.data && !activity.items?.length && <Text style={styles.secondaryText}>Your first record starts here.</Text>}
            </>
          )}
          {section === 'members' && (
            <>
              {owner && !archived && (
                <CivicButton
                  title="Invite a member"
                  icon="user-plus"
                  onPress={() =>
                    navigation.navigate('WorkspaceCompose', {
                      kind: 'invitation',
                      organizationId,
                    })
                  }
                />
              )}
              <SectionHeading title="People in this organization" />
              {members.map(member => (
                <View key={member.id} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {member.name}
                    {member.address === address ? ' · You' : ''}
                  </Text>
                  <Text style={styles.caption}>
                    {member.status === 'invited' ? 'INVITED · AWAITING ACCEPTANCE' : member.role.toUpperCase()}
                  </Text>
                  {!!member.address && (
                    <Text selectable style={styles.caption}>
                      {member.address}
                    </Text>
                  )}
                  {owner && member.role !== 'owner' && !archived && (
                    <SmallAction
                      title={member.status === 'invited' ? 'Cancel invitation' : 'Remove member'}
                      danger
                      disabled={!!busy}
                      onPress={() => remove(member)}
                    />
                  )}
                </View>
              ))}
              {owner && !archived && <SmallAction title="Archive organization" disabled={!!busy} onPress={archive} />}
              {!owner && identity && !archived && <SmallAction title="Leave organization" danger disabled={!!busy} onPress={leave} />}
            </>
          )}
        </>
      )}
    </WorkspaceScreen>
  );
}
