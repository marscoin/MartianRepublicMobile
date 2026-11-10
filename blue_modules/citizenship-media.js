export const MAX_CITIZENSHIP_VIDEO_BYTES = 5 * 1024 * 1024;

export function citizenshipVideoFile(uri, size) {
  if (typeof uri !== 'string' || !/^(file|content):\/\//i.test(uri)) {
    throw new Error('Record a video before continuing.');
  }
  if (!Number.isFinite(size) || size <= 0) throw new Error('The recording could not be read. Please record it again.');
  if (size > MAX_CITIZENSHIP_VIDEO_BYTES) throw new Error('The recording is larger than 5 MB. Please record a shorter video.');
  const extension = /\.(mp4|mov|webm)(?:[?#].*)?$/i.exec(uri)?.[1]?.toLowerCase();
  if (!extension) throw new Error('This recording format is not supported. Please record it again.');
  return {
    uri,
    type: { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }[extension],
    name: `upload.${extension}`,
  };
}

// Return our own messages, never a raw server error (which may include request
// details). A rejected format is not a transient connection failure.
export function citizenshipVideoUploadError(error) {
  const status = error?.response?.status;
  if (status === 401) return 'Your civic sign-in expired. Sign in again before uploading your recording.';
  if (status === 413 || (status === 422 && /size|5\s*MB/i.test(error?.response?.data?.error || ''))) {
    return 'The recording is too large. Please record a shorter video under 5 MB.';
  }
  if (status === 422) return 'The citizenship service could not accept this recording. Your recording is still available on this screen.';
  return 'Your recording is still available on this screen. Check your connection and try again.';
}
