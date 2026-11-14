// iOS ends the app on the spot when it touches the camera, microphone or photo
// library without the matching text in the plist the shipped target is built from.
const fs = require('fs');
const path = require('path');

const project = fs.readFileSync(path.join(__dirname, '../../ios/BlueWallet.xcodeproj/project.pbxproj'), 'utf8');
const appPlists = [...new Set([...project.matchAll(/INFOPLIST_FILE = "?([^";]+)"?;/g)].map(m => m[1]))].filter(f => /^BlueWallet/.test(f));

describe('iOS permission texts', () => {
  it('finds the app plists', () => {
    expect(appPlists).toEqual(expect.arrayContaining(['BlueWallet-NoLDK.plist', 'BlueWallet/Info.plist']));
  });

  it.each(appPlists)('%s explains camera, microphone and photo access', file => {
    const plist = fs.readFileSync(path.join(__dirname, '../../ios', file), 'utf8');
    for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription']) {
      expect(plist).toMatch(new RegExp(`<key>${key}</key>\\s*<string>[^<]{10,}</string>`));
    }
  });
});
