# Mobile release preparation

Release status updated 2026-10-10. Apple reported iOS 1.0.5 (1791226802) approved and ready for sale on October 7. The same build is available to the internal `MRTestGroup` in TestFlight. The October 9 organization, shared-record, endorsement, and TLS changes are packaged in signed iOS 1.0.6 (1791595966); Apple's package validation passed. Apple accepted the TestFlight upload on October 9; processing completed with `VALID`, internal state is `IN_BETA_TESTING`, and availability in `MRTestGroup` was verified. No App Store review submission was made. See [the current implementation and validation notes](REVIVAL.md#october-9-organizations-and-shared-records).

## Minimum iOS version, October 10

Apple's `ITMS-90068` email is a nonblocking warning for the accepted 1.0.6 build. [Apple requires an iOS 15 or later deployment target from April 2027](https://developer.apple.com/app-store/submitting/). The app, extensions, UI tests, bundled file-access project, and CocoaPods deployment settings now use iOS 15.0. Future binaries built from this source require iOS 15 or newer.

Validation passed with Xcode 26.3 on the release Mac: the resolved `BlueWallet-NoLDK` Release settings report iOS 15.0, all ten app/extension/test configurations and 172 Pod target configurations match, and `pod install --no-repo-update` changed only the Podfile checksum in the lockfile. Ruby syntax, project plist syntax, and whitespace checks passed. Evidence is under `artifacts/revival/ios15-deployment/`; the isolated validation copy is `/Users/ll/Projects/MarsWallet-ios15-20261010`. This configuration fix has not been archived or uploaded as a replacement binary. The next delivery still needs a fresh build number, signed archive/export, and Apple package validation.

## Existing app identities

| Platform | Identity in this checkout | Release evidence |
| --- | --- | --- |
| Apple | `org.martianrepublic`, App Store ID `6480416861` | Seller **EULER'S IDENTITY, LLC**, confirmed in the owner's App Store Connect account and new distribution certificate. Published 1.0.5; TestFlight preview 1.0.6 (1791595966). NoLDK app and UI-test targets use the confirmed team `DT653ML2L2`. |
| Android | `com.martianrepublic.app` | The public Play listing exists under The Marscoin Foundation. Source version 4.0.1 / code 4. Confirm the upload-certificate fingerprint and highest uploaded version code in Play Console before signing an update. |

