import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import sha256 from 'crypto-js/sha256';
import { assertWorkspaceIdentity, workspaceID, workspaceRequest } from './workspace-api';

const directory = address => `${RNFS.DocumentDirectoryPath}/workspace-photos/${sha256(address).toString()}`;
const localPath = uri => uri.replace(/^file:\/\//, '');

export async function chooseWorkspacePhoto(address, source = 'library') {
  assertWorkspaceIdentity(address);
  if (source === 'camera' && Platform.OS === 'android') {
    const allowed = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (allowed !== PermissionsAndroid.RESULTS.GRANTED)
      throw new Error('Allow camera access to take a photo, or choose one from your library.');
  }
  const picker = source === 'camera' ? launchCamera : launchImageLibrary;
  const result = await picker({
    mediaType: 'photo',
    selectionLimit: 1,
    quality: 0.8,
    maxWidth: 1600,
    maxHeight: 1600,
    assetRepresentationMode: 'compatible',
  });
  assertWorkspaceIdentity(address);
  if (result.didCancel) return null;
  if (result.errorCode) throw new Error('The photo could not be opened. Check photo permissions and try again.');
  const asset = result.assets?.[0];
  const extension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }[asset?.type];
  if (!asset?.uri || !extension) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  const id = workspaceID();
  const path = `${directory(address)}/${id}.${extension}`;
  await RNFS.mkdir(directory(address), {
    NSFileProtectionKey: 'NSFileProtectionComplete',
  });
  await RNFS.copyFile(localPath(asset.uri), path);
  try {
    const size = Number((await RNFS.stat(path)).size);
    assertWorkspaceIdentity(address);
    if (size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
  } catch (error) {
    await RNFS.unlink(path).catch(() => {});
    throw error;
  }
  return {
    id,
    uri: `file://${path}`,
    type: asset.type,
    name: `${id}.${extension}`,
  };
}

export async function uploadWorkspacePhotos(address, organizationId, photos, saveProgress) {
  const uploaded = [...(photos || [])];
  for (let i = 0; i < uploaded.length; i++) {
    if (uploaded[i].attachmentId) continue;
    assertWorkspaceIdentity(address);
    const photo = uploaded[i];
    if (!localPath(photo.uri).startsWith(directory(address) + '/') || photo.uri.includes('..'))
      throw new Error('This photo belongs to another draft.');
    if (!(await RNFS.exists(localPath(photo.uri)))) throw new Error('A draft photo is missing. Remove it and choose the photo again.');
    const body = new FormData();
    body.append('client_id', photo.id);
    body.append('photo', {
      uri: photo.uri,
      type: photo.type,
      name: photo.name,
    });
    const response = await workspaceRequest(address, {
      method: 'POST',
      path: `/organizations/${organizationId}/attachments`,
      data: body,
      multipart: true,
    });
    if (!/^[a-f0-9-]{36}$/i.test(response.attachment?.id)) throw new Error('The upload did not return a valid photo reference.');
    uploaded[i] = { ...photo, attachmentId: response.attachment.id };
    await saveProgress(uploaded);
  }
  return uploaded.map(photo => photo.attachmentId);
}

export async function removeWorkspacePhotos(address, photos) {
  for (const photo of photos || []) {
    const path = localPath(photo.uri || '');
    if (path.startsWith(directory(address) + '/') && !path.includes('..') && /\/[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(path)) {
      await RNFS.unlink(path).catch(() => {});
    }
  }
}
