import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { Icon } from 'react-native-elements';
import { CivicBack, CivicBrand, civicColors, civicStyles } from '../../components/CivicUi';
import { getCivicToken } from '../../blue_modules/civic-api';
import { assertWorkspaceIdentity, WORKSPACE_ORIGIN } from '../../blue_modules/workspace-api';

export function WorkspaceScreen({
  title,
  eyebrow = 'MARTIAN REPUBLIC / ORGANIZATIONS',
  children,
  back = true,
  refreshing = false,
  onRefresh,
  action,
  listItems,
  renderListItem,
  listFooter,
}) {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const header = (
    <>
      {(back || action) && (
        <View style={styles.rowBetween}>
          {back ? <CivicBack onPress={() => navigation.goBack()} /> : <View />}
          {action}
        </View>
      )}
      <CivicBrand subtitle={eyebrow} />
      <Text accessibilityRole="header" style={civicStyles.title}>
        {title}
      </Text>
      {children}
    </>
  );
  const refresh = onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={civicColors.orange} /> : undefined;
  return (
    <SafeAreaView style={civicStyles.screen} edges={['top', 'left', 'right']}>
      {focused && <StatusBar barStyle="light-content" backgroundColor={civicColors.background} />}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {listItems ? (
          <FlatList
            data={listItems}
            keyExtractor={item => String(item.id)}
            initialNumToRender={5}
            windowSize={5}
            keyboardShouldPersistTaps="handled"
            refreshControl={refresh}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={<View style={styles.content}>{header}</View>}
            renderItem={({ item }) => <View style={styles.listItem}>{renderListItem(item)}</View>}
            ListFooterComponent={listFooter ? <View style={styles.listItem}>{listFooter}</View> : null}
          />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} refreshControl={refresh}>
            {header}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function SmallAction({ title, icon, onPress, disabled = false, danger = false }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.smallAction, disabled && styles.disabled]}
    >
      {icon && <Icon name={icon} type="feather" size={18} color={danger ? '#F4A38A' : civicColors.orange} />}
      <Text style={[styles.actionText, danger && styles.danger]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function WorkspaceNotice({ children, action, onPress, error = false }) {
  return (
    <View style={[styles.notice, error && styles.errorNotice]}>
      <Text style={[styles.secondaryText, error && styles.danger]}>{children}</Text>
      {action && <SmallAction title={action} onPress={onPress} />}
    </View>
  );
}

export function ResourceStatus({ resource }) {
  return (
    <>
      {resource.error && (
        <WorkspaceNotice error action="Try again" onPress={resource.refresh}>
          {resource.error}
          {resource.data ? '\nShowing the last saved view. It may have changed online.' : ''}
        </WorkspaceNotice>
      )}
      {resource.storageError && <WorkspaceNotice error>{resource.storageError}</WorkspaceNotice>}
      {resource.loading && !resource.data && <Text style={styles.secondaryText}>Connecting to the Republic…</Text>}
    </>
  );
}

export function WorkspaceField({ label, value, onChangeText, multiline = false, hint, maxLength, editable = true, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#737C86"
        selectionColor={civicColors.orange}
        style={[styles.input, multiline && styles.multiline, !editable && styles.disabled]}
        value={value || ''}
        onChangeText={onChangeText}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        {...props}
      />
      {hint && <Text style={styles.caption}>{hint}</Text>}
    </View>
  );
}

export function SectionHeading({ title, action, onPress }) {
  return (
    <View style={styles.rowBetween}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {action && <SmallAction title={action} onPress={onPress} />}
    </View>
  );
}

export function OrganizationCard({ organization, onPress }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${organization.name}`} onPress={onPress} style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.iconTile}>
          <Icon name="users" type="feather" size={22} color={civicColors.orange} />
        </View>
        <Text style={styles.caption}>{organization.archived_at ? 'ARCHIVED' : organization.role === 'owner' ? 'OWNER' : 'MEMBER'}</Text>
      </View>
      <Text style={styles.cardTitle}>{organization.name}</Text>
      {!!organization.description && (
        <Text numberOfLines={2} style={styles.secondaryText}>
          {organization.description}
        </Text>
      )}
      <Text style={styles.caption}>
        {organization.member_count} {organization.member_count === 1 ? 'member' : 'members'} · {organization.open_task_count} open{' '}
        {organization.open_task_count === 1 ? 'task' : 'tasks'}
      </Text>
    </TouchableOpacity>
  );
}

export function dueDateLabel(value) {
  if (!value) return 'No due date';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TaskCard({ task, assignee, onPress }) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.task}>
      <Icon
        name={task.status === 'done' ? 'check-circle' : 'circle'}
        type="feather"
        size={23}
        color={task.status === 'done' ? '#8FCEAB' : civicColors.orange}
      />
      <View style={styles.flex}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.caption}>
          {task.status === 'done' ? 'Completed' : dueDateLabel(task.due_date)}
          {assignee ? ` · ${assignee}` : ''}
        </Text>
      </View>
      <Icon name="chevron-right" type="feather" size={18} color={civicColors.muted} />
    </TouchableOpacity>
  );
}

export function WorkspacePhoto({ address, attachment }) {
  const [source, setSource] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSource(null);
    setFailed(false);
    (async () => {
      if (!/^\/api\/organizations\/[a-f0-9-]{36}\/attachments\/[a-f0-9-]{36}$/i.test(attachment.url)) throw new Error('Invalid photo');
      const token = await getCivicToken();
      assertWorkspaceIdentity(address);
      if (active)
        setSource({
          uri: WORKSPACE_ORIGIN + attachment.url,
          headers: { Authorization: `Bearer ${token}` },
          cache: 'reload',
        });
    })().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [address, attachment.url]);
  return failed ? (
    <Text style={styles.caption}>Reconnect to view this photo.</Text>
  ) : source ? (
    <Image
      accessibilityLabel="Photo attached to this record"
      source={source}
      onError={() => setFailed(true)}
      resizeMode="cover"
      style={styles.photo}
    />
  ) : (
    <View style={styles.photoPlaceholder}>
      <Text style={styles.caption}>Loading private photo…</Text>
    </View>
  );
}

export function ActivityCard({ activity, address }) {
  return (
    <View style={styles.activity}>
      <View style={styles.activityMark}>
        <View style={[styles.dot, activity.kind === 'task_completed' && styles.completedDot]} />
      </View>
      <View style={[styles.flex, styles.activityBody]}>
        <Text style={styles.caption}>
          {activity.actor?.name || 'Former member'} ·{' '}
          {new Date(activity.created_at).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
        <Text selectable style={styles.body}>
          {activity.body}
        </Text>
        {(activity.attachments || []).map(photo => (
          <WorkspacePhoto key={photo.id} attachment={photo} address={address} />
        ))}
      </View>
    </View>
  );
}

/* Shared styles are consumed by workspace screens. */
/* eslint-disable react-native/no-unused-styles */
export const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: 24,
    paddingBottom: 40,
    gap: 22,
  },
  listContent: { paddingBottom: 24 },
  listItem: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingBottom: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  body: { color: civicColors.text, fontSize: 16, lineHeight: 24 },
  secondaryText: { color: civicColors.muted, fontSize: 15, lineHeight: 22 },
  caption: {
    color: civicColors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'ChakraPetch-Regular',
  },
  sectionTitle: {
    color: civicColors.text,
    fontSize: 23,
    fontFamily: 'ChakraPetch-Bold',
    flexShrink: 1,
  },
  cardTitle: {
    color: civicColors.text,
    fontSize: 23,
    lineHeight: 28,
    fontFamily: 'ChakraPetch-Bold',
  },
  card: {
    backgroundColor: civicColors.panel,
    borderWidth: 1,
    borderColor: civicColors.border,
    borderRadius: 18,
    padding: 20,
    gap: 14,
  },
  iconTile: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#24201B',
  },
  smallAction: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  actionText: {
    color: civicColors.orange,
    fontSize: 15,
    fontFamily: 'ChakraPetch-Bold',
    flexShrink: 1,
  },
  danger: { color: '#F4A38A' },
  disabled: { opacity: 0.5 },
  notice: {
    backgroundColor: civicColors.panel,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: civicColors.border,
    gap: 4,
  },
  errorNotice: { borderColor: '#754638' },
  field: { gap: 8 },
  label: {
    color: civicColors.text,
    fontSize: 16,
    fontFamily: 'ChakraPetch-SemiBold',
  },
  input: {
    color: civicColors.text,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 54,
    padding: 16,
    borderWidth: 1,
    borderColor: civicColors.border,
    borderRadius: 12,
    backgroundColor: civicColors.panel,
  },
  multiline: { minHeight: 128, textAlignVertical: 'top' },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: civicColors.panel,
  },
  taskTitle: {
    color: civicColors.text,
    fontSize: 17,
    lineHeight: 23,
    fontFamily: 'ChakraPetch-SemiBold',
    marginBottom: 6,
  },
  activity: { flexDirection: 'row', gap: 12 },
  activityMark: { width: 16, alignItems: 'center', paddingTop: 5 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: civicColors.orange,
  },
  completedDot: { backgroundColor: '#8FCEAB' },
  activityBody: {
    gap: 10,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderColor: civicColors.border,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: civicColors.panel,
  },
  photoPlaceholder: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: civicColors.panel,
    borderRadius: 12,
  },
  empty: { paddingVertical: 16, gap: 12 },
  choice: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: civicColors.border,
    borderRadius: 12,
    backgroundColor: civicColors.panel,
  },
  choiceSelected: {
    borderColor: civicColors.orange,
    backgroundColor: '#30251B',
  },
  choiceLabel: {
    color: civicColors.text,
    fontSize: 15,
    fontFamily: 'ChakraPetch-SemiBold',
  },
});
