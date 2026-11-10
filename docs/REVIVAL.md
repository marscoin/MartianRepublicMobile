# Martian Republic mobile revival

Updated 2026-10-09. First milestone: wallet and citizenship. Preserve Yanina's visual direction, inspired by The Expanse and a future Martian society.

## November 9, evening: governance deployed, watchtower, proof of work

**Website, deployed** as `0cc04bf` ([PR #20](https://github.com/marscoin/martianrepublic/pull/20)). Backup of the affected tables and the previous revision: `/var/backups/governance-20261109/` on the Republic server.

- Ballot server: shuffle state per room, reset after each round; a round restarts if a voter leaves. Once three voters are ready it stays open 90 seconds for more (up to 12), so larger groups share one issuance. Restarted on the new code.
- Tally: a vote counts only if it spends exactly one 0.1 MARS ballot from an issuance funded by at least three distinct citizens, was mined while voting was open, and does not count a citizen twice (`scripts/vote_validation.py`). Existing votes untouched.
- Results: decided at the close of voting from quorum and tier threshold. `TEST_MODE` is off, so a sol is a day. Proposals 11 and 14, whose minute-long test windows had closed, are marked expired.
- Chain tracker: it had been idle since 2026-06-03 after a lost database connection (last block 3,486,514). Fixed, and now a single systemd service (`track_blockchain`) replacing two hand-started processes. It is replaying about 112,000 blocks; civic records published since June appear as it catches up.
- `pebas` (the site's chain-data service) was hung and was restarted. Its Electrum fallback still points at `147.182.177.23`, whose certificate has expired, so it may hang again.

**Wallet.**

- Watchtower client: once the agreed Bitcoin payment is in the contract, the phone registers a Marscoin claim signed except for the secret, and three Bitcoin refunds at rising fees valid only from the timelock. All pay only the wallet's own addresses. With the server side deployed, a swap completes with the phone off.
- Proof of work: the block holding the Marscoin lock and the block confirming it must carry valid merge-mined (AuxPoW, scrypt) work at a difficulty of at least 8,000 and link together (`blue_modules/swap/mars-headers.js`, tested on real mainnet headers).
- A Bitcoin payment still unconfirmed when the safe window closes is replaced by a higher-fee transaction back to the wallet.
- Ballot traffic: everything about the anonymous ballot address goes through `explore.marscoin.org`, not the wallet's Electrum connection, which knows the civic address. Both can still see the phone's IP address.
- Voting: the phone confirms with the registry that every participant in a round is a citizen before signing, spends exactly one ballot per vote, and shows rounds larger than three.

**Watchtower server.** Implemented in `~/Projects/marscoin-electrumx`, branch `watchtower`, commit `27d0234` (156 tests). **Not pushed or deployed.** RPCs `atomicswap.watch_register`, `atomicswap.watch_status`, `atomicswap.features`. The phone's package was validated against the server's `validate_package`. The live server (`explorer4`, `/home/electrumx/electrumx`, branch `atomicswap-abuse-controls` at `792811f`) has the dependencies it needs.

**iOS.** Version 1.0.7 (1794266284) passed Apple's package validation with no warnings and was uploaded to TestFlight on November 9, delivery `d4eb7e72-a9f9-4e71-b542-e645a9a5ce25`; package, logs and tester notes are in `artifacts/revival/voting-swaps-ios/`. No App Store review submission was made. Built on the MacBook Pro from `/Users/ll/Projects/MarsWallet-voting-swaps-20261109`. All wallet tests pass there. The ARM64 simulator build launched to the welcome screen and connected to Electrum with certificate validation on. Simulator `MarsWallet-voting-swaps`; logs under `/Users/ll/buildlogs/`.

Validation: 252 offline wallet tests, 26 screen tests, 159 website tests, 20 tracker tests, 156 Electrum server tests; live read-only checks including proof of work on the newest blocks; three- and five-voter rounds against the real ballot server locally.

Still open: no vote or swap has been made on mainnet; the ballot server can fill a round with its own participants (inherent in the protocol); full network-level ballot anonymity needs Tor; swap records are not backed up off the phone (the watchtower covers completion, not display).

## November 9: voting and Bitcoin swaps

Updated 2026-11-09. Two features were added in JavaScript only; no native module changed. Neither has run on a device yet, and no vote, swap or payment was made on any live network.

**Anonymous voting.** A proposal in its voting phase now has a Vote button leading to `screen/congress/ballot.js`. The phone joins the Republic's ballot shuffle (`wss://martianrepublic.org/wss/ballot`) using the same wire protocol as the website, so phones and browsers can share a round of three. Differences from the website, all deliberate:

- The ballot key is derived from the civic recovery phrase (`m/999999'/107'/<proposal>'`) instead of server-supplied randomness, and nothing about a ballot is sent to the Republic's web API or stored on the phone. Ballot state is read back from the chain.
- Before signing the joint transaction the phone checks that it issues its ballot and returns its change, and it signs once per round.
- It does not attach its shuffle key to its destination, and it does not post the vote to `/api/setfeed`, both of which link a vote to a citizen on the website.

**Bitcoin to Marscoin swaps.** `screen/swap/` adds an order book, a swap progress screen and a small Bitcoin wallet (BIP84, derived from the Marscoin wallet's recovery phrase, so the existing backup covers it). The engine is the taker side of the Electrum-Mars atomic swap plugin (`electrum-mars-new`, v4.4.3), ported to `blue_modules/swap/` and checked byte-for-byte against transactions produced by that plugin. Only this direction has liquidity today. Changes from the desktop client:

- The Bitcoin contract is read in every state, and each payment into it is followed to its spender individually, so a maker claim made while the app was closed, or buried under other transactions, is still found and the Marscoin claimed. The desktop client marks that swap failed.
- Claims and refunds sign for the amount actually in the contract. Refunds are automatic at the timelock, re-priced if fees rise, and also cover stray payments into a finished or cancelled swap.
- No single service is believed where money depends on it. The Marscoin height must agree between the relay and `explore.marscoin.org`, and the Bitcoin height between two Esplora services, before a timelock is judged. Raw transactions must hash to their IDs. The Marscoin lock must pass a Merkle check and be confirmed by the explorer node before payment is offered, and the swap is complete only when that node shows the claim in a block.
- Contract keys come from the recovery phrase (`m/1017'/0'/<n>'`); swap records hold no private keys.
- Swaps advance from the app root on every screen (`SwapWatcher` in `Navigation.tsx`), every 30 seconds and on return to the foreground. A wallet with an unfinished swap cannot be deleted.

An independent review of this code found fifteen swap and six voting problems, one critical (timelock safety resting on the relay's block height alone). All but the limits below were fixed and each fix has a regression test in `tests/wallet/swap-engine.test.js` ("against misbehaving services").

Known limits:

- The app must be open for a swap to progress; there is no background task or notification yet. After paying, the user has roughly four hours to reopen it before the Bitcoin refund is due and about seven before the Marscoin deadline.
- Headers are not checked for proof of work. A relay and explorer that were both dishonest could fake a Marscoin lock.
- A Bitcoin payment still unconfirmed when the safe window closes is not replaced or cancelled.
- Swap records live only on the phone. After a reinstall the recovery phrase restores the Bitcoin wallet but not an in-flight swap's contract details.
- Voting: the Marscoin server the wallet connects to sees queries for both the civic address and the ballot address from the same connection, so its operator could link them. The chain itself does not. The ballot server can also fill a round with its own participants; that is inherent in the current protocol.

**Electrum.** The default server is now `electrum.marscoin.org:50002`, which has a publicly trusted certificate and passes validation. `147.182.177.23` presents a certificate that expired on 2026-10-28 and `164.90.138.207` refuses connections; saved settings pointing at either on standard ports migrate to the default. This resolves the "authenticated live service" item below for one server. The Marscoin bech32 prefix was corrected from `M` to `mars`.

**Website findings.** These are in the sibling `martianrepublic` checkout or on the live server, and decide whether a mobile vote means anything:

- The ballot server kept shuffle state for the life of the process, so only the first round after a restart could complete. Reproduced locally; fixed in `ballotserver/server.py` and `ballot_shuffle.py` in the working tree (state per room, cleared after each round, round restarts if a voter leaves). **Not committed or deployed.** The live process has been up since March 28.
- The tally counts any transaction shaped like a vote. It does not check that the vote spends a ballot issued to a citizen, that voting is open, or one vote per ballot.
- `GovernanceTiers::TEST_MODE` is `true` in production: a sol is one minute, so voting windows last minutes.
- Nothing sets a proposal to passed or rejected; quorum is not computed.
- List and detail responses report `yay_percent` and `nay_percent` as zero when one side has no votes. The app computes percentages from counts.
- `pebas.marscoin.org`, which the website polls for ballot confirmation, timed out on November 9.

Validation: 230 offline wallet tests (112 before), 26 screen render tests, Android and iOS production JavaScript bundles, read-only live checks of the relay, order book, both Bitcoin services, cross-source heights and a Merkle proof against a merge-mined Marscoin header (`SWAP_LIVE=1`), and three-voter rounds against the real Python ballot server run locally (`BALLOT_SERVER_URL=ws://127.0.0.1:3679`). A native build was not attempted: 7.6 GB of disk was free.

## October 9: organizations and shared records

The next app version adds a civic home screen with identity, citizenship progress, invitations, assigned work, and saved drafts. Organization members can create tasks, assign work, and keep dated completion notes and up to four private photos per entry. Invitations require acceptance; only active members can read the workspace. Owners manage membership and archive groups. Records are append-only in this first version.

Draft text, pending writes, and downloaded workspace data are encrypted and authenticated locally with keys held in Keychain/Keystore. Photos remain in the app’s private files until shared. Writes receive durable server receipts, so a lost response can be retried with the same request ID. Conflicting task edits require review. Identity changes invalidate pending UI responses and edits.

The Laravel API is in the sibling `martianrepublic` checkout, branch `codex/organizations-and-records`. Its additive migration and API were deployed on October 9. Public website/feed checks pass, guests receive HTTP 401 for workspaces, and authenticated read checks pass using an existing authorized test account. No real organization invitations, posts, payments, endorsements, or applications were sent by this work. Prior server source is backed up at `/var/backups/marswallet-workspaces-20261009/prior-source.tar.gz`; restoring those four source files and rebuilding route/config caches disables the new API without deleting organization records. Preserve the new tables and private media when rolling back.

Endorsements now use the civic wallet’s reviewed fee and a saved transaction that can be retried after interruption. Civic upload endpoints enforce identity ownership, validate content and returned IPFS references, and preserve the previous profile on an upload failure. Signed API login now binds its timestamp and address to the signed message.

Electrum certificate validation is enabled by dependency patches. Android verifies both the certificate chain and the requested hostname. The installer handles fresh and repeated installations on macOS/Linux and fails on incompatible dependency changes. Native Android tests accept the valid Republic certificate and reject expired, self-signed, and wrong-host certificates. On the October 9 evening recheck, default `147.182.177.23:50002` became reachable but failed certificate validation with `DEPTH_ZERO_SELF_SIGNED_CERT`; the two former bundled hosts still refused connections. Restoring an authenticated live service remains necessary before publication/endorsement/payment checks can finish. The existing `bfmars` SSH identity was rejected, so server certificate repair could not proceed.

Native Android workflow passed against an isolated SQLite API with two test identities: recover a draft after restart, create an organization, invite and accept, assign a dated task, select a photo from Android’s picker, and complete the task with a note and photo. The activity log renders the private photo; the other member can retrieve the same image bytes. Database verification found exactly one organization, two active members, one task, one completion entry, and one attachment. Fixtures are kept out of the production app bundle.

Validation: 112 wallet tests; 171 Laravel tests (500 assertions); Laravel static analysis; changed-source lint; Android ARM64/x86_64 native build; iOS ARM64 simulator build and signed archive/export. Android startup also revealed and fixed the unavailable widget bridge being called before component mount. After the owner restored Tailscale, native iOS checks verified Keychain-backed encrypted drafts, recovery after app restart, identity separation, tamper rejection, and rejection of expired, self-signed, and wrong-host certificates. The valid certificate passed. Production startup reached the welcome screen with the expected Electrum connection error. Full physical iOS/Android citizenship checks remain outstanding.

Signed iOS 1.0.6 (1791595966) passed Apple's package validation with zero errors. Apple accepted its TestFlight upload on October 9; processing completed with `VALID` and availability in internal `MRTestGroup` was verified. No App Store review submission was made; 1.0.5 remains the approved public version. See [the iOS preview package and evidence](RELEASE.md#ios-106-preview).

## Source of truth

- Active mobile repository: https://github.com/marscoin/MartianRepublicMobile, branch `MARS_NEW`.
- Starting commit: `e94b84c62236ddca085ec5a972a6f249f42e138f` (2026-04-12). Includes Public Square, Congress, and the complete three-step citizenship UI.
- This workspace's development branch: `codex/wallet-citizenship-refresh`.
- `origin` still points to Yanina's historical fork. `marscoin` points to the continuation repository.
- Yanina's fork stops at `5dc32820` (2024-05-02). The sibling `MarsWallet_new` checkout is also older; it is not the source for this revival.
- App Store release: 1.0.5, approved and ready for sale as verified on 2026-10-07, bundle identifier `org.martianrepublic`, app ID `6480416861`. Seller **EULER'S IDENTITY, LLC**, confirmed by the owner and Apple's public listing.
- The current iOS source carries base version 1.0.5; the October 9 preview command overrides it with 1.0.6 (1791595966). Later builds need a fresh build number. The JavaScript package reports the inherited BlueWallet version 6.5.9; those are different version fields.
- Current website source: https://github.com/marscoin/martianrepublic. The October 9 workspace changes build on `a84b4ef` in the sibling checkout. It is Laravel, separate from the older Next.js experiment in `martianrepublic-alt`.

## Design baseline

Nine official App Store images were downloaded, with provenance in `artifacts/revival/design/app-store/sources.json`. Five iPhone and two iPad images were visually reviewed. These are published marketing screenshots. Local simulator captures are now also available under `artifacts/revival/design/simulator/`: `onboarding.png`, `civic-import.png`, and `civic-restored.png`. The restored view includes the successful-import alert over the citizen directory.

Preserve:

- Black backgrounds, white text, orange primary controls and orange gradients.
- Geometric typography: original Orbitron, plus Chakra Petch introduced in April 2026.
- Wallet cards with Martian landscape imagery; a distinct civic identity card.
- Orange/green transaction direction icons, a central QR scan control, and the Citizen / Wallet structure.
- The futuristic civic identity theme rather than a generic finance dashboard.

Improve errors, loading, recovery and legibility within that design. Review local simulator screenshots before changing layout or typography.

## Live integration checks

Public reads and owner-authorized bot-account authentication were performed. No wallet was funded, transaction broadcast, vote cast, citizenship application submitted, account created, or message posted.

- The existing Valles Marineris and Olympus Mons test recovery phrases derive their documented civic addresses. Both signed `/api/token` logins returned HTTP 200 and active sessions; authenticated `/api/eula`, `/api/forum/categories/threads`, and `/api/mstatus` reads returned HTTP 200 for both.
- Valles Marineris was restored in the local simulator through the civic discovery route, invoked directly through the app debugger. After terminating and relaunching the app: one wallet persisted, the civic address matched, an API session was present, authenticated `/api/mstatus` returned 200, and the obsolete plaintext mnemonic entry was absent. This does not validate every manual import-screen interaction.
- Test-account locations are indexed in the owner’s shared `/Users/novalis78/CREDENTIALS.md`; recovery phrases and API tokens are excluded from this repository and its artifacts.
- `GET /api/feed/citizen?page=1`: HTTP 200; a bare array (18 entries at the check).
- `GET /api/feed/public?page=1`: HTTP 200; a bare array (17 entries).
- `GET /api/feed/applicant?page=1`: HTTP 200; a pagination object with `data`, `current_page`, `last_page`, `per_page`, and `total`.
- `https://price.marscoin.org/json/`: HTTP 200; `{ data, status }`.
- The bundled `161.35.136.251` refused both Electrum ports. `164.90.138.207` also refused TLS.
- `147.182.177.23` is published by the official Electrum-Mars project and responded to `server.version`, `server.features`, and `blockchain.headers.subscribe`. Reported ElectrumX 1.16.0 / protocol 1.4 and block 3,563,854.
- Reported genesis matches the official Marscoin mainnet value: `06e005f86644f15d2e4c62b59a038c798a3b0816ba58dcc8c91e02ce5a685299`.
- At the September check its TLS endpoint used a self-signed certificate and the inherited client disabled validation. The October work above enables verification. The endpoint was reachable again on the October 9 evening recheck, but its self-signed certificate was rejected; an authenticated connection remains unavailable.

## First changes

- Removed the civic import screen’s recovery-phrase log as well as wallet debug output, including recovery phrases, derived seeds, signing keypairs, and UTXO objects containing private keys. Removed backup-screen and civic-token logging. Also removed UTXO logs from the citizenship submission and legacy wallet unwrap paths, and token-bearing request configuration from the terms-service errors.
- Stopped saving an extra civic recovery phrase in AsyncStorage. Remove the legacy duplicate once wallets initialize; the canonical wallet store is retained.
- An inactive Republic account now invalidates only its API session. Removed the account-status callback that deleted every local wallet.
- Skip civic sign-in when no civic wallet exists. Sign login with the wallet’s own index-zero key, preserving optional BIP39 passphrases and the website’s existing message envelope. Avoid logging signed Axios request/error objects.
- Use Marscoin-only discovery for ordinary and civic restoration. The generic inherited importer continued into Bitcoin discovery after finding Marscoin and failed on a missing `_zpubToXpub` instance method. Civic restoration now returns the Marscoin wallet, keeps the civic address fixed at index zero, and respects cancellation. Ordinary wallet restoration now uses the same Marscoin-only discovery service.
- Restore the default Electrum endpoint using the verified official server. Migrate the two former bundled IPs on standard ports while retaining custom server settings. Validate mainnet genesis during connection setup.
- Remove unused `bip84` and `litecore-lib` imports that are absent from declared dependencies.
- Fetch the exact existing rn-ldk commit as an integrity-locked source archive. Installing its Git ref otherwise runs a legacy `bob build` using TypeScript 4 against current Node typings and fails. The application no longer imports the removed compiled LDK JS entrypoints; the NoLDK iOS target remains the build target.
- Added offline wallet/session/network regression tests (`npm run test:wallet`). Native UI/storage and networking are mocked in the cryptography tests; the Marscoin implementation and cryptographic libraries are real.

## Wallet and citizenship implementation pass

- Ordinary import waits for secure wallet persistence before showing success. Storage failure returns a retryable error and removes only the newly staged in-memory wallet. Existing wallets remain available.
- Completed change-address discovery. Failed history lookups no longer count as unused addresses. Receive balance polling and send confirmation use the Marscoin connection. Network queries require successful mainnet verification; initial connection waits now have a deadline.
- Payment requests have a strict Marscoin parser and encoder, with exact atomic amounts, eight-decimal validation, malformed/duplicate-field rejection and round-trip coverage. Both send routes accept amount-bearing QR requests. Copying a custom receive request includes its amount and memo.
- Removed the hidden 100× fee multiplier from signing and the corresponding inflated preview labels. Fees use zubrins per byte consistently. OP_RETURN records are included in coin selection's fee estimate; transaction sequences are applied. Previous transaction hex is checked against the requested txid.
- Amount entry and denomination switching now use Marscoin/zubrins and the Marscoin USD rate. Fractional zubrins and a ninth MARS decimal place are rejected. The citizen directory's payment action opens the shared send flow instead of a second, stale transaction implementation.
- Civic bearer tokens use device Keychain/Keystore entries bound to the civic address. Legacy plaintext tokens are removed. Concurrent logins share one request; account switches reject stale responses; HTTP 401 invalidates the matching session and exposes retry. No automatic retry of a civic mutation occurs.
- Removed automatic clipboard reads during startup/resume. Terms have an explicit review action and visible save errors. Payment-alert permission is requested through an explicit control on the receive screen.
- Photo/video upload failures now propagate, uploaded IPFS references are validated and returned, and screen transitions wait for success. Encrypted application drafts retain form fields and completed upload references. Android camera/audio permission results are checked individually.
- Application publication requires a fee review and explicit confirmation. Prepared and uncertain transactions are persisted; retry sends the same signed transaction. A lost broadcast acknowledgement is checked against the exact txid. The success screen describes submission awaiting blockchain confirmation.
- First visual refinements: quieter inactive citizen tabs, larger touch targets, a civic-service status card, and a payment review panel showing the fee and total. See [the design direction](DESIGN_DIRECTION.md) for the owner's vision and the broader visual work still ahead.

## Next milestones

The owner has requested releases on **both Apple App Store and Google Play**. See [release preparation](RELEASE.md) for checked SDK requirements, signing gaps, and the deployed website video patch.

1. Complete physical Android testing, especially small-screen layout, camera/microphone permissions, photo/video capture, upload interruption and process restarts. The October organization workflow and TLS checks passed on an isolated Android API 34 emulator; physical-device coverage remains open.
2. Validate the full citizenship journey against a controlled test environment, including actual media uploads, publication confirmation and endorsements. The existing bot profiles were not used for a live publication. Public directory payments share the corrected wallet flow; endorsements now use reviewed fees and durable transaction recovery, with live validation still pending.
3. Restore an authenticated live Electrum service and verify it on devices before the next release. Client certificate and hostname checks are now implemented and have passed native Android negative-certificate tests.
4. Resolve inherited TypeScript/lint errors, review native dependency upgrades and test wallet backup/restore on physical devices. The owner restored Tailscale access to the release MacBook Pro at `100.100.47.81`; signed iOS 1.0.6 (1791595966) now passes package validation. Version 1.0.5 was approved on October 7; the new build is available in TestFlight for `MRTestGroup`. It has not been submitted for App Store review.
5. Continue the coordinated design pass across wallet overview, civic ID and application screens, with Android as a primary target. Congress and voting follow the wallet/citizenship milestone.

## Validation

See the latest results recorded below. A successful JavaScript bundle or unit suite alone does not establish native runtime or release readiness.

- `npm install --ignore-scripts` and the existing postinstall/patches completed after pinning rn-ldk's source archive.
- `pod install` completed: 87 Podfile dependencies / 90 pods. Its inherited bitcode cleanup lists some nonexistent framework slices; those reported warnings are separate from install success.
- iOS development JavaScript bundle: passed, 72 assets copied.
- Focused offline suite: 62 tests passed across seven suites, including real transaction signature verification and recovery vectors with/without a passphrase.
- ESLint on new service/test files: passed without warnings.
- Whole-project TypeScript: 169 errors, versus 176 in the untouched `e94b84c6` baseline using the same installed dependencies. No added diagnostics after normalizing source line numbers. These inherited errors remain release work.
- Native simulator build: **passed** with Xcode 16.4 / iOS 18.5, scheme `BlueWallet-NoLDK`, explicit x86_64 architecture. The app excludes arm64, so a default arm64 destination mismatches the Pods.
- Simulator installation, launch, ordinary and civic restoration, persistence after restart, and authenticated status read: **passed**. Build with local ad-hoc signing enabled; disabling signing caused Keychain entitlement errors. No Apple Developer account, provisioning profile, App Store upload, or upstream Git push was used.

Verified native build command (use an available simulator UUID):

```sh
xcodebuild -workspace ios/BlueWallet.xcworkspace -scheme BlueWallet-NoLDK \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=BD4BBEEB-C3A6-4E86-9785-2778CC6D2981,arch=x86_64' \
  -derivedDataPath /private/tmp/marswallet-derived \
  ARCHS=x86_64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES build
```

Sanitized local results: `artifacts/revival/wallet-tests.txt`, `bot-login-report.txt`, and `simulator-status.txt`. Recovery phrases were checked against the Metro log and were absent. For future account entry, target the simulator runtime or a device-specific test driver; foreground desktop typing was unreliable and once reached the owner’s terminal during this session.

### Latest simulator evidence

- Valles remains the civic wallet. Olympus was imported through the ordinary discovery route. Both wallets persisted after restart; their transaction histories contained five and two records respectively at the check.
- The civic session still returned authenticated HTTP 200 after restart, with both legacy plaintext entries absent.
- A Marscoin payment link populated the exact 10,001-zubrin amount. The simulator prepared a signed transaction and reached confirmation with a 1,356-zubrin fee. No broadcast button was pressed.
- The edited amount input retained the recipient address. Native permission dialogs and development notices were inspected during capture; diagnostic screenshots are kept separately from the final reference captures.
- Final reference captures are under `artifacts/revival/design/simulator/`, including `payment-confirmation.png` and `ordinary-receive.png`. Screenshots illustrate simulator behavior; they do not establish Android or production readiness.

- Native amount entry and the full MARS → zubrins → USD → MARS cycle retained 20,002 zubrins and the destination. A second confirmation preview showed 20,002 zubrins plus the same 1,356-zubrin network fee; it was not broadcast.

- The changed source files and Metro log were scanned for the actual documented test recovery phrases; no matches were found. Final service/test lint and `git diff --check` pass. Test transaction screens were closed after review.

### Release preparation pass

- Added the missing Android microphone permission and removed ignored video-compression options. Recording is bounded to 60 seconds / 5 MB, upload size is checked, and permission/recording/upload failures are visible.
- Initial checks found the live website rejected native MP4/MOV uploads without changing either bot profile. The website fix and regression test are now deployed; successful media storage still needs controlled validation.
- Removed hardcoded Android upload passwords, added a private-input AAB/APK build script, and corrected the draft Play listing text. No signing key was changed and no build uploaded.
- Latest focused suite: **67 tests / eight suites passed**. Android production JavaScript bundle passed. See the release document for native/store blockers.

- Native Android debug build was stopped during setup when free disk space fell to about 1.6 GB with heavy system swap use. No APK/AAB was produced. iOS simulator restart still retained both wallets and an authenticated civic session.

### Website deployment and Omarchy setup

- Website PR #18 merged and deployed as `a84b4ef`; all GitHub checks passed and 149 PHP tests / 328 assertions passed in isolated testing. Live negative upload checks confirm native formats reach MIME validation and the bot profile remains unchanged.
- Omarchy is connected through the dedicated SSH key. Current mobile source, Node 22, Java 17, SDKs 34/36, NDK 23.1, CMake and ADB are installed; all 67 wallet/civic/media tests and the native ARM64 debug build passed on Linux.
- The 38 MiB Android development APK has a verified debug signature and the existing `com.martianrepublic.app` identity. It requires Metro; no Android device/emulator runtime check has occurred. The APK audit found 62 of 64 native libraries below 16 KB ELF alignment, confirming the dependency-upgrade work still needed for Play. See `artifacts/revival/android-apk-report.json` and the release document for the reproducible build command.
- Signing files were found in the older mobile checkout and certificate/profile archives. The older identities/profiles were expired. The owner then created an Apple Distribution certificate and matching App Store Connect profile for Euler's Identity, valid until 2027-09-21. Both are installed on the Mac, with the certificate's matching private key present in the login keychain. The active app and UI-test targets use the confirmed team `DT653ML2L2`, verified in resolved Xcode Release settings. The profile's app ID, distribution type, production push entitlement and certificate match were verified; local export options are prepared. A signed archive/export is still unvalidated. No private signing key was exported or copied to Omarchy.
