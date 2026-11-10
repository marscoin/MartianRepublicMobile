import React, { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { useCivicSession } from '../../blue_modules/civic-api';
import { readCitizenshipDraft } from '../../blue_modules/citizenship-draft';
import { assertWorkspaceIdentity, workspaceStore } from '../../blue_modules/workspace-api';
import { useWorkspaceData } from '../../blue_modules/workspace-hooks';
import { CivicButton, civicColors } from '../../components/CivicUi';
import {
  OrganizationCard,
  ResourceStatus,
  SectionHeading,
  SmallAction,
  TaskCard,
  WorkspaceNotice,
  WorkspaceScreen,
  styles,
} from './WorkspaceUi';

export default function CivicHome() {
  const navigation = useNavigation();
  const { address } = useCivicSession();
  const resource = useWorkspaceData(address, 'home', '/workspace');
  const refresh = resource.refresh;
  const [local, setLocal] = useState({});
  const [busy, setBusy] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const loadLocal = useCallback(async () => {
    if (!address) return;
    try {
      const [workspace, application] = await Promise.all([workspaceStore.read(address), readCitizenshipDraft(address)]);
      setLocal({ address, workspace, application });
    } catch (error) {
      setLocal({ address, error: error.message });
    }
  }, [address]);
  useFocusEffect(
    useCallback(() => {
      loadLocal();
      setImageFailed(false);
      if (!address) return;
      return workspaceStore.subscribe(address, event => {
        loadLocal();
        if (event === 'submitted') refresh();
      });
    }, [address, loadLocal, refresh]),
  );
  const data = resource.data;
  const identity = data?.identity;
  const currentLocal = local.address === address ? local : {};
  const savedCount = new Set([...Object.keys(currentLocal.workspace?.drafts || {}), ...Object.keys(currentLocal.workspace?.pending || {})])
    .size;
  const application = currentLocal.application;
  const status = data?.citizenship?.status;
  const publicationWaiting = status === 'new' && ['pending', 'submitted'].includes(application?.publication?.status);
  const name = identity?.name && identity.name !== 'UserWithoutWallet' ? identity.name : 'Fellow Martian';
  const openID = () =>
    navigation.navigate('CivicIDScreen', {
      user: {
        citizen: {
          public_address: identity?.address || address,
          firstname: identity?.first_name || name,
          lastname: identity?.last_name,
          avatar_link: identity?.avatar,
          created_at: identity?.registered_at,
        },
      },
    });
  const respond = async (invite, accept) => {
    if (busy) return;
    setBusy(invite.organization_id);
    try {
      await workspaceStore.submit(address, `invitation-response:${invite.organization_id}`, {
        method: 'POST',
        path: `/organizations/${invite.organization_id}/invitations/respond`,
        data: { accept },
        label: `${accept ? 'Join' : 'Decline'} ${invite.name}`,
      });
      await resource.refresh();
      assertWorkspaceIdentity(address);
      if (accept)
        navigation.navigate('WorkspaceOrganization', {
          organizationId: invite.organization_id,
        });
    } catch (error) {
      Alert.alert('Invitation saved', error.message);
    } finally {
      setBusy('');
      loadLocal();
    }
  };
  const nextStep = !data?.citizenship?.terms_accepted
    ? {
        title: 'Welcome to the Republic.',
        body: 'Review the community terms, meet your fellow Martians, and make your first introduction.',
        action: 'Open the community',
        route: 'CitizenScreen',
      }
    : publicationWaiting || status === 'submitted'
      ? {
          title: application?.publication?.status === 'pending' ? 'Your submission is saved.' : 'Your introduction is on its way.',
          body:
            application?.publication?.status === 'pending'
              ? 'The network has not confirmed receipt. Continue your application to retry the saved transaction.'
              : 'Your application is awaiting confirmation or processing. You can explore the community while it arrives.',
          action: application?.publication?.status === 'pending' ? 'Continue application' : 'Meet the community',
          route: application?.publication?.status === 'pending' ? 'JoinGeneralPublicApplicationScreen' : 'CitizenScreen',
        }
      : status === 'new'
        ? {
            title: 'Introduce yourself.',
            body: 'Add your name, a photo, and a short introduction to begin your civic journey.',
            action: 'Continue application',
            route: 'JoinGeneralPublicApplicationScreen',
          }
        : status === 'public_member'
          ? {
              title: 'Let the community get to know you.',
              body: `You have ${data.citizenship.endorsements} endorsements. Join the conversation and build connections with fellow Martians.`,
              action: 'Visit the forum',
              route: 'PublicSquare',
            }
          : null;

  return (
    <WorkspaceScreen
      title="At home in the Republic."
      eyebrow="MCR / CIVIC HOME"
      back={false}
      onRefresh={() => {
        resource.refresh();
        loadLocal();
      }}
      refreshing={!!resource.loading && !!data}
    >
      {!address ? (
        <View style={styles.empty}>
          <Text style={styles.body}>Bring your civic identity, meet your community, and start building together.</Text>
          <CivicButton title="Find your place" onPress={() => navigation.navigate('CitizenScreen')} icon="arrow-right" />
        </View>
      ) : (
        <>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open your civic ID" onPress={openID} style={home.identity}>
            <View style={home.identityTop}>
              <Text style={home.identityLabel}>CIVIC IDENTITY</Text>
              <Icon name="credit-card" type="feather" size={22} color="#242222" />
            </View>
            <View style={home.identityRow}>
              <Image
                style={home.portrait}
                source={!imageFailed && identity?.avatar ? { uri: identity.avatar } : require('../../img/genericprofile.png')}
                onError={() => setImageFailed(true)}
              />
              <View style={styles.flex}>
                <Text style={home.name}>{name}</Text>
                <Text style={home.identityStatus}>
                  {status === 'citizen' ? 'CITIZEN' : status === 'public_member' ? 'PUBLIC MEMBER' : 'YOUR REPUBLIC IDENTITY'}
                </Text>
              </View>
            </View>
            <Text numberOfLines={1} style={home.address}>
              {address}
            </Text>
          </TouchableOpacity>
          <ResourceStatus resource={resource} />
          {currentLocal.error && <WorkspaceNotice error>{currentLocal.error}</WorkspaceNotice>}
          {savedCount > 0 && (
            <WorkspaceNotice action="Open saved work" onPress={() => navigation.navigate('WorkspaceDrafts')}>
              {savedCount} {savedCount === 1 ? 'draft or saved change' : 'drafts and saved changes'} on this phone.
            </WorkspaceNotice>
          )}
          {nextStep && data && (
            <View style={home.nextStep}>
              <Text style={styles.cardTitle}>{nextStep.title}</Text>
              <Text style={styles.secondaryText}>{nextStep.body}</Text>
              <SmallAction title={nextStep.action} icon="arrow-right" onPress={() => navigation.navigate(nextStep.route)} />
            </View>
          )}
          {(data?.invitations || []).map(invite => (
            <View key={invite.organization_id} style={styles.card}>
              <Text style={styles.caption}>INVITATION FROM {invite.invited_by?.name || 'A FELLOW MARTIAN'}</Text>
              <Text style={styles.cardTitle}>{invite.name}</Text>
              {!!invite.description && <Text style={styles.secondaryText}>{invite.description}</Text>}
              <CivicButton
                title={busy === invite.organization_id ? 'Saving…' : 'Join organization'}
                disabled={!!busy}
                onPress={() => respond(invite, true)}
                icon="users"
              />
              <SmallAction title="Decline invitation" disabled={!!busy} onPress={() => respond(invite, false)} />
            </View>
          ))}
          {!!data?.tasks?.length && (
            <>
              <SectionHeading title="Your next actions" />
              {data.tasks.slice(0, 6).map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onPress={() =>
                    navigation.navigate('WorkspaceTask', {
                      identityAddress: address,
                      organizationId: task.organization_id,
                      taskId: task.id,
                      task,
                    })
                  }
                />
              ))}
            </>
          )}
          <SectionHeading title="Your organizations" action="See all" onPress={() => navigation.navigate('WorkspaceOrganizations')} />
          {(data?.organizations || []).slice(0, 3).map(group => (
            <OrganizationCard
              key={group.id}
              organization={group}
              onPress={() =>
                navigation.navigate('WorkspaceOrganization', {
                  organizationId: group.id,
                })
              }
            />
          ))}
          {data && !data.organizations.length && (
            <View style={styles.empty}>
              <Text style={styles.body}>Start with the people and work that matter to you.</Text>
              <Text style={styles.secondaryText}>Create a group, share tasks, and keep a record of what you accomplish together.</Text>
            </View>
          )}
          <CivicButton
            title="Create an organization"
            icon="plus"
            secondary={!!data?.organizations?.length}
            onPress={() => navigation.navigate('WorkspaceCompose', { kind: 'organization' })}
          />
        </>
      )}
      <SectionHeading title="Around the Republic" />
      <View style={styles.card}>
        <SmallAction title="Meet the community" icon="users" onPress={() => navigation.navigate('CitizenScreen')} />
        <SmallAction title="Public square" icon="message-circle" onPress={() => navigation.navigate('PublicSquare')} />
        <SmallAction title="Congress and voting" icon="file-text" onPress={() => navigation.navigate('Proposals')} />
        <SmallAction title="Get Marscoin with Bitcoin" icon="repeat" onPress={() => navigation.navigate('SwapHome')} />
      </View>
    </WorkspaceScreen>
  );
}

const home = StyleSheet.create({
  identity: {
    backgroundColor: '#EAE2D5',
    borderRadius: 18,
    padding: 22,
    gap: 18,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identityLabel: {
    color: '#5A534C',
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 11,
    letterSpacing: 2,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  portrait: {
    width: 62,
    height: 72,
    borderRadius: 9,
    backgroundColor: '#D7CCBE',
  },
  name: {
    color: '#171A1D',
    fontFamily: 'ChakraPetch-Bold',
    fontSize: 24,
    lineHeight: 29,
  },
  identityStatus: {
    color: '#615549',
    fontFamily: 'ChakraPetch-SemiBold',
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 8,
  },
  address: {
    color: '#615549',
    fontFamily: 'ChakraPetch-Regular',
    fontSize: 12,
  },
  nextStep: {
    padding: 20,
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: civicColors.orange,
    backgroundColor: '#171613',
    borderRadius: 12,
  },
});
