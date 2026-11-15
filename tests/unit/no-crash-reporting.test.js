const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

// The BlueWallet code started Bugsnag with BlueWallet's key, on both platforms and from
// JavaScript. Reports with a device ID went to an account that is not ours.
describe('no crash reporting service', () => {
  it('is not started from JavaScript', () => {
    const analytics = read('blue_modules/analytics.js');
    expect(analytics).not.toMatch(/require\(|import /);
    expect(analytics).not.toMatch(/Bugsnag\.(start|notify)/);
  });

  it('is not started by the Android app', () => {
    expect(read('android/app/src/main/java/io/bluewallet/bluewallet/MainApplication.java')).not.toMatch(/Bugsnag\.start|import com\.bugsnag/);
  });

  it('is not started by the iOS app', () => {
    expect(read('ios/BlueWallet/AppDelegate.mm')).not.toMatch(/\[Bugsnag start\]|#import <Bugsnag/);
  });
});
