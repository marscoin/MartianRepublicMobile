import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
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

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const ProposalDetail = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { proposalId } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await axios.get(`${GOVERNANCE_API}/proposals/${proposalId}`);
        setData(res.data);
      } catch (e) {
        console.error('[Congress] Error fetching proposal:', e.message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [proposalId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF7400" />
      </View>
    );
  }

  if (!data?.proposal) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Proposal not found.</Text>
      </View>
    );
  }

  const { proposal, proposer, challenges } = data;
  const tierColor = tierColors[proposal.tier] || '#888';
  const tierConfig = proposal.tier_config || {};
  const phase = phaseLabels[proposal.phase] || proposal.phase;
  const totalVotes = proposal.total_votes || 0;
  const yayPct = totalVotes > 0 ? Math.round((proposal.yays / totalVotes) * 100) : 0;
  const nayPct = totalVotes > 0 ? Math.round((proposal.nays / totalVotes) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={[styles.tierStrip, { backgroundColor: tierColor }]}>
        <Text style={styles.tierStripText}>{tierConfig.label} Proposal — MR-{proposal.id}</Text>
      </View>

      <Text style={styles.title}>{proposal.title}</Text>

      <View style={styles.phaseRow}>
        <Text style={[styles.phasePill, { color: tierColor }]}>{phase}</Text>
        {tierConfig.binding && <Text style={styles.bindingLabel}>Binding</Text>}
      </View>

      {/* Proposer */}
      {proposer && (
        <View style={styles.proposerRow}>
          {proposer.avatar_link ? (
            <Image source={{ uri: proposer.avatar_link }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View>
            <Text style={styles.proposerName}>{proposer.displayname || `${proposer.firstname} ${proposer.lastname}`}</Text>
            <Text style={styles.proposerDate}>{formatDate(proposal.created_at)}</Text>
          </View>
        </View>
      )}

      {/* Vote tally */}
      <View style={styles.voteSection}>
        <Text style={styles.sectionTitle}>Vote Tally</Text>
        <View style={styles.voteBarTrack}>
          {proposal.yays > 0 && <View style={[styles.voteBarYay, { flex: proposal.yays }]} />}
          {proposal.nays > 0 && <View style={[styles.voteBarNay, { flex: proposal.nays }]} />}
          {totalVotes === 0 && <View style={{ flex: 1 }} />}
        </View>
        <View style={styles.voteNumbers}>
          <Text style={styles.voteYay}>{yayPct}% Yes ({proposal.yays})</Text>
          <Text style={styles.voteNay}>{nayPct}% No ({proposal.nays})</Text>
        </View>
        <View style={styles.thresholdRow}>
          <Text style={styles.thresholdText}>
            Threshold: {tierConfig.threshold}% · {totalVotes} total votes
          </Text>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <View style={styles.timelineGrid}>
          <TimelineItem label="Created" date={proposal.created_at} />
          <TimelineItem label="Screening ends" date={proposal.screening_ends_at} />
          <TimelineItem label="Voting ends" date={proposal.voting_ends_at} />
          <TimelineItem label="Timelock ends" date={proposal.timelock_ends_at} />
          {proposal.sunset_at && <TimelineItem label="Sunset" date={proposal.sunset_at} />}
        </View>
      </View>

      {/* Tier details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Governance Tier</Text>
        <View style={styles.tierDetails}>
          <TierDetail label="Quorum" value={`${tierConfig.quorum_percent}%`} />
          <TierDetail label="Threshold" value={`${tierConfig.threshold}%`} />
          <TierDetail label="Voting period" value={`${tierConfig.duration_sols} sols`} />
          <TierDetail label="Timelock" value={tierConfig.timelock_sols > 0 ? `${tierConfig.timelock_sols} sols` : 'None'} />
          <TierDetail label="CoinShuffle" value={tierConfig.coinshuffle ? 'Yes' : 'No'} />
        </View>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{proposal.description}</Text>
      </View>

      {/* Challenges */}
      {challenges && challenges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tier Challenges</Text>
          {challenges.map((c, i) => (
            <View key={i} style={styles.challengeCard}>
              <Text style={styles.challengeText}>
                {c.current_tier} → {c.proposed_tier} ({c.status})
              </Text>
              <Text style={styles.challengeReason}>{c.reason}</Text>
            </View>
          ))}
        </View>
      )}

      {/* IPFS link */}
      {proposal.ipfs_hash && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>On-Chain Record</Text>
          <Text style={styles.ipfsText} numberOfLines={2}>{proposal.ipfs_hash}</Text>
          {proposal.txid && (
            <Text style={styles.ipfsText} numberOfLines={1}>TX: {proposal.txid}</Text>
          )}
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
};

const TimelineItem = ({ label, date }) => (
  <View style={styles.timelineItem}>
    <Text style={styles.timelineLabel}>{label}</Text>
    <Text style={styles.timelineDate}>{formatDate(date)}</Text>
  </View>
);

const TierDetail = ({ label, value }) => (
  <View style={styles.tierDetailRow}>
    <Text style={styles.tierDetailLabel}>{label}</Text>
    <Text style={styles.tierDetailValue}>{value}</Text>
  </View>
);

ProposalDetail.navigationOptions = () => ({
  headerShown: false,
});

export default ProposalDetail;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#888',
    fontSize: 16,
    fontFamily: 'ChakraPetch-Regular',
  },
  backButton: {
    paddingTop: 60,
    paddingBottom: 12,
  },
  backText: {
    fontSize: 16,
    fontFamily: 'ChakraPetch-Medium',
    color: '#FF7400',
  },
  tierStrip: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  tierStripText: {
    fontSize: 12,
    fontFamily: 'ChakraPetch-Bold',
    color: '#000',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontFamily: 'ChakraPetch-Bold',
    color: '#fff',
    marginBottom: 8,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  phasePill: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-SemiBold',
  },
  bindingLabel: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Medium',
    color: '#888',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  // Proposer
  proposerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: '#333',
  },
  proposerName: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-SemiBold',
    color: '#fff',
  },
  proposerDate: {
    fontSize: 12,
    fontFamily: 'ChakraPetch-Regular',
    color: '#666',
  },
  // Votes
  voteSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  voteBarTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#333',
    marginBottom: 8,
  },
  voteBarYay: {
    backgroundColor: '#34d399',
  },
  voteBarNay: {
    backgroundColor: '#c84125',
  },
  voteNumbers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  voteYay: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-Bold',
    color: '#34d399',
  },
  voteNay: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-Bold',
    color: '#c84125',
  },
  thresholdRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 8,
  },
  thresholdText: {
    fontSize: 12,
    fontFamily: 'ChakraPetch-Regular',
    color: '#888',
  },
  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'ChakraPetch-Bold',
    color: '#FF7400',
    marginBottom: 10,
  },
  // Timeline
  timelineGrid: {},
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  timelineLabel: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Regular',
    color: '#888',
  },
  timelineDate: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Medium',
    color: '#fff',
  },
  // Tier details
  tierDetails: {},
  tierDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tierDetailLabel: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Regular',
    color: '#888',
  },
  tierDetailValue: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-SemiBold',
    color: '#fff',
  },
  // Description
  description: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-Regular',
    color: '#ccc',
    lineHeight: 22,
  },
  // Challenges
  challengeCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  challengeText: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-SemiBold',
    color: '#f59e0b',
  },
  challengeReason: {
    fontSize: 12,
    fontFamily: 'ChakraPetch-Regular',
    color: '#888',
    marginTop: 4,
  },
  // IPFS
  ipfsText: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
    marginBottom: 4,
  },
});
