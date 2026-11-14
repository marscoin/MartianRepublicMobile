import React from 'react';
import { FlatListProps, ScrollViewProps, StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { NavigationOptionsGetter } from './navigationStyle';

export const settingsColors: {
  background: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  orange: string;
  faint: string;
  chevron: string;
  tile: string;
  danger: string;
  good: string;
};

export const settingsHeaderOptions: NativeStackNavigationOptions;
export function settingsNavigation(getTitle?: () => string): NavigationOptionsGetter;

type Children = { children?: React.ReactNode };

export function SettingsHeader(props: { overline?: string; title: string }): React.ReactElement;

export function SettingsScreen(
  props: ScrollViewProps & Children & { overline?: string; title?: string; header?: React.ReactNode; contentStyle?: StyleProp<ViewStyle> },
): React.ReactElement;

export function SettingsList<T>(
  props: FlatListProps<T> & { overline?: string; title: string; footer?: React.ReactElement | null },
): React.ReactElement;

export function SettingsSection(
  props: Children & { label?: string; action?: string; onAction?: () => void; actionTestID?: string; first?: boolean },
): React.ReactElement;

export function SettingsRow(props: {
  icon?: string;
  title: string;
  note?: React.ReactNode;
  value?: string | null;
  onPress?: () => void;
  testID?: string;
  danger?: boolean;
  last?: boolean;
  checked?: boolean;
  chevron?: boolean;
  disabled?: boolean;
  loading?: boolean;
}): React.ReactElement;

export function SettingsSwitchRow(props: {
  icon?: string;
  title: string;
  note?: React.ReactNode;
  value?: boolean;
  onValueChange?: (value: boolean) => void | Promise<void>;
  disabled?: boolean;
  testID?: string;
  switchTestID?: string;
  last?: boolean;
}): React.ReactElement;

export function SettingsNote(props: Children & { centered?: boolean; onPress?: () => void; testID?: string }): React.ReactElement;
export function SettingsCard(props: Children & { style?: StyleProp<ViewStyle> }): React.ReactElement;
export function SettingsCardText(props: Children & { strong?: boolean }): React.ReactElement;
export function SettingsField(props: TextInputProps & { label?: string }): React.ReactElement;
export function SettingsLink(props: { title: string; onPress?: () => void; testID?: string; danger?: boolean }): React.ReactElement;
export function SettingsLoading(): React.ReactElement;
