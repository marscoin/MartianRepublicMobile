// The pieces every settings screen is built from: the dark page with its
// overline and title, labelled groups of rows in a bordered card, rows that
// lead somewhere, rows with a switch, and the matching navigation bar.
import React from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-elements';
import { civicColors } from './CivicUi';
import navigationStyle from './navigationStyle';

export const settingsColors = {
  ...civicColors,
  faint: '#8A9098',
  chevron: '#6B7178',
  tile: '#1D2126',
  danger: '#F4A38A',
  good: '#72A66D',
};

// Navigation bar for a settings screen: the same near-black as the page, a
// visible back arrow and no bar title, because the page carries its own.
// `getTitle` is read when the screen opens so it follows the chosen language;
// it still names the screen for the back button of whatever opens next.
export const settingsHeaderOptions = {
  headerTitle: '',
  headerLargeTitle: false,
  headerTransparent: false,
  headerStyle: { backgroundColor: settingsColors.background },
  headerTintColor: settingsColors.text,
};

export const settingsNavigation = getTitle =>
  navigationStyle({}, options => ({ ...options, ...settingsHeaderOptions, title: getTitle ? getTitle() : undefined }));

export function SettingsHeader({ overline = 'MCR / SETTINGS', title }) {
  return (
    <View>
      <View style={styles.overlineRow}>
        <View style={styles.tick} />
        <Text style={styles.overline}>{overline}</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

// A scrolling settings page. Extra props go to the ScrollView.
export function SettingsScreen({ overline, title, header, children, contentStyle, ...scroll }) {
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, contentStyle]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets
      {...scroll}
    >
      {header === undefined ? <SettingsHeader overline={overline} title={title} /> : header}
      {children}
    </ScrollView>
  );
}

// A settings page that is one long list (languages, currencies). Extra props
// go to the FlatList.
export function SettingsList({ overline, title, footer, ...list }) {
  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets
      ListHeaderComponent={<SettingsHeader overline={overline} title={title} />}
      ListFooterComponent={footer}
      {...list}
    />
  );
}

// A group of rows in one card, under a small label. The last row loses its
// dividing line without being told.
export function SettingsSection({ label, action, onAction, actionTestID, children, first = false }) {
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <>
      {label || action ? (
        <View style={[styles.sectionRow, first && styles.sectionFirst]}>
          <Text style={styles.section}>{label}</Text>
          {action ? (
            <TouchableOpacity accessibilityRole="button" onPress={onAction} testID={actionTestID} hitSlop={HIT_SLOP}>
              <Text style={styles.sectionAction}>{action}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={[styles.panel, !label && !action && !first && styles.panelAlone]}>
          {rows.map((row, index) =>
            index === rows.length - 1 && row.props.last === undefined ? React.cloneElement(row, { last: true }) : row,
          )}
        </View>
      ) : null}
    </>
  );
}

function RowBody({ icon, title, note, danger, disabled }) {
  return (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} type="feather" size={18} color={danger ? settingsColors.danger : settingsColors.orange} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, danger && styles.danger, disabled && styles.dim]}>{title}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </>
  );
}

