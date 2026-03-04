#!/bin/bash
# ============================================================
# Brilliant Jobs — Version Bump Script
# ============================================================
# Automatically updates ALL version surfaces when bumping.
# Usage: ./scripts/bump-version.sh 6.73
#
# Updates:
#   1. js/version.js         — BJ_VERSION variable
#   2. All HTML ?v= params   — version.js, styles.css, .min.js busters
#   3. HTML version comments  — dashboard, index, admin, compare
#   4. CHANGELOG.md           — prepends entry placeholder
#
# Does NOT handle: git tag, git merge, Vercel deploy (manual steps)
# Reference: VERSION_METHODOLOGY.docx
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ $# -lt 1 ]; then
  echo -e "${RED}Usage: ./scripts/bump-version.sh <new-version>${NC}"
  echo -e "  Example: ./scripts/bump-version.sh 6.73"
  echo -e "  Version should be numeric only (no 'v' prefix)"
  exit 1
fi

NEW_VERSION="$1"
NEW_V="v${NEW_VERSION}"

# Validate format
if ! echo "$NEW_VERSION" | grep -qP '^\d+\.\d+$'; then
  echo -e "${RED}Error: Version must be in X.YY format (e.g., 6.73)${NC}"
  exit 1
fi

# Extract current version
CURRENT_VERSION=$(grep -oP "BJ_VERSION = 'v\K[0-9.]+" js/version.js)
CURRENT_V="v${CURRENT_VERSION}"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Brilliant Jobs Version Bump: ${CURRENT_V} → ${NEW_V}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

CHANGED=0

# --- 1. js/version.js ---
echo -e "${YELLOW}[1/4] js/version.js${NC}"
sed -i "s/BJ_VERSION = '${CURRENT_V}'/BJ_VERSION = '${NEW_V}'/" js/version.js
echo -e "  ${GREEN}✓${NC} BJ_VERSION = '${NEW_V}'"
CHANGED=$((CHANGED + 1))

# --- 2. ALL HTML cache buster params ---
echo ""
echo -e "${YELLOW}[2/4] HTML cache busters (?v= params)${NC}"

# Pattern: ?v=vX.XX or ?v=X.XX → update to ?v=vNEW
for html_file in *.html; do
  count=$(grep -c "?v=v\?${CURRENT_VERSION}" "$html_file" 2>/dev/null || echo 0)
  if [ "$count" -gt 0 ]; then
    # Handle both ?v=v6.72 and ?v=6.72 formats (normalize to ?v=v6.73)
    sed -i "s/?v=v\?${CURRENT_VERSION}/?v=${NEW_V}/g" "$html_file"
    echo -e "  ${GREEN}✓${NC} ${html_file} — ${count} buster(s) updated"
    CHANGED=$((CHANGED + 1))
  fi
done

# --- 3. HTML version comments ---
echo ""
echo -e "${YELLOW}[3/4] HTML version comments${NC}"

update_comment() {
  local file="$1"
  local label="$2"
  if [ -f "$file" ]; then
    if grep -q "${label} ${CURRENT_V}" "$file"; then
      sed -i "s/${label} ${CURRENT_V}/${label} ${NEW_V}/g" "$file"
      echo -e "  ${GREEN}✓${NC} ${file} — '${label} ${NEW_V}'"
    elif grep -q "${label}" "$file"; then
      echo -e "  ${YELLOW}⚠${NC} ${file} — has '${label}' but not at ${CURRENT_V} (check manually)"
    fi
  fi
}

update_comment "dashboard.html" "Brilliant Jobs Dashboard"
update_comment "index.html" "Brilliant Jobs Landing Page"
update_comment "admin.html" "Brilliant Jobs Admin Console"
update_comment "compare.html" "Brilliant Jobs Competitor Comparison"

# --- 4. CHANGELOG.md placeholder ---
echo ""
echo -e "${YELLOW}[4/4] CHANGELOG.md${NC}"

DATE=$(date +%Y-%m-%d)
PLACEHOLDER="## ${NEW_V} Session NN: TITLE (${DATE})\n- DESCRIBE CHANGES HERE\n"

# Prepend to CHANGELOG.md
echo -e "${PLACEHOLDER}" | cat - CHANGELOG.md > /tmp/changelog_tmp && mv /tmp/changelog_tmp CHANGELOG.md
echo -e "  ${GREEN}✓${NC} Prepended ${NEW_V} entry placeholder"

# --- Summary ---
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Version bumped: ${CURRENT_V} → ${NEW_V}${NC}"
echo -e "${GREEN}  Files changed: ${CHANGED}+${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Remaining manual steps:${NC}"
echo -e "  1. Edit CHANGELOG.md with actual session description"
echo -e "  2. Rebuild JS bundle:    ${CYAN}node build.js${NC}"
echo -e "  3. Rebuild CSS:          ${CYAN}npm run bundle:css${NC}"
echo -e "  4. Run pre-commit check: ${CYAN}bash scripts/pre-commit-version-check.sh${NC}"
echo -e "  5. Commit, merge dev → staging → main"
echo -e "  6. Tag: ${CYAN}git tag ${NEW_V}${NC}"
echo -e "  7. Deploy via Vercel"
echo -e "  8. Verify production: ${CYAN}curl -s brilliantjobs.app/js/version.js${NC}"
echo ""
