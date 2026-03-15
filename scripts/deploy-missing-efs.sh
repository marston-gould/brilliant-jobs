#!/usr/bin/env bash
# SIM-REM-002: Deploy 22 undeployed edge functions
# Source: Spec_Compliance_Complete_All_Findings §8.4
# 
# Prerequisites:
#   export SUPABASE_ACCESS_TOKEN=<your-token>
#   npx supabase login (or use --token flag)
#
# Usage: bash scripts/deploy-missing-efs.sh
#
# Note: CrewAI agents (9 EFs) are listed but commented out — deploy when ready.

set -euo pipefail

PROJECT_REF="qojhagupdnbtomfoxnsf"
DEPLOY_CMD="npx supabase functions deploy"
COMMON_FLAGS="--project-ref $PROJECT_REF"

echo "═══════════════════════════════════════════════════"
echo "  SIM-REM-002: Deploying 22 Missing Edge Functions"
echo "  Project: $PROJECT_REF"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── User-Facing (5) ───────────────────────────────────
echo "▸ Deploying user-facing EFs (5)..."

echo "  1/5  generate-cover-letter"
$DEPLOY_CMD generate-cover-letter $COMMON_FLAGS

echo "  2/5  extract-resume-profile"
$DEPLOY_CMD extract-resume-profile $COMMON_FLAGS

echo "  3/5  handle-referral-signup"
$DEPLOY_CMD handle-referral-signup $COMMON_FLAGS

echo "  4/5  recruiter-lookup"
$DEPLOY_CMD recruiter-lookup $COMMON_FLAGS

echo "  5/5  refresh-materialized-views"
$DEPLOY_CMD refresh-materialized-views $COMMON_FLAGS

echo ""
echo "✓ User-facing EFs deployed."
echo ""

# ─── Infrastructure (8) ───────────────────────────────
echo "▸ Deploying infrastructure EFs (8)..."

echo "  1/8  dedup-promote"
$DEPLOY_CMD dedup-promote $COMMON_FLAGS

echo "  2/8  capacity-model"
$DEPLOY_CMD capacity-model $COMMON_FLAGS

echo "  3/8  deploy-tracker"
$DEPLOY_CMD deploy-tracker $COMMON_FLAGS

echo "  4/8  cost-monitor"
$DEPLOY_CMD cost-monitor $COMMON_FLAGS

echo "  5/8  replica-health"
$DEPLOY_CMD replica-health $COMMON_FLAGS

echo "  6/8  event-bus"
$DEPLOY_CMD event-bus $COMMON_FLAGS

echo "  7/8  feature-flags"
$DEPLOY_CMD feature-flags $COMMON_FLAGS

echo "  8/8  admin-cron-management"
$DEPLOY_CMD admin-cron-management $COMMON_FLAGS

echo ""
echo "✓ Infrastructure EFs deployed."
echo ""

# ─── API Gateway (must redeploy after all EFs) ────────
echo "▸ Redeploying api-gateway..."
$DEPLOY_CMD api-gateway $COMMON_FLAGS
echo "✓ API gateway redeployed."
echo ""

# ─── CrewAI Agents (9 — DEFERRED) ─────────────────────
# Uncomment when CrewAI agents are ready for production.
# echo "▸ Deploying CrewAI agents (9)..."
# $DEPLOY_CMD crewai-orchestrator $COMMON_FLAGS
# $DEPLOY_CMD crewai-content-qa $COMMON_FLAGS
# $DEPLOY_CMD crewai-pipeline-health $COMMON_FLAGS
# $DEPLOY_CMD crewai-data-freshness $COMMON_FLAGS
# $DEPLOY_CMD crewai-graduation $COMMON_FLAGS
# $DEPLOY_CMD crewai-agent-digest $COMMON_FLAGS
# $DEPLOY_CMD crewai-cost-guardian $COMMON_FLAGS
# $DEPLOY_CMD crewai-user-support $COMMON_FLAGS
# $DEPLOY_CMD crewai-referral-pipeline $COMMON_FLAGS
# echo "✓ CrewAI agents deployed."

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✓ SIM-REM-002 COMPLETE"
echo "  13 EFs deployed (5 user-facing + 8 infrastructure)"
echo "  9 CrewAI agents deferred (commented out)"
echo "  API gateway redeployed"
echo ""
echo "  Next: Verify with"
echo "    curl https://$PROJECT_REF.supabase.co/functions/v1/api-gateway/health-check"
echo "═══════════════════════════════════════════════════"
