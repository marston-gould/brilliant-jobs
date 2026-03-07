#!/bin/bash
# ============================================================
# Brilliant Jobs — Version Discipline Pre-Commit Hook (v2)
# ============================================================
# Session 11: Enhanced to check ALL HTML cache busters globally.
# Previous version only checked 6 surfaces; Session 10 revealed
# 11 additional files that had drifted. This version prevents
# that class of bug entirely.
#
# Install:
#   cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Reference: VERSION_METHODOLOGY.docx
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "🔍 Version discipline check (v2 — global cache buster scan)..."
echo ""

# ── Extract source of truth from version.js ──
VERSION_FILE="js/version.ts"
if [ ! -f "$VERSION_FILE" ]; then
  echo -e "${RED}✗ FAIL:${NC} $VERSION_FILE not found"
  exit 1
fi

SOURCE_VERSION=$(grep -o "BJ_VERSION = 'v[0-9.]*'" "$VERSION_FILE" | grep -o "v[0-9.]*")
if [ -z "$SOURCE_VERSION" ]; then
  echo -e "${RED}✗ FAIL:${NC} Could not extract BJ_VERSION from $VERSION_FILE"
  exit 1
fi

NUMERIC_VERSION=$(echo "$SOURCE_VERSION" | sed 's/^v//')

echo -e "   Source of truth: ${GREEN}${SOURCE_VERSION}${NC} (from $VERSION_FILE)"
echo ""

ERRORS=0
WARNINGS=0

# ── Helper function ──
check_surface() {
  local file="$1"
  local description="$2"
  local pattern="$3"
  local expected="$4"

  if [ ! -f "$file" ]; then
    echo -e "   ${YELLOW}⚠ SKIP:${NC} $file not found — $description"
    return
  fi

  if grep -q "$expected" "$file"; then
    echo -e "   ${GREEN}✓${NC} $description"
  else
    local actual=$(grep -o "$pattern" "$file" | head -1)
    if [ -z "$actual" ]; then
      actual="(pattern not found)"
    fi
    echo -e "   ${RED}✗ FAIL:${NC} $description"
    echo -e "          Expected: ${GREEN}${expected}${NC}"
    echo -e "          Found:    ${RED}${actual}${NC}"
    ERRORS=$((ERRORS + 1))
  fi
}

# ── Core surfaces ──
echo "   ── Core Version Surfaces ──"
echo -e "   ${GREEN}✓${NC} js/version.js — BJ_VERSION = '${SOURCE_VERSION}'"

check_surface "dashboard.html" \
  "dashboard.html — HTML comment" \
  "Brilliant Jobs Dashboard v[0-9.]*" \
  "Brilliant Jobs Dashboard ${SOURCE_VERSION}"

check_surface "index.html" \
  "index.html — HTML comment" \
  "Brilliant Jobs Landing Page v[0-9.]*" \
  "Brilliant Jobs Landing Page ${SOURCE_VERSION}"

check_surface "admin.html" \
  "admin.html — HTML comment" \
  "Brilliant Jobs Admin Console v[0-9.]*" \
  "Brilliant Jobs Admin Console ${SOURCE_VERSION}"

check_surface "compare.html" \
  "compare.html — HTML comment" \
  "Brilliant Jobs Competitor Comparison v[0-9.]*" \
  "Brilliant Jobs Competitor Comparison ${SOURCE_VERSION}"

# ── dist/dashboard.min.js ──
if [ -f "dist/dashboard.min.js" ]; then
  if grep -q "${SOURCE_VERSION}" "dist/dashboard.min.js"; then
    echo -e "   ${GREEN}✓${NC} dist/dashboard.min.js — contains ${SOURCE_VERSION}"
  else
    FOUND_IN_DIST=$(grep -o "v[0-9]\.[0-9]*" "dist/dashboard.min.js" | sort -u | head -3 | tr '\n' ', ')
    echo -e "   ${RED}✗ FAIL:${NC} dist/dashboard.min.js — missing ${SOURCE_VERSION}"
    echo -e "          Found versions: ${RED}${FOUND_IN_DIST}${NC}"
    echo -e "          Run: ${YELLOW}node build.js${NC} to rebuild"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "   ${YELLOW}⚠ SKIP:${NC} dist/dashboard.min.js not found"
