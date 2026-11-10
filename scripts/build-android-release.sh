#!/usr/bin/env bash
set -euo pipefail

# Build locally. This script does not upload or change a store listing.
# Inject signing values privately; passwords are never passed on a command line.
for name in MARS_UPLOAD_STORE_FILE MARS_UPLOAD_STORE_PASSWORD MARS_UPLOAD_KEY_ALIAS MARS_UPLOAD_KEY_PASSWORD MARS_VERSION_CODE; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required release setting: $name" >&2
    exit 1
  fi
done
if [[ "$MARS_UPLOAD_STORE_FILE" != /* || ! -f "$MARS_UPLOAD_STORE_FILE" ]]; then
  echo 'MARS_UPLOAD_STORE_FILE must point to an existing keystore using an absolute path.' >&2
  exit 1
fi
if [[ ! "$MARS_VERSION_CODE" =~ ^[1-9][0-9]{0,9}$ ]] || (( MARS_VERSION_CODE > 2100000000 )); then
  echo 'MARS_VERSION_CODE must be a valid positive Play version code, greater than the last uploaded build.' >&2
  exit 1
fi
case "${1:-aab}" in
  aab) task=bundleRelease; artifact=app/build/outputs/bundle/release/app-release.aab ;;
  apk) task=assembleRelease; artifact=app/build/outputs/apk/release/app-release.apk ;;
  *) echo 'Usage: build-android-release.sh [aab|apk]' >&2; exit 1 ;;
esac
cd "$(dirname "$0")/../android"
./gradlew "$task"
test -s "$artifact"
echo "Signed release artifact: android/$artifact"
