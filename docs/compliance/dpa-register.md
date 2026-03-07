# Data Processing Agreement (DPA) Register — Brilliant Jobs

> **Version:** 1.0  
> **Created:** 2026-03-07  
> **Finding:** CP-002  
> **Owner:** TPM + Legal  
> **Review Cadence:** Annually or on contract renewal

## Summary

This register tracks the DPA status for all third-party services that process user PII on behalf of Brilliant Jobs.

---

## DPA Status

| # | Service | PII Processed | DPA Status | DPA URL / Notes | Action Required |
|---|---------|--------------|------------|-----------------|-----------------|
| 1 | **Anthropic** | Resume text (names, emails, phone, work history, education, skills) via API | **Available** | Anthropic's commercial API terms include data handling commitments. Zero-day retention on API inputs. See https://www.anthropic.com/policies | Review API Terms of Service; confirm zero-retention clause covers resume PII. Document acceptance. |
| 2 | **PostHog** | User ID, events, device info, feature usage | **Available** | PostHog Cloud DPA available at https://posthog.com/dpa | Execute DPA via PostHog dashboard. Document signed date. |
| 3 | **Stripe** | Email, name, payment method, billing address | **Included** | Stripe's Services Agreement includes DPA terms. See https://stripe.com/legal/dpa | Already covered by Stripe ToS. Document acceptance. |
| 4 | **Resend** | Email addresses, notification content | **Available** | Resend DPA available on request. See https://resend.com/legal/dpa | Request and execute DPA. |
| 5 | **Vonage** | Phone numbers, SMS content | **Available** | Vonage DPA available at https://www.vonage.com/legal/data-processing-addendum/ | Execute DPA. |
| 6 | **Vercel** | Server logs (IP addresses, request metadata) | **Included** | Vercel DPA included in Enterprise/Pro terms. See https://vercel.com/legal/dpa | Document acceptance. |
| 7 | **Supabase** | All database content (full PII set) | **Included** | Supabase DPA included. See https://supabase.com/legal/dpa | Already covered. Document acceptance. |
| 8 | **Cloudflare** | Request metadata, DNS queries | **Included** | Cloudflare DPA included in service terms. See https://www.cloudflare.com/cloudflare-customer-dpa/ | Already covered. Document acceptance. |
| 9 | **GitHub** | Source code (no user PII in normal operation) | **N/A** | No user PII processed. Source code only. | N/A — credentials must never be in repo. |
| 10 | **Google (GSC, BigQuery)** | Anonymized SEO data | **Included** | Google Cloud DPA. See https://cloud.google.com/terms/data-processing-addendum | Document acceptance. |
| 11 | **LocationIQ** | Geocoding queries (city/state strings, no user PII) | **N/A** | No user PII sent. Location strings only. | N/A |
| 12 | **DataForSEO** | SEO keywords (no user PII) | **N/A** | No user PII sent. | N/A |
| 13 | **BLS/FRED/Census** | Public API queries (no user PII) | **N/A** | Government APIs, no PII sent. | N/A |

---

## Priority Actions

1. **Anthropic (Priority 1):** Review commercial API terms. Confirm zero-retention clause explicitly covers resume text containing PII. Document acceptance in this register with date.
2. **PostHog (Priority 2):** Execute cloud DPA via dashboard settings. Record signed date.
3. **Resend (Priority 2):** Request DPA from Resend support. Execute and file.
4. **Vonage (Priority 2):** Execute DPA via account settings. Record signed date.
5. **Stripe, Supabase, Vercel, Cloudflare, Google (Priority 3):** Document existing DPA coverage dates for each service.

---

## Anthropic API Data Handling — Detailed Assessment

### What PII is sent?
Resume text submitted to 10 Edge Functions contains: full names, email addresses, phone numbers, work history (employer names, dates, titles), education (institutions, degrees, dates), and skills.

### Anthropic's commitments (per API Terms):
- API inputs are NOT used for model training
- Zero-day retention on API inputs (not stored after processing)
- SOC 2 Type II certified

### Residual risk:
- No contractual DPA executed yet (using standard API terms)
- Standard API terms provide adequate protection for launch
- Formal DPA execution recommended within 90 days of launch

### Recommended action:
Document acceptance of Anthropic API terms as sufficient for launch. Add formal DPA execution to post-launch legal workstream.

---

## Register Maintenance

- This register must be updated when adding any new third-party service that processes user PII
- Annual review of all DPA statuses
- PR template includes DPA checkpoint (see Quality Gate #10)
