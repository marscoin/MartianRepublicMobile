import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';

const GOVERNANCE_API = 'https://martianrepublic.org/api/congress';

const tierColors = {
  signal: '#34d399',
  operational: '#00e4ff',
  legislative: '#f59e0b',
  constitutional: '#c84125',
};

const phaseLabels = {
  screening: 'Screening',
  challenged: 'Challenged',
  voting: 'Voting',
  voting_extended: 'Voting (Extended)',
  timelock: 'Timelock',
  active: 'Active',
  passed: 'Passed',
  rejected: 'Rejected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
  sunset: 'Sunset',
  submitted: 'Submitted',
  draft: 'Draft',
};

const ProposalCard = ({ proposal, onPress }) => {
  const tierColor = tierColors[proposal.tier] || '#888';
  const phase = phaseLabels[proposal.phase] || proposal.phase;
  const isActive = ['screening', 'challenged', 'voting', 'voting_extended', 'timelock'].includes(proposal.phase);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
          <Text style={styles.tierText}>{proposal.tier_label}</Text>
        </View>
        <View style={[styles.phaseBadge, isActive ? styles.phaseActive : styles.phaseInactive]}>
          <Text style={[styles.phaseText, isActive ? styles.phaseTextActive : null]}>{phase}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>{proposal.title}</Text>
      <Text style={styles.author}>by {proposal.author}</Text>

      {proposal.total_votes > 0 && (
        <View style={styles.voteBar}>
          <View style={styles.voteBarTrack}>
            {proposal.yays > 0 && (
              <View style={[styles.voteBarYay, { flex: proposal.yays }]} />
            )}
            {proposal.nays > 0 && (
              <View style={[styles.voteBarNay, { flex: proposal.nays }]} />
            )}
          </View>
          <View style={styles.voteLabels}>
            <Text style={styles.voteYay}>{proposal.yays} Yes</Text>
            <Text style={styles.voteNay}>{proposal.nays} No</Text>
          </View>
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.meta}>{proposal.post_count} comments</Text>
        <Text style={styles.meta}>{proposal.total_votes} votes</Text>
      </View>
    </TouchableOpacity>
  );
};

const StatsHeader = ({ stats }) => {
  if (!stats) return null;
  return (
    <View style={styles.statsContainer}>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.proposals}</Text>
          <Text style={styles.statLabel}>Proposals</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.citizens}</Text>
          <Text style={styles.statLabel}>Citizens</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.passed}</Text>
          <Text style={styles.statLabel}>Passed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.block_height}</Text>
          <Text style={styles.statLabel}>Block</Text>
        </View>
      </View>
    </View>
  );
};

const FilterBar = ({ selected, onSelect }) => {
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'voting', label: 'Voting' },
    { key: 'screening', label: 'Screening' },
    { key: 'passed', label: 'Passed' },
    { key: 'expired', label: 'Expired' },
  ];
  return (
    <View style={styles.filterBar}>
      {filters.map(f => (
        <TouchableOpacity
          key={f.key}
          style={[styles.filterChip, selected === f.key && styles.filterChipActive]}
          onPress={() => onSelect(f.key)}
        >
          <Text style={[styles.filterText, selected === f.key && styles.filterTextActive]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const ProposalsScreen = () => {
  const [proposals, setProposals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const navigation = useNavigation();

  const fetchData = useCallback(async () => {
    try {
      const [proposalsRes, statsRes] = await Promise.all([
        axios.get(`${GOVERNANCE_API}/proposals?per_page=50`),
        axios.get(`${GOVERNANCE_API}/stats`),
      ]);
      const allProposals = proposalsRes.data.data || [];
      const filtered = filter === 'all'
        ? allProposals
        : allProposals.filter(p => p.phase === filter);
      setProposals(filtered);
      setStats(statsRes.data);
    } catch (e) {
      console.error('[Congress] Error fetching proposals:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const onPressProposal = (proposal) => {
    navigation.navigate('ProposalDetail', { proposalId: proposal.id, title: proposal.title });
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF7400" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Congress</Text>
      <StatsHeader stats={stats} />
      <FilterBar selected={filter} onSelect={setFilter} />
      <FlatList
        data={proposals}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <ProposalCard proposal={item} onPress={() => onPressProposal(item)} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7400" />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No proposals found.</Text>
          </View>
        }
      />
    </View>
  );
};

ProposalsScreen.navigationOptions = () => ({
  headerShown: false,
});

export default ProposalsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 34,
    fontFamily: 'ChakraPetch-Bold',
    color: '#fff',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 8,
  },
  // Stats
  statsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 18,
    fontFamily: 'ChakraPetch-Bold',
    color: '#FF7400',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Regular',
    color: '#888',
    marginTop: 2,
  },
  // Filter
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  filterChipActive: {
    backgroundColor: '#FF7400',
    borderColor: '#FF7400',
  },
  filterText: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Medium',
    color: '#888',
  },
  filterTextActive: {
    color: '#000',
  },
  // Cards
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#333',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tierText: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Bold',
    color: '#000',
    textTransform: 'uppercase',
  },
  phaseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  phaseActive: {
    backgroundColor: 'rgba(255, 116, 0, 0.2)',
  },
  phaseInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  phaseText: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Medium',
    color: '#888',
  },
  phaseTextActive: {
    color: '#FF7400',
  },
  title: {
    fontSize: 16,
    fontFamily: 'ChakraPetch-SemiBold',
    color: '#fff',
    marginBottom: 4,
  },
  author: {
    fontSize: 12,
    fontFamily: 'ChakraPetch-Regular',
    color: '#666',
    marginBottom: 10,
  },
  // Vote bar
  voteBar: {
    marginBottom: 8,
  },
  voteBarTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  voteBarYay: {
    backgroundColor: '#34d399',
  },
  voteBarNay: {
    backgroundColor: '#c84125',
  },
  voteLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  voteYay: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Medium',
    color: '#34d399',
  },
  voteNay: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Medium',
    color: '#c84125',
  },
  // Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
  },
  // Empty
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
  },
});
