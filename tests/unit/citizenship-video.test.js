import { recordCitizenshipVideo, spokenCode, spokenCodeText, CITIZENSHIP_CAMERA_OPTIONS } from '../../blue_modules/citizenship-video';

const deps = (over = {}) => ({
  launchCamera: jest.fn(async () => ({ assets: [{ uri: 'file:///tmp/raw.mov' }] })),
  compress: jest.fn(async () => 'file:///tmp/small.mp4'),
  fileSize: jest.fn(async () => 900000),
  ...over,
});

describe('citizenship video', () => {
  it('records with the front camera for at most a minute', async () => {
    const d = deps();
    expect(await recordCitizenshipVideo(d)).toEqual({ uri: 'file:///tmp/small.mp4', size: 900000 });
    expect(d.launchCamera).toHaveBeenCalledWith(CITIZENSHIP_CAMERA_OPTIONS);
    expect(CITIZENSHIP_CAMERA_OPTIONS).toMatchObject({ mediaType: 'video', cameraType: 'front', durationLimit: 60 });
  });

  it('returns nothing when the camera is closed', async () => {
    const d = deps({ launchCamera: async () => ({ didCancel: true }) });
    expect(await recordCitizenshipVideo(d)).toBeNull();
    expect(d.compress).not.toHaveBeenCalled();
  });

  it('explains a refused permission', async () => {
    await expect(recordCitizenshipVideo(deps({ launchCamera: async () => ({ errorCode: 'permission' }) }))).rejects.toThrow(/Settings/);
  });

  it('explains a camera that fails to open', async () => {
    const launchCamera = async () => {
      throw new Error('native failure with details');
    };
    await expect(recordCitizenshipVideo(deps({ launchCamera }))).rejects.toThrow('The video could not be recorded. Please try again.');
  });

  it('keeps the camera file when compression fails', async () => {
    const compress = async () => {
      throw new Error('no encoder');
    };
    expect((await recordCitizenshipVideo(deps({ compress }))).uri).toBe('file:///tmp/raw.mov');
  });

  it('adds the file scheme the uploader expects', async () => {
    expect((await recordCitizenshipVideo(deps({ compress: async () => '/tmp/small.mp4' }))).uri).toBe('file:///tmp/small.mp4');
  });

  it('refuses a recording over 5 MB', async () => {
    await expect(recordCitizenshipVideo(deps({ fileSize: async () => 6 * 1024 * 1024 }))).rejects.toThrow(/5 MB/);
  });

  it('refuses a recording it cannot read', async () => {
    const fileSize = async () => {
      throw new Error('gone');
    };
    await expect(recordCitizenshipVideo(deps({ fileSize }))).rejects.toThrow(/could not be read/);
  });

  it('takes the spoken code from the end of the civic address', () => {
    expect(spokenCode('MUTfdz2DQmEVTkVAjWGTonFzdpSiHTNQSo')).toBe('NQSo');
    expect(spokenCodeText('MUTfdz2DQmEVTkVAjWGTonFzdpSiHTNQSo')).toBe('N Q S o');
    expect(spokenCode('')).toBeNull();
    expect(spokenCode(null)).toBeNull();
  });
});