Public listings: [Apple App Store](https://apps.apple.com/us/app/martian-republic/id6480416861), [Google Play](https://play.google.com/store/apps/details?id=com.martianrepublic.app).

Do not change application identifiers or replace the existing signing key to solve a build problem. The owner's other Apple Developer login is in use concurrently; this session has not changed it.

## October 9 development preview

The organization workflow is implemented and its Laravel API is deployed. An Android development APK is available at `artifacts/revival/workspace-preview/martian-republic-workspaces-android-debug.apk` (ARM64 and x86_64, embedded production JavaScript and assets, debug signing). It contains no QA identities, fixture API, or test entry point. Package verification passed; it launches on the emulator without Metro. This is a development preview, not a Play Store release. It uses the existing Android application ID; it cannot replace a production-signed installation. Do not uninstall an existing wallet to install this preview.

SHA-256: `b69417a32a516452173e8383711d3c2fa84969664ef8c1c288f6e9b41b01c2ab`.

Validation: 112 wallet tests, 171 server tests/500 assertions, static analysis, changed-source lint, native Android certificate rejection, and the complete two-member organization/task/photo workflow. The default Electrum service became reachable on the October 9 evening recheck, but its self-signed certificate fails validation, so wallet operations and live citizenship/endorsement publication remain blocked. The owner subsequently restored Tailscale access to the release Mac, enabling the iOS build and checks below. Physical-device and Android store-compatibility work remain open.

### iOS 1.0.6 preview

Signed archive/export and Apple's package validation passed for **1.0.6 (1791595966)** on the MacBook Pro with Xcode 26.3 and iOS 26.2 SDK. Local IPA: `artifacts/revival/workspace-ios/martianrepublic-1.0.6-1791595966.ipa` (30,496,928 bytes), SHA-256 `6b2bdd5fe424a14911b8ff09b1ec1175abea23be135d51ef39d665bf96bf511f`. App and extension signatures, identifiers, team, production push entitlement, matching versions/build numbers, and absence of QA fixtures were verified. This App Store distribution package requires a TestFlight/App Store upload for phone installation; it is not an ad hoc IPA. Apple accepted the upload at 2026-10-10 03:18:49 UTC (October 9 local time), delivery `075e4ae5-cb91-4166-a5a9-6bb84ddcfcd9`. Processing completed with `VALID`; the build is `IN_BETA_TESTING` and listed in the existing internal `MRTestGroup`. English test notes, including the known Electrum limitation, were saved and read back successfully. Evidence: `artifacts/revival/workspace-ios/apple-upload.log`, `apple-processing.json`, and `testflight-report.json`. No App Store review submission was made. Apple returned zero errors and the existing nonblocking warning about raising the minimum iOS version to 15 by April 2027.

All 112 wallet tests passed on the Pro. A native ARM64 simulator build passed, and isolated iOS 26.3.1 checks verified real Keychain storage, encrypted draft data, recovery after terminating/relaunching the app, separation between identities, and rejection of altered ciphertext authentication data. The actual Electrum client accepted a valid TLS certificate and rejected expired, self-signed, and wrong-host certificates. The restored production entry point launched to the welcome screen and displayed the expected connection error for the default Electrum server's untrusted certificate. These checks do not replace the remaining physical-device and full citizenship workflow tests.

The isolated source copy is `/Users/ll/Projects/MarsWallet-workspaces-20261009`; the existing checkout and other projects were preserved. All 1,276 transferred source files/symlinks matched the manifest before building and after removing the test entry point. The host-specific Pod lock was preserved. Build command, signed archive, export, and logs are under `/Users/ll/buildlogs/workspace-ios-20261009`; local package, validation, native-check reports, and screenshots are under `artifacts/revival/workspace-ios/`. Version/build overrides live in `MarsWallet-workspaces.command`; the source project's base version remains 1.0.5.

## Concrete release gaps

- **Apple build tools:** use the MacBook Pro below for builds. It has macOS 26.1 and Xcode 26.3; the `BlueWallet-NoLDK` simulator build and signed Release archive/export passed with its iOS 26.2 SDK on 2026-10-05. Coding remains on this MacBook Air. Apple's package validation passed; physical-device runtime checks remain.
- **Android build tools:** source targets API 34, with React Native 0.72.11, AGP 7.4.2 and NDK 23.1. Google Play requires API 36 for ordinary phone app updates from August 31, 2026. Upgrade and validate the native dependency stack before claiming store compatibility. Changing the target number alone is insufficient. The root Gradle configuration previously overrode compile SDK to 33; it now consistently uses the root SDK setting.
- **Native binary compatibility:** the built ARM64 debug APK contains 64 native libraries; 62 have ELF load-segment alignment below 16 KB. This confirms that the current native dependency stack needs migration. React Native, Realm, rn-ldk and the camera/video modules require review and appropriate device/emulator testing. No store-compliant APK/AAB has yet been demonstrated.
- **Signing and store access:** the MacBook Air's September certificate/profile remain installed, expiring 2027-09-21. The MacBook Pro already holds a separate valid Euler's Identity distribution identity and matching app/widget/sticker profiles, expiring in April 2027; these produced the verified signed IPA below. App Store Connect API access to Martian Republic is verified. The mobile GitHub repository has zero Actions secrets. The Android keystore was found in the older `MarsWallet_new/android/app` checkout, but its store password is not yet confirmed. Paths are indexed privately in `/Users/novalis78/CREDENTIALS.md`; no private signing key was transferred.
- **Authenticated Electrum:** client certificate validation and Android hostname verification are implemented. A native Android run accepted a valid certificate and rejected expired, self-signed, and wrong-host certificates; a regression also verifies security patches apply on a clean Linux install. The October 9 evening recheck reached default `147.182.177.23:50002`, but validation failed with `DEPTH_ZERO_SELF_SIGNED_CERT`; the two former bundled hosts still refused connections. The existing `bfmars` SSH identity was rejected. Current server access or a replacement authenticated endpoint is still needed. Do not trust an observed self-signed certificate without independent verification.
- **Citizenship uploads:** MP4/MOV support is merged and deployed. The full website suite and live rejection checks pass; successful media storage still needs controlled validation. No bot profile was replaced and no application was published.
- **Build capacity:** the initial Mac Android build was stopped with low disk space and heavy swap use. Android builds now run on the owner's Omarchy machine with ample capacity and Java 17; see the host setup below. Rebuildable Mac caches were cleared while preserving source, wallet data and the working iOS app product.
- **Device coverage:** the October changes build and run on isolated Android API 34 x86_64 and iOS 26.3.1 ARM64 simulators. Android organization workflow and native certificate checks pass; iOS native encrypted storage, restart recovery, certificate checks, and production startup pass as described above. Camera/audio capture, citizenship publication, backup/restore, and small-screen layouts still need physical-device checks.
- **Store content:** Android draft text now describes Martian Republic/Marscoin. The old images under `fastlane/metadata/android/en-US/images` still need replacement with screenshots from the actual Android build. Review privacy/data-safety declarations and review notes against the final implemented flows.

Current requirements: [Apple SDK minimum](https://developer.apple.com/news/?id=ueeok6yw), [Xcode system requirements](https://developer.apple.com/support/xcode/), [Google Play target API](https://developer.android.com/google/play/requirements/target-sdk), [Android 16 KB compatibility](https://developer.android.com/guide/practices/page-sizes).

## Android signing workflow

Hardcoded upload passwords were removed from tracked Gradle files. This does not erase their Git history. Verify the existing upload key and its handling before reusing it; do not generate a replacement key without matching the Play app's signing configuration.

Inject these through the release process's environment, using a private credential store:

- `MARS_UPLOAD_STORE_FILE`: absolute path to the existing upload keystore
- `MARS_UPLOAD_STORE_PASSWORD`
- `MARS_UPLOAD_KEY_ALIAS`
- `MARS_UPLOAD_KEY_PASSWORD`
- `MARS_VERSION_CODE`: unused positive version code higher than every previous upload

Run `scripts/build-android-release.sh` for an AAB, or `scripts/build-android-release.sh apk` for an APK. The script stops before Gradle if signing settings are missing. Passwords are not placed on the command line, and the source version is not rewritten. It builds locally and does not upload. Direct Gradle use also supports signing properties in the user's private `~/.gradle/gradle.properties`.

The inherited GitHub store workflows reference obsolete SDKs, absent Fastlane lanes and old credential names. They are not a validated release path; update them after the native migration and signing configuration are established.

## Website video patch

`patches/republic-native-video.patch` applies to the website reference checkout at `214fe9c` and includes a regression test. It:

- Accepts MP4 and QuickTime alongside WebM for the mobile citizenship video endpoint.
- Preserves the existing detected-MIME check, extension allowlist and 5 MB limit.
- Saves the validated extension instead of renaming every recording to `.webm`.
- Returns HTTP 422 for a missing upload.

The patch was merged in [website PR #18](https://github.com/marscoin/martianrepublic/pull/18) and deployed as `a84b4ef07e33c4901a0665950460cae845b0532e`. In an isolated server checkout with PHP 8.2 and SQLite in memory, the full Pest suite passed (149 tests / 328 assertions), PHPStan reported no errors, and Pint passed. All final GitHub PR checks passed. The PR also resolves feature-branch Composer version inference and a stale PHPStan suppression, preserving the AI response stream behavior.

After deployment, the site returned HTTP 200. Deliberately invalid MP4, MOV and WebM uploads each returned HTTP 422 for detected-MIME mismatch; native extensions are no longer rejected. A missing file returned 422. The Valles Marineris public profile was unchanged before/after. No valid media, JSON application record or transaction was published. Sanitized results are in `artifacts/revival/upload-after-deploy.txt`; pre-deployment evidence is in `upload-contract.txt`.

## Release evidence

- Focused offline wallet/civic/media suite: 67 passing tests, eight suites.
- iOS Release package: signed archive/export and Apple's package validation passed on 2026-10-05. Version `1.0.5`, build `1791226801`, built on the MacBook Pro with Xcode 26.3 / iOS 26.2 SDK. Main app and both extensions have the expected bundle IDs, team and build number; deep signature verification passed. See the TestFlight preparation below.
- New media helper/test ESLint: passed.
- Android production JavaScript bundle: passed through Metro. This is not a native APK or AAB.
- Android native debug APK: **passed on Omarchy**, package `com.martianrepublic.app`, version 4.0.1 / code 4, ARM64 only, 38 MiB. The Android Debug signature and copied artifact checksum were verified. This development build requires Metro and has not been installed on an Android device/emulator. Local artifact: `artifacts/revival/martian-republic-arm64-debug.apk`; audit: `artifacts/revival/android-apk-report.json`.
- iOS video-instruction screen: viewed in the simulator; 60-second/5 MB limit and disabled Next control shown. Simulator review does not validate real camera/audio capture.
- Release-script shell syntax: passed; missing signing input correctly prevents a build.

- After the simulator restart, both test wallets persisted, civic authentication returned HTTP 200, and obsolete plaintext phrase/token entries remained absent. The app was left on its normal home route.

## MacBook Pro build host

The owner chose to keep coding in `/Users/novalis78/Projects/MarsWallet` on the MacBook Air and run builds on the MacBook Pro. Connect with `ssh ll@100.100.47.81` over Tailscale (`ls-macbook-pro.tail8c6d43.ts.net`). The build checkout is `/Users/ll/Projects/MarsWallet`, branch `codex/wallet-citizenship-refresh`, based on `e94b84c6` with the uncommitted revival work. The separate `/Users/ll/Projects/MartianRepublicMobile` checkout contains other uncommitted work; leave it untouched.

Verified 2026-10-05: macOS 26.1, Xcode 26.3, 48 GiB RAM, about 410 GiB free, Node 22.22.0 and CocoaPods 1.16.2. All 1,224 regular source files were compared by SHA-256, and all 21 symlink targets matched. The only file difference was the `RCT-Folly` checksum in `ios/Podfile.lock`; the installed podspec JSON is semantically identical, with different whitespace serialization. Keep host-installed dependencies and build caches on the Pro. Before future source syncs, compare remote changes and preserve unrelated work; exclude signing keys, wallet data and local dependency/build directories.

All 67 wallet tests in eight suites passed on the Pro. A fresh `BlueWallet-NoLDK` x86_64 simulator build also passed under Xcode 26.3 / iOS 26.2 SDK. Run from this laptop:

```sh
ssh ll@100.100.47.81 'export PATH=/opt/homebrew/bin:/opt/homebrew/opt/ruby/bin:$PATH
cd /Users/ll/Projects/MarsWallet
npm run test:wallet &&
xcodebuild -workspace ios/BlueWallet.xcworkspace -scheme BlueWallet-NoLDK \
  -configuration Debug -sdk iphonesimulator \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath /Users/ll/buildlogs/dd-MarsWallet \
  ARCHS=x86_64 ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO build'
```

Build log: `/Users/ll/buildlogs/MarsWallet-NoLDK-20261005.log`. Product: `/Users/ll/buildlogs/dd-MarsWallet/Build/Products/Debug-iphonesimulator/MartianRepublic.app`. This verifies compilation; the unsigned simulator product has not been launched on the Pro or validated for Keychain access. Use local ad-hoc signing for simulator runtime checks, as described in `REVIVAL.md`.

### TestFlight preparation, 2026-10-05

The owner requested a fresh TestFlight build for a brief check before proceeding toward an App Store update. The public version is still 1.0.4 (2025-03-16); the previous 1.0.5 TestFlight upload from April 2026 has expired. Existing internal group `MRTestGroup` has access to all builds.

The signed Release archive is `/Users/ll/buildlogs/MarsWallet-1.0.5-20261005-signed.xcarchive`; the exported IPA is `/Users/ll/buildlogs/MarsWallet-1.0.5-20261005/MartianRepublic.ipa`. The local copy is `artifacts/revival/martianrepublic-1.0.5-1791226800.ipa` (30,424,098 bytes; SHA-256 `6cfe0dc4bc1f2e3d98cafc63bd25137b3e77f1e06bf63365efe949a4c54c9625`). The transfer checksum, bundled JavaScript, app/extension identifiers, production push entitlement, team and signatures were verified. Sanitized results are in `artifacts/revival/ios-testflight-package-report.json`.

Run signing/export in the MacBook Pro's desktop Terminal session: its login keychain is available there, while SSH reports it locked. Put `/usr/bin:/bin:/usr/sbin:/sbin` before Homebrew in `PATH` during export. Otherwise Apple's `rsync` starts the incompatible Homebrew child process and packaging fails. The profiles are Xcode-managed, so use automatic signing for the app and both extensions; a global manual app profile mismatches the extensions.

The completed build/export command is retained in `artifacts/revival/MarsWallet-release.command` locally and `/Users/ll/buildlogs/MarsWallet-release.command` remotely. It archives `BlueWallet-NoLDK` for `generic/platform=iOS`, Release, team `DT653ML2L2`, automatic Apple Development signing, and build `1791226800`, then exports with `method=app-store-connect`, `destination=export`, automatic distribution signing and `manageAppVersionAndBuildNumber=false`. Export settings are in `artifacts/revival/ios-macbook-pro-export-options.plist`. Use a new build number for later uploads.

Apple validation returned zero errors. Its only warning says the current iOS 13.4 deployment target must rise to at least iOS 15 for uploads starting April 2027; it did not block this build. Validation output is in `artifacts/revival/apple-validate.log`. TestFlight check notes are in `artifacts/revival/testflight-1.0.5-what-to-test.txt`.

Apple accepted the upload on 2026-10-05 at 19:39 UTC, delivery/build UUID `ac429028-9004-4e2a-9b44-96c651e850e3`. Processing completed with state `VALID`; internal beta state is `IN_BETA_TESTING`. The new build was verified in `MRTestGroup`, and the English TestFlight check notes were saved and verified. No external beta review or App Store review was submitted. Evidence: `artifacts/revival/apple-upload.log`, `apple-upload-processing.json`, and `testflight-release-report.json`. The build number follows the project's existing Unix timestamp convention.

## Omarchy build host

The owner supplied `llopin@100.83.160.24` (`omarchy` on Tailscale). SSH with the dedicated MarsWallet key succeeded. The machine has about 788 GB free and 125 GiB RAM. The current source is copied to `/home/llopin/Projects/MarsWallet` with a checksum manifest. Node 22, Java 17, SDKs 34/36, NDK 23.1, CMake 3.22.1 and ADB are installed. Dependency installation, postinstall, all 67 focused tests and the native ARM64 debug build passed on Linux; signing keys and test-wallet recovery phrases are excluded from source transfer.

On Omarchy, source `~/marswallet-env.sh` before project commands. Tool versions are scoped to that shell; the machine’s global Node/Codex settings were not changed.

Native build command (the larger heap is scoped to this invocation on the 125 GiB host):

```sh
source ~/marswallet-env.sh
cd ~/Projects/MarsWallet/android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a \
  '-Dorg.gradle.jvmargs=-Xmx8g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8' \
  --console=plain --max-workers=4
```

Native build fixes include a retained postinstall patch for the local-image QR library's removed Gradle `compile` configuration, an explicit manifest merge override preserving `allowBackup=false`, and a temporary D8/R8 8.3.37 override. AGP 7.4's bundled compiler crashed while processing AppCompat 1.7.0. The override follows the [R8 project's documented mechanism](https://r8.googlesource.com/r8/+/refs/heads/main/README.md#replacing-r8-in-android-gradle-plugin); remove it when migrating the Android build stack. APK packaging now filters prebuilt libraries to `reactNativeArchitectures`, avoiding incomplete x86/32-bit support in an ARM64-only build. These compatibility fixes do not establish current Play Store compliance.

Signing ownership is recorded above. On 2026-09-21 the owner's new distribution certificate was installed in the login keychain; macOS reports a valid matching identity. Xcode's resolved Release settings confirm team `DT653ML2L2` and bundle `org.martianrepublic`. The owner also downloaded the matching App Store Connect profile, which is installed in Xcode 16's profile directory. Its app/team identifiers, certificate match, expiration, production push entitlement and distribution type were verified. The profile name is cosmetic; its UUID identifies it for signing. Byte Federal and HeyFred accounts have not been changed.

Earlier MacBook Air signing artifacts: `artifacts/revival/ios-profile-report.json` contains the September verification results; `artifacts/revival/ios-export-options.plist` selects the Air's manual App Store Connect profile/certificate. These differ from the Pro's existing Xcode-managed identities and are excluded from Git. The September Xcode dry run only resolved packages and skipped archiving. The actual signed archive, export and Apple package validation subsequently passed on the MacBook Pro under Xcode 26.3; use the October settings above for that host.

### First TestFlight feedback: onboarding and recovery refresh (2026-10-05)

The 1.0.5 feedback build, `1791226801`, incorporates the first device feedback:

- A new welcome screen and recovery form using the existing Mars imagery and Chakra Petch typography. Both welcome choices fit an iPhone SE.
- Recovery validates phrases before navigation, identifies xpub/tpub and address scans, and offers an explicit scan button and optional BIP39 passphrase.
- A shared recovery screen distinguishes connection and secure-save failures, supports retry, and removes the empty discovery result for invalid input.
- Secure saves are serialized. Failure of the optional Realm backup no longer rolls back a successfully saved wallet; concurrent first-launch backup readers share one encryption-key initialization.
- The startup Electrum client now uses the same Marscoin default migration and genesis check as the wallet client.
- Civic IDs use an upright, flowing layout. The Wallet menu dots are centered, and transaction amounts stay on one line.

Validation: 94 offline checks across 12 suites pass. Targeted lint passes for the new recovery components and persistence/network helpers. Native simulator builds succeed with Xcode 26.3. An existing authorized test citizen was restored on a fresh iPhone 17 simulator, retained across a full app restart, and opened through the normal civic-ID action. Apple's Vision framework decoded the civic card QR to the expected public address. The welcome screen and invalid-key guidance were also inspected on an iPhone SE (3rd generation). Screenshots are in `artifacts/revival/design/refresh/`.

For ARM64 simulator builds on the MacBook Pro, override the inherited Intel-only exclusions with both `EXCLUDED_ARCHS=` and `'EXCLUDED_ARCHS[sdk=iphonesimulator*]='`, plus `ARCHS=arm64 ONLY_ACTIVE_ARCH=YES`. Use `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` so Xcode emits the simulated Keychain entitlements; an unsigned simulator app cannot exercise secure storage correctly. Use an isolated Metro port (8088 here), passing `-RCT_jsLocation localhost:8088` when launching with `simctl`.

No server changes were required for these fixes. The owner has authorized related endpoint improvements for subsequent app work. Product direction: make the app a welcoming place to establish identity, organize shared work, and keep useful records; prioritize clear actions and dependable recovery before expanding those workflows.

The final signed archive/export passed package verification and Apple validation. Apple accepted the upload at 2026-10-05 20:43 UTC, delivery `5375d321-dd3d-41fc-8c67-7f50c513a168`; processing completed with state `VALID`, internal beta state `IN_BETA_TESTING`, and availability in `MRTestGroup` verified. English test notes were saved and read back successfully. IPA: `artifacts/revival/ui-refresh/martianrepublic-1.0.5-1791226801.ipa`, SHA-256 `d0d1f685caabf3b3e089668b49f4568e58d517130a6302a1c1aafb010e252c7a`. Apple returned no errors and the same nonblocking future minimum-iOS warning as the first build.

Final archive: `/Users/ll/buildlogs/MarsWallet-1.0.5-20261005-ui-final-signed.xcarchive`; export: `/Users/ll/buildlogs/MarsWallet-1.0.5-20261005-ui-final/MartianRepublic.ipa`. The build command is `artifacts/revival/MarsWallet-ui-refresh.command`; verification and Apple processing reports are under `artifacts/revival/ui-refresh/`. The earlier `20261005-ui` draft was superseded before upload. No App Store review submission was made.

### Public release and horizontal Civic ID (2026-10-05)

The owner approved public release after the TestFlight check. The final release candidate is iOS 1.0.5, build `1791226802`. It preserves the upright Civic ID and adds a full-screen horizontal card, with one measured transform for the entire card. Safe-area spacing is respected and the card scales to smaller phones. A shared native-header action fixes the off-center menu dots in both wallet transaction screens and removes the duplicate background from the Save button. The civic-wallet clock/status icons use dark text on the pale header; wallet details use light text on black.

Validation: 94 tests in 12 suites pass. The new header component and Civic ID screen pass targeted lint, and `git diff --check` passes. iPhone 17 and iPhone SE simulator screenshots are retained in `artifacts/revival/design/release/`; Apple's Vision framework successfully decoded both horizontal QR codes. The upright card fits above the iPhone 17 tab bar. A fresh launch verified the actual civic-wallet menu and Save button, including their status-bar contrast. No production wallet, civic profile, vote, post, or payment was changed during these checks.

The source and all existing uncommitted work remain in this checkout. All 93 changed/new source files were matched to the MacBook Pro by SHA-256, excluding its previously documented host-specific Pod lock serialization. Build command: `artifacts/revival/MarsWallet-store-final.command`. Archive: `/Users/ll/buildlogs/MarsWallet-1.0.5-20261005-store-final-signed.xcarchive`. IPA: `artifacts/revival/store-release/martianrepublic-1.0.5-1791226802.ipa` (30,427,818 bytes; SHA-256 `93b03510b7a67884b3d2f88196d55e1e6b28dc3f68fa0728041328ec4febcc1a`). The earlier `20261005-store` draft was superseded before upload. All three bundle signatures, IDs, team, production entitlements, build/version numbers, profiles and final UI strings were verified. Apple package validation returned zero errors and the previously recorded future minimum-iOS warning.

App Store version `18f45c97-c63a-40ee-a0a3-b564c80640ba` was created with automatic release after approval. Existing store screenshots and reviewer details were preserved; English release notes and release-specific review guidance were saved. Review submission draft: `4a2351ec-18d6-4bd6-b14b-656045f55edb`. Apple accepted the upload at 22:39 UTC, delivery/build ID `059d77db-98b8-4615-b062-587288026241`; processing completed with `VALID`. The final build was attached to the version and the review submission contains exactly that version. The existing upload API key has a Developer role, so App Store version management uses the owner's existing authenticated App Store Connect browser session. No browser credentials or signing keys were copied.

Apple required completion of the newer age-rating questions before submission. The updated declaration accurately marks public posts/comments as messaging, user-generated content and social media. The app has no under-13 social restriction, parental controls, age-assurance mechanism, paid advertising, health/wellness feature or built-in weapons content. Existing other content declarations and rating overrides were preserved. The before/after declarations are retained in `artifacts/revival/store-release/`; the answers follow [Apple's definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and the actual forum implementation.

The final submission request initially returned an Apple server error. A subsequent retry succeeded at **2026-10-05 22:51:35 UTC**. Both the version and submission now report **WAITING_FOR_REVIEW**, and release type remains **AFTER_APPROVAL**. The build is also `IN_BETA_TESTING` in `MRTestGroup`, with its new English test notes verified. Evidence: `artifacts/revival/store-release/app-store-submission-report.json`, `review-submit-response.json`, `apple-upload.log`, `apple-processing.json`, and `package-report.json`. No second upload was made. Apple approval is still required before this update becomes publicly available.

Both temporary MarsWallet simulators, its Metro preview server and local SSH preview tunnel were stopped after verification; other projects' simulators and processes were left running. Source changes remain uncommitted.
