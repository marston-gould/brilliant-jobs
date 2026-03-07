#!/bin/bash
# CS-P1-009: DS1-3 Phase 2 Inline Style Replacement
set -euo pipefail
FILE="dashboard.html"

BEFORE=$(grep -c 'style="' "$FILE")
echo "=== DS1-3 Phase 2 ==="
echo "Before: $BEFORE inline styles"

# display:none → u-hidden (53 instances - JS toggles these with style.display)
# Safe: JS sets style.display='block'|'flex'|'' to show, which overrides class
sed -i 's/ style="display:none;"/ class="u-hidden"/g' "$FILE"

# Remaining typography combos
sed -i 's/style="font-size:10px;text-transform:uppercase;color:var(--text-faint);font-weight:600;letter-spacing:0.5px;margin-bottom:6px;"/class="u-section-label"/g' "$FILE"
sed -i 's/style="color:#f59e0b;"/class="u-color-amber"/g' "$FILE"
sed -i 's/style="font-size:13px;font-weight:600;color:var(--text);"/class="u-heading-sm"/g' "$FILE"
sed -i 's/style="font-size:13px;color:var(--text-dim);line-height:1.6;"/class="u-body-dim"/g' "$FILE"
sed -i 's/style="font-size:12px;color:var(--text-dim);"/class="u-label-dim"/g' "$FILE"
sed -i 's/style="font-size:11px;color:var(--text-faint);margin-top:2px;"/class="u-meta-faint-mt2"/g' "$FILE"
sed -i 's/style="font-size:11px;color:var(--text-dim);line-height:1.4;"/class="u-meta-dim-lh"/g' "$FILE"
sed -i 's/style="margin-top:8px;font-size:12px;color:var(--text-faint);font-style:italic;"/class="u-italic-hint"/g' "$FILE"
sed -i 's/style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:var(--accent);"/class="u-stat-lg"/g' "$FILE"
sed -i 's/style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;"/class="u-heading-sm-mb2"/g' "$FILE"
sed -i 's/style="font-size:13px;color:var(--text);"/class="u-body-text"/g' "$FILE"
sed -i 's/style="font-size:12px;font-weight:600;margin-bottom:4px;"/class="u-label-bold"/g' "$FILE"

# Layout combos
sed -i 's/ style="text-align:left;padding:10px 12px;"/ class="u-text-left-pad"/g' "$FILE"
sed -i 's/ style="padding-right:70px;"/ class="u-pr-70"/g' "$FILE"
sed -i 's/style="display:flex;flex-wrap:wrap;gap:4px;"/class="u-flex-wrap-gap4"/g' "$FILE"
sed -i 's/ style="position:relative;"/ class="u-pos-rel"/g' "$FILE"
sed -i 's/ style="opacity:0.25;"/ class="u-dim-25"/g' "$FILE"
sed -i 's/ style="color:var(--text-faint);"/ class="u-text-faint"/g' "$FILE"
sed -i 's/style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"/class="u-flex-between-mb16"/g' "$FILE"
sed -i 's/ style="max-height:240px;"/ class="u-mh-240"/g' "$FILE"
sed -i 's/ style="margin-bottom:16px;"/ class="u-mb-16"/g' "$FILE"
sed -i 's/ style="margin-bottom:12px;"/ class="u-mb-12"/g' "$FILE"

# Input patterns
sed -i 's/style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:12px;text-align:center;"/class="u-input-sm"/g' "$FILE"
sed -i 's/style="width:70px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text);font-size:12px;text-align:center;"/class="u-input-sm-70"/g' "$FILE"
sed -i 's/style="text-align:left;font-size:13px;padding:8px 12px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);color:var(--text);cursor:pointer;"/class="u-dropdown-btn"/g' "$FILE"
sed -i 's/style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-card));color:var(--text);box-sizing:border-box;"/class="u-input-base"/g' "$FILE"
sed -i 's/style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-input);color:var(--text);font-family:var(--sans);font-size:12px;"/class="u-select-base"/g' "$FILE"

# Flex layout combos
sed -i 's/style="flex:1;padding:2px 0;font-size:10px;"/class="u-flex-pill"/g' "$FILE"
sed -i 's/style="display:flex;gap:8px;align-items:center;"/class="u-flex-gap-8-center"/g' "$FILE"
sed -i 's/style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg-hover);border-radius:8px;padding:3px;width:fit-content;"/class="u-tab-bar"/g' "$FILE"
sed -i 's/style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"/class="u-flex-between-mb8"/g' "$FILE"
sed -i 's/style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"/class="u-flex-between-mb12"/g' "$FILE"
sed -i 's/style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim);cursor:pointer;margin-bottom:10px;"/class="u-clickable-meta"/g' "$FILE"
sed -i 's/style="display:flex;align-items:center;gap:12px;"/class="u-flex-gap-12-center"/g' "$FILE"
sed -i 's/style="display:flex;align-items:center;gap:10px;"/class="u-flex-gap-10"/g' "$FILE"
sed -i 's/style="display:flex;justify-content:flex-end;margin-top:14px;"/class="u-flex-end-mt14"/g' "$FILE"
sed -i 's/style="flex:1;min-width:120px;"/class="u-flex-min120"/g' "$FILE"

# Button patterns
sed -i 's/style="background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;color:var(--text-dim);"/class="u-btn-outline-sm"/g' "$FILE"

# Misc
sed -i 's/style="background:var(--indigo-dim);"/class="bg-indigo-dim"/g' "$FILE"

# Merge double class attributes
perl -pi -e 's/class="([^"]+)" class="([^"]+)"/class="$1 $2"/g' "$FILE"

AFTER=$(grep -c 'style="' "$FILE")
REMOVED=$((BEFORE - AFTER))
PCT=$(( (REMOVED * 100) / BEFORE ))
echo "After: $AFTER inline styles"
echo "Removed: $REMOVED ($PCT% reduction from phase 2 start)"
echo "Total removed from 797: $((797 - AFTER)) ($((( (797 - AFTER) * 100) / 797))% total reduction)"
echo "=== Done ==="
