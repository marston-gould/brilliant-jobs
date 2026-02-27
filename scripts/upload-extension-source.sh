#!/bin/bash
# upload-extension-source.sh — Upload canonical extension source to Supabase Storage
# Phase 12: Build Fingerprint Obfuscation
#
# This script uploads all extension source files to the 'extension-source' bucket
# under a versioned prefix (e.g., v4/). The build-extension Edge Function reads
# from this bucket to generate per-user fingerprinted builds.
#
# Usage: ./upload-extension-source.sh
# Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars (or edit below)

set -euo pipefail

SB_URL="${SUPABASE_URL:-https://qojhagupdnbtomfoxnsf.supabase.co}"
SB_KEY="${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2OTA2NiwiZXhwIjoyMDg2MTQ1MDY2fQ._wuo4yuVmqM_x3PhOPLkfBwDrlpXcH62NZk7wX2q5tM}"
BUCKET="extension-source"
VERSION_PREFIX="v4"
EXT_DIR="extension"

echo "📦 Uploading extension source to Supabase Storage..."
echo "   Bucket: $BUCKET | Prefix: $VERSION_PREFIX"

# Source files to upload
JS_FILES=(
  background.js
  contentScript.js
  content.js
  popup.js
  supabase.js
  human-sim.js
  interceptor.js
  interceptor-bridge.js
  popup-bridge.js
  popup-post.js
  handlers/lever.js
  handlers/greenhouse-legacy.js
  handlers/greenhouse-react.js
  handlers/ashby.js
  handlers/workable.js
  handlers/recruitee.js
  handlers/linkedin-easy-apply.js
  handlers/indeed.js
  handlers/workday.js
  utils/originGuard.js
  utils/crypto.js
  utils/tierGate.js
  utils/jdMatcher.js
  utils/autoTracker.js
  utils/fieldFillerQueue.js
  utils/fileUpload.js
  utils/mutationWatcher.js
  utils/reactProps.js
  utils/applicationTracker.js
  fields/textInput.js
  fields/dropdown.js
  fields/dateFields.js
  fields/checkbox.js
  fields/radioGroup.js
  fields/dropdownSearchable.js
)

OTHER_FILES=(
  manifest.json
  inject.css
  popup.html
  help.html
  version.json
)

IMAGE_FILES=(
  icon16.png
  icon48.png
  icon128.png
)

upload_file() {
  local file="$1"
  local mime="$2"
  local path="${VERSION_PREFIX}/${file}"
  local full_path="${EXT_DIR}/${file}"

  if [ ! -f "$full_path" ]; then
    echo "   ⚠ SKIP: $full_path not found"
    return
  fi

  # Supabase Storage upload via REST API
  curl -s -X POST \
    "${SB_URL}/storage/v1/object/${BUCKET}/${path}" \
    -H "Authorization: Bearer ${SB_KEY}" \
    -H "Content-Type: ${mime}" \
    -H "x-upsert: true" \
    --data-binary "@${full_path}" \
    -o /dev/null -w "   ✓ %{http_code} ${path}\n"
}

# Upload JS files
for f in "${JS_FILES[@]}"; do
  upload_file "$f" "application/javascript"
done

# Upload other files
for f in "${OTHER_FILES[@]}"; do
  ext="${f##*.}"
  case "$ext" in
    json) mime="application/json" ;;
    css)  mime="text/css" ;;
    html) mime="text/html" ;;
    *)    mime="text/plain" ;;
  esac
  upload_file "$f" "$mime"
done

# Upload images
for f in "${IMAGE_FILES[@]}"; do
  upload_file "$f" "image/png"
done

echo ""
echo "✅ Extension source uploaded to ${BUCKET}/${VERSION_PREFIX}/"
echo "   The build-extension Edge Function can now generate fingerprinted builds."
