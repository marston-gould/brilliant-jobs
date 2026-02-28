#!/bin/bash
# ============================================================
# Brilliant Jobs — Version Discipline Pre-Commit Hook
# ============================================================
# Ensures all 7 version surfaces are in sync before allowing
# a commit. Install by copying or symlinking to .git/hooks/pre-commit
#
# Install:
#   cp scripts/pre-commit-version-check.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Surfaces checked:
#   1. js/version.js          — var BJ_VERSION = 'vX.XX';
#   2. dashboard.html         — <!-- Brilliant Jobs Dashboard vX.XX -->
#   3. dashboard.html         — dashboard.min.js?v=X.XX
#   4. dashboard.html         — styles.css?v=X.XX
#   5. index.html             — <!-- Brilliant Jobs Landing Page vX.XX -->
#   6. dist/dashboard.min.js  — BJ_VERSION='vX.XX' (in minified bundle)
#   7. Console log             — [BJ] Dashboard vX.XX loaded (via version.js)
#
# Surface 7 is implicit (driven by version.js at runtime), so we
# check surfaces 1–6 at commit time.
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "🔍 Version discipline check..."
echo ""

# ── Extract source of truth from version.js ──
VERSION_FILE="js/version.js"
if [ ! -f "$VERSION_FILE" ]; then
  echo -e "${RED}✗ FAIL:${NC} $VERSION_FILE not found"
  exit 1
fi

# Extract version string (e.g., "v5.67")
SOURCE_VERSION=$(grep -o "BJ_VERSION = 'v[0-9.]*'" "$VERSION_FILE" | grep -o "v[0-9.]*")
if [ -z "$SOURCE_VERSION" ]; then
  echo -e "${RED}✗ FAIL:${NC} Could not extract BJ_VERSION from $VERSION_FILE"
  exit 1
fi

# Extract numeric version (e.g., "5.67")
NUMERIC_VERSION=$(echo "$SOURCE_VERSION" | sed 's/^v//')

echo -e "   Source of truth: ${GREEN}${SOURCE_VERSION}${NC} (from $VERSION_FILE)"
echo ""

ERRORS=0

# ── Check function ──
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
    # Show what's actually there
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

# ── Surface 1: version.js (already extracted, always passes) ──
echo -e "   ${GREEN}✓${NC} js/version.js — BJ_VERSION = '${SOURCE_VERSION}'"

# ── Surface 2: dashboard.html comment ──
check_surface "dashboard.html" \
  "dashboard.html — HTML comment" \
  "Brilliant Jobs Dashboard v[0-9.]*" \
  "Brilliant Jobs Dashboard ${SOURCE_VERSION}"

# ── Surface 3: dashboard.html JS cache-bust ──
check_surface "dashboard.html" \
  "dashboard.html — JS cache-bust param" \
  "dashboard.min.js?v=[0-9.]*" \
  "dashboard.min.js?v=${NUMERIC_VERSION}"

# ── Surface 4: dashboard.html CSS cache-bust ──
check_surface "dashboard.html" \
  "dashboard.html — CSS cache-bust param" \
  "styles.css?v=[0-9.]*" \
  "styles.css?v=${NUMERIC_VERSION}"

# ── Surface 5: index.html comment ──
check_surface "index.html" \
  "index.html — HTML comment" \
  "Brilliant Jobs Landing Page v[0-9.]*" \
  "Brilliant Jobs Landing Page ${SOURCE_VERSION}"

# ── Surface 6: dist/dashboard.min.js ──
if [ -f "dist/dashboard.min.js" ]; then
  if grep -q "BJ_VERSION='${SOURCE_VERSION}'\|BJ_VERSION=\"${SOURCE_VERSION}\"" "dist/dashboard.min.js" 2>/dev/null || \
     grep -q "=\"${SOURCE_VERSION}\"" "dist/dashboard.min.js" 2>/dev/null; then
    echo -e "   ${GREEN}✓${NC} dist/dashboard.min.js — contains ${SOURCE_VERSION}"
  else
    # The minifier may mangle the variable assignment — check if the version string appears at all
    if grep -q "${SOURCE_VERSION}" "dist/dashboard.min.js"; then
      echo -e "   ${GREEN}✓${NC} dist/dashboard.min.js — contains ${SOURCE_VERSION} (minified)"
    else
      FOUND_IN_DIST=$(grep -o "v[0-9]\.[0-9]*" "dist/dashboard.min.js" | sort -u | head -3 | tr '\n' ', ')
      echo -e "   ${RED}✗ FAIL:${NC} dist/dashboard.min.js — missing ${SOURCE_VERSION}"
      echo -e "          Found versions: ${RED}${FOUND_IN_DIST}${NC}"
      echo -e "          Run: ${YELLOW}node build.js${NC} to rebuild"
      ERRORS=$((ERRORS + 1))
    fi
  fi
else
  echo -e "   ${YELLOW}⚠ SKIP:${NC} dist/dashboard.min.js not found"
fi

# ── Surface 7: All HTML pages with version.js must have .bj-version span ──
echo ""
echo "   Checking version.js + bj-version span consistency..."
for html_file in *.html; do
  # Skip redirect-only files (< 20 lines)
  line_count=$(wc -l < "$html_file")
  if [ "$line_count" -lt 20 ]; then
    continue
  fi
  # Skip pages that don't need a footer version display
  case "$html_file" in
    roadmap.html|dashboard.html|404.html|503.html|parkinglot.html|survey.html)
      continue
      ;;
  esac
  has_vjs=$(grep -c "version.js" "$html_file")
  has_bjv=$(grep -c "bj-version" "$html_file")
  if [ "$has_vjs" -gt 0 ] && [ "$has_bjv" -eq 0 ]; then
    echo -e "   ${RED}✗ FAIL:${NC} $html_file — loads version.js but has no .bj-version span"
    ERRORS=$((ERRORS + 1))
  elif [ "$has_vjs" -eq 0 ] && [ "$line_count" -gt 50 ]; then
    echo -e "   ${YELLOW}⚠ WARN:${NC} $html_file — does NOT load version.js (${line_count} lines)"
  fi
done

# ── Surface 8: api/seo-page.js — no hardcoded version strings ──
if [ -f "api/seo-page.js" ]; then
  stale_versions=$(grep -n "· v[0-9]\.[0-9]*" "api/seo-page.js" | grep -v "bj-version\|version\.js\|//")
  if [ -n "$stale_versions" ]; then
    echo -e "   ${RED}✗ FAIL:${NC} api/seo-page.js — hardcoded version found:"
    echo "$stale_versions" | while read -r line; do
      echo -e "          ${RED}${line}${NC}"
    done
    ERRORS=$((ERRORS + 1))
  else
    echo -e "   ${GREEN}✓${NC} api/seo-page.js — no hardcoded versions"
  fi
fi

echo ""

# ── Result ──
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  VERSION MISMATCH — COMMIT BLOCKED              ║${NC}"
  echo -e "${RED}║                                                  ║${NC}"
  echo -e "${RED}║  ${ERRORS} surface(s) out of sync with ${SOURCE_VERSION}            ║${NC}"
  echo -e "${RED}║                                                  ║${NC}"
  echo -e "${RED}║  Fix all surfaces, then commit again.            ║${NC}"
  echo -e "${RED}║  See VERSION_METHODOLOGY.docx for the full list. ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
else
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✓ All version surfaces in sync: ${SOURCE_VERSION}            ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 0
fi
