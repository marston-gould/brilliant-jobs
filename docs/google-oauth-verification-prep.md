# Google OAuth Consent Screen Verification — Preparation

## Current State
- **Status:** Testing mode (100 user cap)
- **Project:** Google Cloud project for Brilliant Jobs
- **Client ID:** 27086315974-9988litv2cq153tlbqb7ag9u8bgmtsho.apps.googleusercontent.com
- **Scopes requested:**
  - `gmail.metadata` (SENSITIVE — no CASA required)
  - `calendar.events.readonly` (SENSITIVE — no CASA required)
- **Verification type:** Standard (free, 2-4 weeks)

## FREE: Fix "Google hasn't verified this app" warning

This is the scary warning every user sees when connecting Gmail. Costs nothing. Do this first.

1. Go to https://console.cloud.google.com/apis/credentials/consent
2. Verify app name, support email, developer contact email are set
3. Verify homepage = https://brilliantjobs.app
4. Verify privacy policy = https://brilliantjobs.app/privacy.html
5. Verify terms of service = https://brilliantjobs.app/terms.html  
6. Verify authorized domains includes "brilliantjobs.app"
7. Update scopes: ensure `gmail.metadata` and `calendar.events.readonly` are listed
8. Record a 30-60 second demo video (screen recording: user connects Gmail → pipeline signals appear)
9. Click "PUBLISH APP" (moves from Testing → In Production)
10. Click "PREPARE FOR VERIFICATION" → paste justification below → attach video
11. Wait 2-4 weeks. Warning disappears once approved.

## CASA Assessment (only needed if upgrading to gmail.readonly later)

- **Vendor:** TAC Security (Google's only Preferred and Recommended CASA partner)
- **URL:** https://tacsecurity.com/google-casa-cloud-application-security-assessment/
- **Support email:** casasupport@tacsecurity.com
- **Plan:** Basic Tier 2 — $540/year (two revalidation cycles, LOV issued by TAC)
- **Alternative plans:** Premium Tier 2 $720/yr (unlimited revalidation), Enterprise Tier 2 $1,800/yr (year-round reassessment)
- **Process:** Sign up → upload source code as zip → TAC runs SAST/DAST scans (1-2 business days) → fix any flagged vulnerabilities → rescan → TAC issues Letter of Validation (LOV) → submit LOV to Google during OAuth verification
- **Not needed now.** Ship with gmail.metadata (free verification). Revisit when user complaints justify the spend.
- **2026-03-15:** Downgraded from `gmail.readonly` (restricted, requires CASA $500-$4,500/yr) to `gmail.metadata` (sensitive, free verification). Our gmail-scan EF only reads metadata headers (Subject, From, Date). If classification accuracy proves insufficient without snippet access, upgrade to `gmail.readonly` and do CASA then.

## Verification Submission Checklist

### Already Done
- [x] Privacy policy with Google API Services Limited Use disclosure
- [x] Terms of service page
- [x] Homepage URL (brilliantjobs.app)
- [x] Support email (brilliantjobsapp@gmail.com)
- [x] App name and description in consent screen

### Justification Text (for Google's form)
"Brilliant Jobs is a job application management platform. We use Gmail and Calendar access to automatically detect application-related emails (interview invitations, rejections, offer letters) and calendar events (interview meetings) to update users' job application pipeline. We only read email metadata (sender, subject, date) and calendar event metadata (title, organizer, time). We never read email body content. Users explicitly connect and can disconnect at any time, which immediately deletes all stored data."
