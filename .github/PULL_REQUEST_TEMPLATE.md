## Summary
<!-- One-sentence description of what this PR does -->


## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would break existing functionality)
- [ ] Infrastructure/CI (build, pipeline, tooling changes)
- [ ] Documentation

## Quality Gate Checklist

### Gate 1: No Silent Failures
- [ ] No empty catch blocks introduced
- [ ] All Supabase `{ data, error }` responses have error checks
- [ ] All new async operations have proper error handling
- [ ] Errors are reported to PostHog (not just console.log)

### Gate 2: Monitoring
- [ ] New user-facing features have PostHog events
- [ ] Error paths capture exceptions to PostHog

### Gate 3: Test Coverage
- [ ] New code has corresponding tests
- [ ] Tests pass locally (`npm test`)
- [ ] Critical path coverage maintained

### Gate 4: Edge Function Auth
- [ ] Any new/modified Edge Functions have auth header validation
- [ ] Rate limiting applied where appropriate

### Gate 5: Access Control
- [ ] No API keys, tokens, or secrets in source code
- [ ] Secrets use environment variables or Supabase Vault
- [ ] No service role key in client-side code

### Gate 6: Instrumentation
- [ ] New pages/views have PostHog page view events
- [ ] New user actions have corresponding analytics events

### Gate 7: Type Safety
- [ ] New utility functions have JSDoc type annotations
- [ ] No `any` types introduced without justification

### Gate 8: Design System
- [ ] Uses Tailwind classes (no new inline styles)
- [ ] Colors use design tokens (no hardcoded hex values)

### Gate 9: Deployment
- [ ] Build passes (`node build.js && node build-admin.js && npm run bundle:css`)
- [ ] Version bumped if JS/CSS/HTML changed (`bash scripts/bump-version.sh`)
- [ ] All CI checks pass

### Gate 10: Compliance
- [ ] No new PII stored without documentation
- [ ] CDN dependencies have SRI hashes
- [ ] Privacy-impacting changes reviewed

## Testing
<!-- Describe tests added or updated -->


## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->