fi

# ── Global cache buster scan (Session 11 enhancement) ──
echo ""
echo "   ── Global Cache Buster Scan ──"

for html_file in *.html; do
  # Skip tiny redirect files
  line_count=$(wc -l < "$html_file" 2>/dev/null || echo 0)
  if [ "$line_count" -lt 20 ]; then
    continue
  fi

  # Find any ?v= params in this file
  STALE_BUSTERS=$(grep -oP '\?v=v?\K[0-9.]+' "$html_file" 2>/dev/null | sort -u | grep -v "^${NUMERIC_VERSION}$" || true)

  if [ -n "$STALE_BUSTERS" ]; then
    for stale in $STALE_BUSTERS; do
      # Get the context of the stale buster
      CONTEXT=$(grep -n "?v=v\?${stale}" "$html_file" | head -3 | while read -r line; do
        echo "          $(echo "$line" | sed 's/^\([0-9]*\):.*/L\1/' | head -c6) $(echo "$line" | grep -oP '[^/"]*\?v=v?[0-9.]+[^"]*' | head -1)"
      done)
      echo -e "   ${RED}✗ FAIL:${NC} ${html_file} — stale cache buster ?v=${stale} (expected ${NUMERIC_VERSION})"
      echo "$CONTEXT"
      ERRORS=$((ERRORS + 1))
    done
  else
    HAS_BUSTERS=$(grep -c '?v=' "$html_file" 2>/dev/null || echo 0)
    if [ "$HAS_BUSTERS" -gt 0 ]; then
      echo -e "   ${GREEN}✓${NC} ${html_file} — ${HAS_BUSTERS} buster(s) at ${SOURCE_VERSION}"
    fi
  fi
done

# ── Footer checks ──
echo ""
echo "   ── Footer & Version Span Checks ──"

for html_file in *.html; do
  line_count=$(wc -l < "$html_file" 2>/dev/null || echo 0)
  if [ "$line_count" -lt 20 ]; then continue; fi
  case "$html_file" in
    roadmap.html|dashboard.html|404.html|503.html|parkinglot.html|survey.html) continue ;;
  esac
  has_vjs=$(grep -c "version.js" "$html_file" 2>/dev/null || echo 0)
  has_bjv=$(grep -c "bj-version" "$html_file" 2>/dev/null || echo 0)
  if [ "$has_vjs" -gt 0 ] && [ "$has_bjv" -eq 0 ]; then
    echo -e "   ${RED}✗ FAIL:${NC} $html_file — loads version.js but has no .bj-version span"
    ERRORS=$((ERRORS + 1))
  fi
  has_copy=$(grep -c "©\|&copy;" "$html_file" 2>/dev/null || echo 0)
  has_bjyear=$(grep -c "bj-year" "$html_file" 2>/dev/null || echo 0)
  if [ "$has_copy" -gt 0 ] && [ "$has_bjyear" -eq 0 ]; then
    echo -e "   ${RED}✗ FAIL:${NC} $html_file — has copyright but no .bj-year span"
    ERRORS=$((ERRORS + 1))
  fi
done

# ── api/seo-page.js ──
if [ -f "api/seo-page.js" ]; then
  stale_versions=$(grep -n "· v[0-9]\.[0-9]*" "api/seo-page.js" | grep -v "bj-version\|version\.js\|//" || true)
  if [ -n "$stale_versions" ]; then
    echo -e "   ${RED}✗ FAIL:${NC} api/seo-page.js — hardcoded version found"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "   ${GREEN}✓${NC} api/seo-page.js — no hardcoded versions"
  fi
fi

# ── Result ──
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  VERSION MISMATCH — COMMIT BLOCKED                  ║${NC}"
  echo -e "${RED}║  ${ERRORS} surface(s) out of sync with ${SOURCE_VERSION}              ║${NC}"
  echo -e "${RED}║  Run: bash scripts/bump-version.sh ${NUMERIC_VERSION}            ║${NC}"
  echo -e "${RED}║  See VERSION_METHODOLOGY.docx for the full list.    ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
else
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✓ All version surfaces in sync: ${SOURCE_VERSION}              ║${NC}"
  echo -e "${GREEN}║    Includes global cache buster scan (v2)           ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 0
fi
