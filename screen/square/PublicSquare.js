import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const API_BASE = 'https://martianrepublic.org/api';

const TABS = [
  { key: 'feed', label: 'Feed' },
  { key: 'congress', label: 'Congress' },
  { key: 'citizens', label: 'Citizens' },
];

// Format relative time like "2h", "3d", "1w"
const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;
  return `${Math.floor(weeks / 52)}y`;
};

// Truncate address for display
const shortAddr = (addr) => {
  if (!addr) return '';
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
};

// ─── Post Card (X.com style) ───────────────────────────────────
const PostCard = ({ item, onPress, onProfile, type }) => {
  const isSigned = !!item.txid;
  const isProposal = type === 'proposal';

  return (
    <TouchableOpacity style={styles.postCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.postRow}>
        {/* Avatar */}
        <TouchableOpacity onPress={onProfile}>
          {item.avatar_link ? (
            <Image source={{ uri: item.avatar_link }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <MaterialCommunityIcons name="account" size={20} color="#666" />
            </View>
          )}
        </TouchableOpacity>

        {/* Content */}
        <View style={styles.postContent}>
          {/* Header: name + handle + time */}
          <View style={styles.postHeader}>
            <Text style={styles.postName} numberOfLines={1}>
              {item.displayname || item.fullname || 'Citizen'}
            </Text>
            {item.citizen === 1 && (
              <MaterialCommunityIcons name="check-decagram" size={14} color="#FF7400" style={{ marginLeft: 3 }} />
            )}
            <Text style={styles.postHandle} numberOfLines={1}>
              {shortAddr(item.address || item.public_address)}
            </Text>
            <Text style={styles.postDot}>·</Text>
            <Text style={styles.postTime}>{timeAgo(item.created_at || item.mined)}</Text>
          </View>

          {/* Proposal tier badge */}
          {isProposal && item.tier && (
            <View style={[styles.tierBadge, { backgroundColor: item.tier_color || '#FF7400' }]}>
              <Text style={styles.tierBadgeText}>{item.tier_label || item.tier} PROPOSAL</Text>
            </View>
          )}

          {/* Title for proposals/threads */}
          {(item.title) && (
            <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>
          )}

          {/* Body text */}
          <Text style={styles.postBody} numberOfLines={isProposal ? 4 : 6}>
            {item.message || item.content || item.description || ''}
          </Text>

          {/* Vote bar for proposals */}
          {isProposal && item.total_votes > 0 && (
            <View style={styles.voteBarContainer}>
              <View style={styles.voteBarTrack}>
                {item.yays > 0 && <View style={[styles.voteBarYay, { flex: item.yays }]} />}
                {item.nays > 0 && <View style={[styles.voteBarNay, { flex: item.nays }]} />}
              </View>
              <Text style={styles.voteBarLabel}>
                {item.yays} Yes · {item.nays} No · {item.total_votes} votes
              </Text>
            </View>
          )}

          {/* Action bar */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionBtn}>
              <MaterialCommunityIcons name="comment-outline" size={16} color="#555" />
              <Text style={styles.actionCount}>{item.reply_count || item.post_count || ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <MaterialCommunityIcons name="repeat-variant" size={16} color="#555" />
              <Text style={styles.actionCount}></Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <MaterialCommunityIcons name="hand-okay" size={16} color="#555" />
              <Text style={styles.actionCount}></Text>
            </TouchableOpacity>
            {isSigned && (
              <View style={styles.signedBadge}>
                <MaterialCommunityIcons name="link-lock" size={12} color="#FF7400" />
                <Text style={styles.signedText}>signed</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Citizen Card (compact) ────────────────────────────────────
const CitizenCard = ({ item, onPress }) => (
  <TouchableOpacity style={styles.citizenCard} onPress={onPress} activeOpacity={0.7}>
    {item.avatar_link ? (
      <Image source={{ uri: item.avatar_link }} style={styles.citizenAvatar} />
    ) : (
      <View style={[styles.citizenAvatar, styles.avatarPlaceholder]}>
        <MaterialCommunityIcons name="account" size={24} color="#666" />
      </View>
    )}
    <View style={styles.citizenInfo}>
      <View style={styles.citizenNameRow}>
        <Text style={styles.citizenName}>{item.displayname || item.fullname}</Text>
        {item.citizen === 1 && (
          <MaterialCommunityIcons name="check-decagram" size={14} color="#FF7400" style={{ marginLeft: 4 }} />
        )}
      </View>
      <Text style={styles.citizenHandle}>{shortAddr(item.address || item.public_address)}</Text>
      {item.shortbio ? (
        <Text style={styles.citizenBio} numberOfLines={2}>{item.shortbio}</Text>
      ) : null}
    </View>
    {item.endorse_cnt > 0 && (
      <View style={styles.endorseCount}>
        <Text style={styles.endorseNumber}>{item.endorse_cnt}</Text>
        <Text style={styles.endorseLabel}>endorsements</Text>
      </View>
    )}
  </TouchableOpacity>
);

// ─── Main Screen ───────────────────────────────────────────────
const PublicSquare = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('feed');
  const [feedData, setFeedData] = useState([]);
  const [congressData, setCongressData] = useState([]);
  const [citizenData, setCitizenData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState(null);

  const getToken = async () => {
    const t = await AsyncStorage.getItem('sessionToken');
    setToken(t);
    return t;
  };

  const fetchFeed = useCallback(async () => {
    try {
      const t = token || await getToken();
      const headers = t ? { Authorization: `Bearer ${t}` } : {};

      // Fetch forum threads (Public Square category = 1) and proposals in parallel
      const [forumRes, proposalsRes] = await Promise.all([
        axios.get(`${API_BASE}/forum/category/1/threads`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/congress/proposals?per_page=10`).catch(() => ({ data: { data: [] } })),
      ]);

      const threads = (forumRes.data || []).map(t => ({
        ...t,
        _type: 'thread',
        _sortDate: new Date(t.created_at),
      }));

      const proposals = (proposalsRes.data?.data || []).map(p => ({
        ...p,
        _type: 'proposal',
        _sortDate: new Date(p.created_at),
      }));

      // Merge and sort by date
      const merged = [...threads, ...proposals]
        .sort((a, b) => b._sortDate - a._sortDate);

      setFeedData(merged);
    } catch (e) {
      console.error('[Square] Feed error:', e.message);
    }
  }, [token]);

  const fetchCongress = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/congress/proposals?per_page=50`);
      setCongressData(res.data?.data || []);
    } catch (e) {
      console.error('[Square] Congress error:', e.message);
    }
  }, []);

  const fetchCitizens = useCallback(async () => {
    try {
      const t = token || await getToken();
      const headers = t ? { Authorization: `Bearer ${t}` } : {};
      const res = await axios.get(`${API_BASE}/feed/citizen`, { headers }).catch(() => ({ data: [] }));
      setCitizenData(res.data || []);
    } catch (e) {
      console.error('[Square] Citizens error:', e.message);
    }
  }, [token]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchFeed(), fetchCongress(), fetchCitizens()]);
  }, [fetchFeed, fetchCongress, fetchCitizens]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll().finally(() => setRefreshing(false));
  }, [fetchAll]);

  const onPressPost = (item) => {
    if (item._type === 'proposal') {
      navigation.navigate('ProposalDetail', { proposalId: item.id, title: item.title });
    } else if (item._type === 'thread') {
      navigation.navigate('ForumThreadScreen', { threadId: item.id, title: item.title });
    }
  };

  const onPressCitizen = (item) => {
    navigation.navigate('IndividualCitizenScreen', { address: item.address || item.public_address });
  };

  const renderFeedItem = ({ item }) => (
    <PostCard
      item={item}
      type={item._type}
      onPress={() => onPressPost(item)}
      onProfile={() => onPressCitizen(item)}
    />
  );

  const renderCongressItem = ({ item }) => (
    <PostCard
      item={item}
      type="proposal"
      onPress={() => navigation.navigate('ProposalDetail', { proposalId: item.id, title: item.title })}
      onProfile={() => {}}
    />
  );

  const renderCitizenItem = ({ item }) => (
    <CitizenCard
      item={item}
      onPress={() => onPressCitizen(item)}
    />
  );

  const currentData = activeTab === 'feed' ? feedData : activeTab === 'congress' ? congressData : citizenData;
  const renderItem = activeTab === 'feed' ? renderFeedItem : activeTab === 'congress' ? renderCongressItem : renderCitizenItem;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={require('../../img/icon.png')} style={styles.headerIcon} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {activeTab === tab.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF7400" />
        </View>
      ) : (
        <FlatList
          data={currentData}
          keyExtractor={(item, index) => `${item._type || 'item'}-${item.id}-${index}`}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7400" />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Nothing here yet.</Text>
            </View>
          }
        />
      )}

      {/* Compose via center tab button - context-smart */}
    </SafeAreaView>
  );
};

PublicSquare.navigationOptions = () => ({
  headerShown: false,
});

export default PublicSquare;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Header
  header: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: {
    fontSize: 15,
    fontFamily: 'ChakraPetch-SemiBold',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: 40,
    borderRadius: 2,
    backgroundColor: '#FF7400',
  },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // List
  list: {
    paddingBottom: 100,
  },
  // Post card
  postCard: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  postRow: {
    flexDirection: 'row',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postContent: {
    flex: 1,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  postName: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-Bold',
    color: '#fff',
    flexShrink: 1,
  },
  postHandle: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
    marginLeft: 4,
    flexShrink: 1,
  },
  postDot: {
    fontSize: 13,
    color: '#555',
    marginHorizontal: 4,
  },
  postTime: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
  },
  // Tier badge
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  tierBadgeText: {
    fontSize: 10,
    fontFamily: 'ChakraPetch-Bold',
    color: '#000',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Post content
  postTitle: {
    fontSize: 16,
    fontFamily: 'ChakraPetch-Bold',
    color: '#fff',
    marginTop: 4,
    marginBottom: 2,
  },
  postBody: {
    fontSize: 14,
    fontFamily: 'ChakraPetch-Regular',
    color: '#ccc',
    lineHeight: 20,
    marginTop: 4,
  },
  // Vote bar
  voteBarContainer: {
    marginTop: 10,
  },
  voteBarTrack: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  voteBarYay: { backgroundColor: '#34d399' },
  voteBarNay: { backgroundColor: '#c84125' },
  voteBarLabel: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
    marginTop: 4,
  },
  // Action bar
  actionBar: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  actionCount: {
    fontSize: 12,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
    marginLeft: 4,
  },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  signedText: {
    fontSize: 11,
    fontFamily: 'ChakraPetch-Medium',
    color: '#FF7400',
    marginLeft: 3,
  },
  // Citizen card
  citizenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  citizenAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  citizenInfo: {
    flex: 1,
  },
  citizenNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  citizenName: {
    fontSize: 15,
    fontFamily: 'ChakraPetch-Bold',
    color: '#fff',
  },
  citizenHandle: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
    marginTop: 1,
  },
  citizenBio: {
    fontSize: 13,
    fontFamily: 'ChakraPetch-Regular',
    color: '#999',
    marginTop: 4,
  },
  endorseCount: {
    alignItems: 'center',
    marginLeft: 8,
  },
  endorseNumber: {
    fontSize: 16,
    fontFamily: 'ChakraPetch-Bold',
    color: '#FF7400',
  },
  endorseLabel: {
    fontSize: 9,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
  },
  // Empty
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'ChakraPetch-Regular',
    color: '#555',
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF7400',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF7400',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