// A row that leads somewhere or shows a value. With `checked` it is one choice
// in a list; without `onPress` it is plain information.
export function SettingsRow({
  icon,
  title,
  note,
  value,
  onPress,
  testID,
  danger = false,
  last = false,
  checked,
  chevron = true,
  disabled = false,
  loading = false,
}) {
  const body = (
    <>
      <RowBody icon={icon} title={title} note={note} danger={danger} disabled={disabled && !checked} />
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {loading ? <ActivityIndicator color={settingsColors.orange} /> : null}
      {!loading && checked ? <Icon name="check" type="feather" size={20} color={settingsColors.orange} /> : null}
      {!loading && checked === undefined && onPress && chevron ? (
        <Icon name="chevron-right" type="feather" size={20} color={settingsColors.chevron} />
      ) : null}
    </>
  );
  const style = [styles.row, last && styles.rowLast];
  if (!onPress) {
    return (
      <View style={style} testID={testID} accessible accessibilityState={checked === undefined ? undefined : { selected: !!checked }}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={checked === undefined ? { disabled } : { disabled, selected: !!checked }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={style}
    >
      {body}
    </TouchableOpacity>
  );
}

// A row with a switch, tinted with the accent. `testID` names the row and
// `switchTestID` the switch itself.
export function SettingsSwitchRow({ icon, title, note, value, onValueChange, disabled = false, testID, switchTestID, last = false }) {
  return (
    <View style={[styles.row, last && styles.rowLast]} testID={testID}>
      <RowBody icon={icon} title={title} note={note} disabled={disabled} />
      <Switch
        accessible
        accessibilityRole="switch"
        accessibilityLabel={title}
        value={!!value}
        onValueChange={onValueChange}
        disabled={disabled}
        testID={switchTestID}
        trackColor={SWITCH_TRACK}
        thumbColor={settingsColors.text}
        ios_backgroundColor={settingsColors.border}
        style={styles.switch}
      />
    </View>
  );
}

// A paragraph of explanation between groups.
export function SettingsNote({ children, centered = false, onPress, testID }) {
  return (
    <Text style={[styles.paragraph, centered && styles.centered]} onPress={onPress} testID={testID}>
      {children}
    </Text>
  );
}

// Text inside a card: licences, release notes and the like.
export function SettingsCard({ children, style }) {
  return <View style={[styles.panel, styles.card, style]}>{children}</View>;
}

export function SettingsCardText({ children, strong = false }) {
  return <Text style={[styles.cardText, strong && styles.cardTextStrong]}>{children}</Text>;
}

// A text field in a card.
export function SettingsField({ label, style, ...input }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#737C86"
        selectionColor={settingsColors.orange}
        underlineColorAndroid="transparent"
        autoCorrect={false}
        autoCapitalize="none"
        numberOfLines={1}
        style={[styles.input, style]}
        {...input}
      />
    </View>
  );
}

// A quiet text button for a secondary action.
export function SettingsLink({ title, onPress, testID, danger = false }) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} testID={testID} style={styles.link} hitSlop={HIT_SLOP}>
      <Text style={[styles.linkText, danger && styles.danger]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SettingsLoading() {
  return (
    <View style={styles.loading} testID="SettingsLoading">
      <ActivityIndicator color={settingsColors.orange} />
    </View>
  );
}

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const SWITCH_TRACK = { false: settingsColors.border, true: settingsColors.orange };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: settingsColors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  flex: { flex: 1 },
  overlineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tick: { width: 3, height: 13, backgroundColor: settingsColors.orange, marginRight: 9 },
  overline: { color: settingsColors.muted, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2 },
  title: { color: settingsColors.text, fontFamily: 'ChakraPetch-Bold', fontSize: 30, marginBottom: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 10 },
  sectionFirst: { marginTop: 0 },
  section: { color: settingsColors.faint, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2, flexShrink: 1 },
  sectionAction: { color: settingsColors.orange, fontFamily: 'ChakraPetch-SemiBold', fontSize: 13 },
  panel: {
    backgroundColor: settingsColors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: settingsColors.border,
    paddingHorizontal: 16,
  },
  panelAlone: { marginTop: 16 },
  card: { paddingVertical: 16 },
  cardText: { color: settingsColors.muted, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  cardTextStrong: { color: settingsColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: settingsColors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: settingsColors.tile,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowTitle: { color: settingsColors.text, fontFamily: 'ChakraPetch-SemiBold', fontSize: 16 },
  note: { color: settingsColors.faint, fontSize: 13, lineHeight: 18, marginTop: 2 },
  value: { color: settingsColors.muted, fontSize: 15, marginLeft: 12, maxWidth: '50%' },
  switch: { marginLeft: 12 },
  danger: { color: settingsColors.danger },
  dim: { opacity: 0.5 },
  paragraph: { color: settingsColors.faint, fontSize: 13, lineHeight: 19, marginTop: 10, marginHorizontal: 4 },
  centered: { textAlign: 'center' },
  field: { marginVertical: 8 },
  fieldLabel: { color: settingsColors.faint, fontFamily: 'ChakraPetch-SemiBold', fontSize: 11, letterSpacing: 2, marginBottom: 8 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: settingsColors.border,
    backgroundColor: settingsColors.background,
    color: settingsColors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  link: { alignSelf: 'center', paddingVertical: 12 },
  linkText: { color: settingsColors.orange, fontFamily: 'ChakraPetch-SemiBold', fontSize: 15 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsColors.background },
});
