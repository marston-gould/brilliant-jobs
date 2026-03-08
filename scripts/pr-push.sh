#!/bin/bash
# scripts/pr-push.sh — BI-07: Solo-operator PR workflow
# Usage: bash scripts/pr-push.sh "commit message"
#
# Replaces: git add . && git commit -m "..." && git push origin main
# Now:      git add . && git commit -m "..." && bash scripts/pr-push.sh "branch-name"
#
# With branch protection enabled, direct pushes to main are blocked.
# This script automates the PR creation → CI check → auto-merge flow.

set -euo pipefail

BRANCH=$(git branch --show-current)

if [ "$BRANCH" = "main" ]; then
  echo "❌ Cannot push directly to main. Create a branch first:"
  echo "   git checkout -b fix/your-description"
  exit 1
fi

echo "🚀 Pushing branch '$BRANCH' and creating PR..."

# Push branch
git push origin "$BRANCH" 2>&1

# Create PR with auto-merge enabled
echo "📋 Creating PR..."
if command -v gh &> /dev/null; then
  gh pr create --fill --base main 2>/dev/null || echo "PR may already exist"
  echo "🔄 Enabling auto-merge (will merge when CI passes)..."
  gh pr merge --auto --squash 2>/dev/null || echo "Auto-merge may already be enabled"
  echo ""
  echo "✅ PR created with auto-merge. CI is running."
  echo "   View: gh pr view --web"
  echo "   Status: gh pr checks"
else
  echo ""
  echo "⚠️  GitHub CLI (gh) not installed. Create PR manually:"
  echo "   https://github.com/marston-gould/brilliant-jobs/compare/main...$BRANCH"
  echo ""
  echo "   To install gh: https://cli.github.com/"
fi
