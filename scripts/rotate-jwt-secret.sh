#!/bin/bash
# CS-P1-002 SE-002: Service Role Key Rotation Procedure
# 
# IMPACT: Rotating JWT secret regenerates BOTH anon + service_role keys.
#         ALL active user sessions will be invalidated.
#         A coordinated deployment is required.
#
# PREREQUISITES:
#   1. Schedule maintenance window (off-peak: 2-4 AM ET)
#   2. Notify any active testers
#   3. Have Supabase Dashboard access ready
#
# STEPS (manual — cannot be fully automated):

set -euo pipefail

echo "=========================================="
echo "SE-002: Service Role Key Rotation"
echo "=========================================="
echo ""
echo "STEP 1: Rotate JWT Secret"
echo "  → Go to: https://supabase.com/dashboard/project/qojhagupdnbtomfoxnsf/settings/api"
echo "  → Click 'Generate a new JWT secret'"
echo "  → Copy the NEW anon key and NEW service_role key"
echo ""

read -p "Enter NEW anon key: " NEW_ANON_KEY
read -p "Enter NEW service_role key: " NEW_SERVICE_ROLE_KEY

echo ""
echo "STEP 2: Update client-side anon key in globals.js..."

if [ -z "$NEW_ANON_KEY" ] || [ -z "$NEW_SERVICE_ROLE_KEY" ]; then
  echo "ERROR: Both keys are required. Aborting."
  exit 1
fi

# Update globals.js anon key
sed -i "s|const SUPABASE_KEY = 'eyJ[^']*';|const SUPABASE_KEY = '${NEW_ANON_KEY}';|" js/globals.js
echo "  ✓ js/globals.js updated"

# Verify
grep "const SUPABASE_KEY" js/globals.js

echo ""
echo "STEP 3: Update Supabase Edge Function secrets..."
echo "  Run these commands in the Supabase CLI:"
echo ""
echo "  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=\"${NEW_SERVICE_ROLE_KEY}\" --project-ref qojhagupdnbtomfoxnsf"
echo "  supabase secrets set SUPABASE_ANON_KEY=\"${NEW_ANON_KEY}\" --project-ref qojhagupdnbtomfoxnsf"
echo ""

read -p "Press Enter after setting secrets..."

echo ""
echo "STEP 4: Redeploy all Edge Functions..."
echo "  supabase functions deploy --project-ref qojhagupdnbtomfoxnsf"
echo ""

read -p "Press Enter after redeploying EFs..."

echo ""
echo "STEP 5: Rebuild bundles + deploy to Vercel..."
echo "  node build.js && node build-admin.js && npm run bundle:css"
echo "  git add -A && git commit -m 'security(se-002): rotate JWT secret + all API keys'"
echo "  git push origin main"
echo ""

echo "STEP 6: Verify in production..."
echo "  curl -s https://brilliantjobs.app/ | grep -o 'SUPABASE_KEY.*' | head -1"
echo "  → Should show new anon key"
echo ""
echo "  curl -s -H 'apikey: ${NEW_ANON_KEY}' https://qojhagupdnbtomfoxnsf.supabase.co/rest/v1/ref_city_radius?select=city&limit=1"
echo "  → Should return data"
echo ""
echo "  curl -s -H 'apikey: OLD_ANON_KEY' https://qojhagupdnbtomfoxnsf.supabase.co/rest/v1/ref_city_radius?select=city&limit=1"
echo "  → Should return 401 (old key rejected)"
echo ""

echo "STEP 7: Update CREDENTIALS_MASTER"
echo "  → Update anon key and service_role key in project knowledge"
echo "  → Update SECURITY.md to note rotation date"
echo ""

echo "=========================================="
echo "SE-002 ROTATION COMPLETE"
echo "=========================================="
