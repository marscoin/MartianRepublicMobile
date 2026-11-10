import { citizenshipVideoFile, citizenshipVideoUploadError, MAX_CITIZENSHIP_VIDEO_BYTES } from '../../blue_modules/citizenship-media';

describe('Native citizenship recordings', () => {
  it.each([
    ['file:///camera/recording.mp4', 'video/mp4', 'upload.mp4'],
    ['file:///camera/recording.MOV', 'video/quicktime', 'upload.mov'],
    ['content://camera/recording.webm?rev=1', 'video/webm', 'upload.webm'],
  ])('keeps the actual media format for %s', (uri, type, name) => {
    expect(citizenshipVideoFile(uri, 1024)).toEqual({ uri, type, name });
  });

  it('rejects missing, unreadable, oversized and unsupported files before upload', () => {
    for (const size of [0, NaN, -1]) expect(() => citizenshipVideoFile('file:///video.mp4', size)).toThrow('read');
    expect(() => citizenshipVideoFile('file:///video.mp4', MAX_CITIZENSHIP_VIDEO_BYTES + 1)).toThrow('5 MB');
    expect(() => citizenshipVideoFile('file:///video.mp4', MAX_CITIZENSHIP_VIDEO_BYTES)).not.toThrow();
    expect(() => citizenshipVideoFile('https://example.com/video.mp4', 10)).toThrow('Record');
    expect(() => citizenshipVideoFile(undefined, 10)).toThrow('Record');
    expect(() => citizenshipVideoFile('file:///video.exe', 10)).toThrow('format');
  });

  it('distinguishes permanent upload rejection from a connection failure without exposing server details', () => {
    const rejected = citizenshipVideoUploadError({ response: { status: 422, data: { error: 'File extension .mp4 is not permitted.' } } });
    expect(rejected).toContain('could not accept');
    expect(rejected).not.toContain('connection');
    expect(citizenshipVideoUploadError({ response: { status: 413 } })).toContain('5 MB');
    expect(citizenshipVideoUploadError({ response: { status: 401 } })).toContain('sign-in expired');
    expect(citizenshipVideoUploadError(new Error('sensitive request details'))).not.toContain('sensitive');
  });
});
