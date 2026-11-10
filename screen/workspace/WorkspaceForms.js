import { marsAlert } from '../../components/MarsDialog';
import React, { useState } from 'react';
import { FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from 'react-native-elements';
import { CivicButton, civicColors } from '../../components/CivicUi';
import { chooseWorkspacePhoto, removeWorkspacePhotos } from '../../blue_modules/workspace-photos';
import { SmallAction, WorkspaceField, styles } from './WorkspaceUi';

export function MemberPicker({ members, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = members.find(member => member.id === value);
  const list = [{ id: null, name: 'Unassigned' }, ...members.filter(member => member.status === 'active')].filter(
    member => !query.trim() || member.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Assign to</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Assign task: ${selected?.name || 'Unassigned'}`}
        disabled={disabled}
        style={[styles.input, styles.rowBetween, disabled && styles.disabled]}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <Text style={styles.body}>{selected?.name || 'Unassigned'}</Text>
        <Icon name="chevron-down" type="feather" size={20} color={civicColors.muted} />
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={formStyles.modal}>
          <View style={formStyles.modalHeader}>
            <Text style={styles.sectionTitle}>Assign this task</Text>
            <SmallAction title="Done" onPress={() => setOpen(false)} />
          </View>
          <View style={formStyles.search}>
            <WorkspaceField label="Find a member" value={query} onChangeText={setQuery} autoCapitalize="none" />
          </View>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={list}
            keyExtractor={member => String(member.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                accessibilityRole="radio"
                accessibilityState={{ selected: item.id === value }}
                onPress={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={formStyles.member}
              >
                <Text style={[styles.body, styles.flex]}>{item.name}</Text>
                {item.id === value && <Icon name="check" type="feather" size={22} color={civicColors.orange} />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function DraftPhotos({ address, photos = [], onChange, disabled, onBusy }) {
  const [picking, setPicking] = useState(false);
  const choose = async source => {
    if (picking || disabled) return;
    setPicking(true);
    onBusy?.(true);
    try {
      const photo = await chooseWorkspacePhoto(address, source);
      if (photo) {
        const saved = await onChange([...photos, photo]);
        if (saved === false) throw new Error('The photo could not be saved with this draft. Try again.');
      }
    } catch (error) {
      marsAlert('Photo not added', error.message);
    } finally {
      setPicking(false);
      onBusy?.(false);
    }
  };
  const add = () =>
    marsAlert('Add a photo', 'It will be shared with organization members when you save this record.', [
      { text: 'Take photo', onPress: () => choose('camera') },
      { text: 'Choose from library', onPress: () => choose('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  const remove = async photo => {
    const result = await onChange(photos.filter(item => item.id !== photo.id));
    if (result !== false) await removeWorkspacePhotos(address, [photo]);
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Photos · optional</Text>
      {!!photos.length && (
        <ScrollView horizontal contentContainerStyle={formStyles.photos}>
          {photos.map(photo => (
            <View key={photo.id} style={formStyles.photoCard}>
              <Image source={{ uri: photo.uri }} style={formStyles.preview} accessibilityLabel="Draft photo" />
              <SmallAction title="Remove" disabled={disabled || picking} onPress={() => remove(photo)} />
              {photo.attachmentId && <Text style={styles.caption}>Upload saved</Text>}
            </View>
          ))}
        </ScrollView>
      )}
      {photos.length < 4 && (
        <CivicButton
          title={picking ? 'Opening photo…' : 'Add photo'}
          icon="camera"
          secondary
          disabled={disabled || picking}
          onPress={add}
        />
      )}
      <Text style={styles.caption}>Up to 4 photos. Photos in an unfinished draft stay private to you.</Text>
    </View>
  );
}

const formStyles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: civicColors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    gap: 16,
  },
  search: { paddingHorizontal: 24, paddingBottom: 16 },
  member: {
    minHeight: 60,
    padding: 24,
    flexDirection: 'row',
    gap: 16,
    borderBottomWidth: 1,
    borderColor: civicColors.border,
  },
  photos: { gap: 16, paddingVertical: 8 },
  photoCard: { width: 140 },
  preview: {
    width: 140,
    height: 150,
    borderRadius: 12,
    backgroundColor: civicColors.panel,
  },
});
