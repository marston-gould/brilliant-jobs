#!/usr/bin/env bash
# upload-pdl-filtered.sh — PDL Industry Enrichment Pipeline Step 2a
# =================================================================
# Upload filtered-companies.json to Supabase Storage bucket pdl-enrichment.
#
# Prerequisites:
#   1. Run filter-pdl.py first to generate filtered-companies.json
#   2. Create Supabase Storage bucket 'pdl-enrichment' (private, service-role only)
#      via Dashboard → Storage → New Bucket → name: pdl-enrichment, NOT public
#
# Usage:
#   bash scripts/upload-pdl-filtered.sh [path-to-filtered-file]

set -euo pipefail

SUPABASE_URL="https://qojhagupdnbtomfoxnsf.supabase.co"
BUCKET="pdl-enrichment"
OBJECT_PATH="filtered-companies.json"

# Service role key — required for private bucket writes
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY must be set"
  echo ""
  echo "Export it before running:"
  echo "  export SUPABASE_SERVICE_ROLE_KEY='eyJhb...'"
  exit 1
fi

FILE="${1:-filtered-companies.json}"

if [ ! -f "$FILE" ]; then
  echo "Error: File not found: $FILE"
  echo "Run filter-pdl.py first to generate the filtered file."
  exit 1
fi

FILE_SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE" 2>/dev/null)
echo "[upload-pdl] File:   $FILE ($(echo "scale=1; $FILE_SIZE / 1048576" | bc) MB)"
echo "[upload-pdl] Target: $SUPABASE_URL/storage/v1/object/$BUCKET/$OBJECT_PATH"
echo ""

# Upload via Supabase Storage REST API (upsert mode)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "x-upsert: true" \
  --data-binary "@$FILE" \
  "$SUPABASE_URL/storage/v1/object/$BUCKET/$OBJECT_PATH")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "[upload-pdl] ✓ Upload succeeded (HTTP $HTTP_CODE)"
  echo "[upload-pdl] File available at: $BUCKET/$OBJECT_PATH"
else
  echo "[upload-pdl] ✗ Upload failed (HTTP $HTTP_CODE)"
  echo ""
  echo "Troubleshooting:"
  echo "  - Verify bucket 'pdl-enrichment' exists in Supabase Dashboard → Storage"
  echo "  - Verify SUPABASE_SERVICE_ROLE_KEY is correct"
  echo "  - If file > 50 MB, upload may time out. Try splitting or compressing."
  exit 1
fi
