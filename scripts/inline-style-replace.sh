#!/bin/bash
# CS-P1-009: DS1-3 Inline Style Audit — Bulk Replacement
# Replaces the most common inline style patterns with utility classes
# Run from repo root: bash scripts/inline-style-replace.sh

set -euo pipefail
FILE="dashboard.html"
cp "$FILE" "${FILE}.bak-ds13"

echo "=== DS1-3: Inline Style Replacement ==="
BEFORE=$(grep -c 'style="' "$FILE")
echo "Before: $BEFORE inline styles"

# ── Exact match replacements (style="X" → class="Y") ──

# font-size:11px;color:var(--text-faint);
sed -i 's/style="font-size:11px;color:var(--text-faint);"/class="u-meta"/g' "$FILE"

# font-size:12px;color:var(--text-faint);
sed -i 's/style="font-size:12px;color:var(--text-faint);"/class="u-label"/g' "$FILE"

# font-size:11px;
sed -i 's/ style="font-size:11px;"/ class="u-fs-11"/g' "$FILE"

# font-size:12px;
sed -i 's/ style="font-size:12px;"/ class="u-fs-12"/g' "$FILE"

# font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;
sed -i 's/style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;"/class="u-section-title"/g' "$FILE"

# padding:8px 12px;font-weight:600;color:var(--text-dim);font-size:11px;
sed -i 's/style="padding:8px 12px;font-weight:600;color:var(--text-dim);font-size:11px;"/class="u-th"/g' "$FILE"

# padding:4px 14px;font-size:11px;border-radius:6px;
sed -i 's/style="padding:4px 14px;font-size:11px;border-radius:6px;"/class="u-btn-pill"/g' "$FILE"

# overflow-x:auto;
sed -i 's/ style="overflow-x:auto;"/ class="u-overflow-x"/g' "$FILE"

# width:100%;height:300px
sed -i 's/ style="width:100%;height:300px"/ class="u-chart-box"/g' "$FILE"

# padding:4px 8px;font-size:11px;cursor:pointer;border-radius:4px;
sed -i 's/style="padding:4px 8px;font-size:11px;cursor:pointer;border-radius:4px;"/class="u-btn-compact"/g' "$FILE"

# display:flex;align-items:center;gap:8px;padding:5px 6px;font-size:11px;cursor:pointer;border-radius:4px;
sed -i 's/style="display:flex;align-items:center;gap:8px;padding:5px 6px;font-size:11px;cursor:pointer;border-radius:4px;"/class="u-btn-action"/g' "$FILE"

# color:var(--text);  (redundant — inherited from body)
sed -i 's/ style="color:var(--text);"//g' "$FILE"

# font-weight:700;font-size:12px;
sed -i 's/style="font-weight:700;font-size:12px;"/class="u-card-label"/g' "$FILE"

# font-size:10px;color:var(--text-dim);margin-top:2px;
sed -i 's/style="font-size:10px;color:var(--text-dim);margin-top:2px;"/class="u-sub-meta"/g' "$FILE"

# font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;
sed -i 's/style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;"/class="u-label-sm"/g' "$FILE"

# font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px;
sed -i 's/style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px;"/class="u-hint"/g' "$FILE"

# text-align:center;color:var(--text-faint);padding:48px 12px;
sed -i 's/style="text-align:center;color:var(--text-faint);padding:48px 12px;"/class="u-empty"/g' "$FILE"

# flex:1;
sed -i 's/ style="flex:1;"/ class="u-flex-1"/g' "$FILE"

# margin:0;  (redundant with reset)
sed -i 's/ style="margin:0;"//g' "$FILE"

# margin-top:8px;
sed -i 's/ style="margin-top:8px;"/ class="u-mt-8"/g' "$FILE"

# margin-top:12px;
sed -i 's/ style="margin-top:12px;"/ class="u-mt-12"/g' "$FILE"

# margin-bottom:0;
sed -i 's/ style="margin-bottom:0;"/ class="u-mb-0"/g' "$FILE"

# margin-bottom:12px;color:var(--text-faint);
sed -i 's/style="margin-bottom:12px;color:var(--text-faint);"/class="u-mb-12 u-text-faint"/g' "$FILE"

# margin-bottom:14px;
sed -i 's/ style="margin-bottom:14px;"/ class="u-mb-14"/g' "$FILE"

# padding:16px;
sed -i 's/ style="padding:16px;"/ class="u-p-16"/g' "$FILE"

# vertical-align:-1px;margin-right:6px;opacity:0.5;
sed -i 's/style="vertical-align:-1px;margin-right:6px;opacity:0.5;"/class="u-icon-inline"/g' "$FILE"

# display:flex;align-items:center;justify-content:space-between;
sed -i 's/style="display:flex;align-items:center;justify-content:space-between;"/class="u-flex-between"/g' "$FILE"

# display:flex;gap:12px;flex-wrap:wrap;
sed -i 's/style="display:flex;gap:12px;flex-wrap:wrap;"/class="u-flex-gap-12 u-flex-wrap"/g' "$FILE"

# display:flex;align-items:center;gap:8px;
sed -i 's/style="display:flex;align-items:center;gap:8px;"/class="u-flex-gap-8"/g' "$FILE"

# display:flex;align-items:center;gap:6px;
sed -i 's/style="display:flex;align-items:center;gap:6px;"/class="u-flex-gap-6"/g' "$FILE"

# display:grid;grid-template-columns:1fr 1fr;gap:8px;
sed -i 's/style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"/class="u-grid-2"/g' "$FILE"

# font-size:11px;color:var(--text-dim);
sed -i 's/style="font-size:11px;color:var(--text-dim);"/class="u-meta-dim"/g' "$FILE"

# ── Handle class merges where element already has class ──
# When sed produces class="existing" class="u-new", merge them
perl -pi -e 's/class="([^"]+)" class="([^"]+)"/class="$1 $2"/g' "$FILE"

AFTER=$(grep -c 'style="' "$FILE")
REMOVED=$((BEFORE - AFTER))
PCT=$(( (REMOVED * 100) / BEFORE ))
echo "After: $AFTER inline styles"
echo "Removed: $REMOVED ($PCT% reduction)"
echo "=== Done ==="
