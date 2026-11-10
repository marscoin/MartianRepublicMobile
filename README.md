# Martian Republic mobile

The Marscoin wallet and citizenship app for [Martian Republic](https://martianrepublic.org), built on BlueWallet with React Native.

The active repository is [marscoin/MartianRepublicMobile](https://github.com/marscoin/MartianRepublicMobile), branch **MARS_NEW**. The original `YaninaLopin/MarsWallet` fork stops in May 2024; the continuation includes Yanina's later citizenship work and April 2026 updates.

[Download the published iOS app](https://apps.apple.com/us/app/martian-republic/id6480416861).

## Development

The current revival preserves Yanina's Expanse-inspired design and prioritizes **wallet and citizenship**, followed by Congress and broader website features. See [the revival notes](docs/REVIVAL.md) for source history, design references, verified API contracts, known issues and validation results.

The code currently uses React Native 0.72.11 and React 18.2.0. iOS builds use Xcode and CocoaPods; Android builds require the Android SDK. This branch is development work, not a release-ready upgrade.

```sh
git clone --branch MARS_NEW https://github.com/marscoin/MartianRepublicMobile.git
cd MartianRepublicMobile
npm ci --ignore-scripts
npm run postinstall
cd ios
pod install
cd ..
npm start
```

In a second terminal:

```sh
npx react-native run-ios --scheme BlueWallet-NoLDK --simulator "iPhone 16 Pro" --extra-params "ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES"
```

`BlueWallet-NoLDK` is the native target name; the installed app is **Martian Republic**, bundle ID `org.martianrepublic`. JavaScript's inherited package version and iOS's marketing version are separate. The old release-notes script may report that no Git tags exist in this fork.

## Checks

```sh
# Offline Marscoin recovery, signing, session and server-selection regression checks
npm run test:wallet

# Full inherited BlueWallet checks; known existing failures are tracked in revival notes
npm test
```

The focused wallet suite mocks native UI/storage dependencies and network access. It uses real wallet derivation and cryptography with public test vectors. Do not use those vectors for funds.

For Android development:

```sh
npm run android
```

## Design references

Published iPhone and iPad images are saved locally under `artifacts/revival/design/app-store/`, with their source URLs. Local review artifacts are ignored by Git. The revival notes distinguish published screenshots from simulator captures.

## Upstream and license

Originally forked from [BlueWallet](https://github.com/BlueWallet/BlueWallet). BlueWallet's Bitcoin/Lightning features and test coverage do not automatically establish Marscoin compatibility. Retain upstream attribution and the [MIT license](LICENSE).
