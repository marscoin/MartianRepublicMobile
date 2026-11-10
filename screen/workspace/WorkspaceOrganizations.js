import React, { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCivicSession } from '../../blue_modules/civic-api';
import { assertWorkspaceIdentity, workspaceRequest } from '../../blue_modules/workspace-api';
import { useWorkspaceData } from '../../blue_modules/workspace-hooks';
import { CivicButton } from '../../components/CivicUi';
import { OrganizationCard, ResourceStatus, SmallAction, WorkspaceScreen, styles } from './WorkspaceUi';

export default function WorkspaceOrganizations() {
  const navigation = useNavigation();
  const { address } = useCivicSession();
  const resource = useWorkspaceData(address, 'organizations', '/organizations');
  const [list, setList] = useState({});
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setList({
      address,
      items: resource.data?.data || [],
      nextPage: resource.data?.next_page,
    });
  }, [address, resource.data]);
  const current = list.address === address ? list : {};
  const more = async () => {
    if (loading || !current.nextPage) return;
    setLoading(true);
    try {
      const result = await workspaceRequest(address, {
        path: `/organizations?page=${current.nextPage}`,
      });
      assertWorkspaceIdentity(address);
      setList(previous => ({
        address,
        items: [...new Map([...(previous.items || []), ...result.data].map(item => [item.id, item])).values()],
        nextPage: result.next_page,
      }));
    } catch (error) {
      Alert.alert('Could not load more', error.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <WorkspaceScreen title="Build something together." onRefresh={resource.refresh} refreshing={!!resource.loading && !!resource.data}>
      <Text style={styles.secondaryText}>Your organizations bring people, tasks, and shared records into one place.</Text>
      <CivicButton
        title="Create an organization"
        icon="plus"
        onPress={() => navigation.navigate('WorkspaceCompose', { kind: 'organization' })}
        disabled={!address}
      />
      <ResourceStatus resource={resource} />
      {(current.items || []).map(organization => (
        <OrganizationCard
          key={organization.id}
          organization={organization}
          onPress={() =>
            navigation.navigate('WorkspaceOrganization', {
              organizationId: organization.id,
            })
          }
        />
      ))}
      {resource.data && !current.items?.length && (
        <Text style={styles.secondaryText}>No organizations yet. Create one, or accept an invitation from your home screen.</Text>
      )}
      {!!current.nextPage && <SmallAction title={loading ? 'Loading…' : 'Load more organizations'} disabled={loading} onPress={more} />}
    </WorkspaceScreen>
  );
}
