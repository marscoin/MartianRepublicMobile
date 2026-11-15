// Recording the short citizenship video with the system camera.
//
// The camera, the compressor and the file reader are passed in, so the decisions
// here can be tested without a phone.

import { MAX_CITIZENSHIP_VIDEO_BYTES } from './citizenship-media';

export const CITIZENSHIP_VIDEO_SECONDS = 60;

export const CITIZENSHIP_CAMERA_OPTIONS = Object.freeze({
  mediaType: 'video',
  cameraType: 'front',
  durationLimit: CITIZENSHIP_VIDEO_SECONDS,
  videoQuality: 'medium',
  formatAsMp4: true,
  saveToPhotos: false,
  presentationStyle: 'fullScreen',
});

const COMPRESSION = Object.freeze({ compressionMethod: 'manual', maxSize: 480, bitrate: 450000 });

/**
 * The four characters an applicant reads aloud, so the recording belongs to one
 * civic address without anything having to be written on paper.
 */
export function spokenCode(address) {
  if (typeof address !== 'string' || address.trim().length < 8) return null;
  return address.trim().slice(-4);
}

/** The code with spaces between the characters, as it is shown on screen. */
export function spokenCodeText(address) {
  const code = spokenCode(address);
  return code ? code.split('').join(' ') : null;
}

function cameraProblem(response) {
  switch (response?.errorCode) {
    case 'permission':
      return 'Allow camera and microphone access for Martian Republic in Settings, then record again.';
    case 'camera_unavailable':
      return 'This device has no camera available for recording.';
    default:
      return 'The video could not be recorded. Please try again.';
  }
}

/**
 * Opens the system camera, then shrinks the recording.
 * Returns the file to upload, or null when the person closed the camera.
 * Throws an Error whose message can be shown as it is.
 */
export async function recordCitizenshipVideo({ launchCamera, compress, fileSize }) {
  let response;
  try {
    response = await launchCamera(CITIZENSHIP_CAMERA_OPTIONS);
  } catch (_) {
    throw new Error(cameraProblem());
  }
  if (!response || response.didCancel) return null;
  if (response.errorCode) throw new Error(cameraProblem(response));

  const recorded = response.assets?.[0]?.uri;
  if (typeof recorded !== 'string' || !recorded) throw new Error(cameraProblem());

  let uri = recorded;
  try {
    const smaller = await compress(recorded, COMPRESSION);
    if (typeof smaller === 'string' && smaller) uri = smaller;
  } catch (_) {
    // Keep the camera's own file; the size check below still applies.
  }
  if (!/^[a-z]+:\/\//i.test(uri)) uri = `file://${uri}`;

  let size;
  try {
    size = Number(await fileSize(uri));
  } catch (_) {
    throw new Error('The recording could not be read. Please record it again.');
  }
  if (!Number.isFinite(size) || size <= 0) throw new Error('The recording could not be read. Please record it again.');
  if (size > MAX_CITIZENSHIP_VIDEO_BYTES) {
    throw new Error('The recording is larger than 5 MB. Please record a shorter video.');
  }
  return { uri, size };
}
