# Google OAuth Consent Screen Verification — Preparation

## Current State
- **Status:** Testing mode (100 user cap)
- **Project:** Google Cloud project for Brilliant Jobs
- **Client ID:** 27086315974-9988litv2cq153tlbqb7ag9u8bgmtsho.apps.googleusercontent.com
- **Scopes requested:**
  - `gmail.metadata` (SENSITIVE — no CASA required)
  - `calendar.events.readonly` (SENSITIVE — no CASA required)
- **Verification type:** Standard (free, 2-4 weeks)

## Decision Log
- **2026-03-15:** Downgraded from `gmail.readonly` (restricted, requires CASA $500-$4,500/yr) to `gmail.metadata` (sensitive, free verification). Our gmail-scan EF only reads metadata headers (Subject, From, Date). If classification accuracy proves insufficient without snippet access, upgrade to `gmail.readonly` and do CASA then.

## Verification Submission Checklist

### Already Done
- [x] Privacy policy with Google API Services Limited Use disclosure
- [x] Terms of service page
- [x] Homepage URL (brilliantjobs.app)
- [x] Support email (brilliantjobsapp@gmail.com)
- [x] App name and description in consent screen

### Needs Marston (Google Cloud Console)
- [ ] Go to: https://console.cloud.google.com/apis/credentials/consent
- [ ] Verify "App name" = "Brilliant Jobs"
- [ ] Verify "User support email" is set
- [ ] Verify "Developer contact email" is set
- [ ] Verify "Application home page" = https://brilliantjobs.app
- [ ] Verify "Application privacy policy link" = https://brilliantjobs.app/privacy.html
- [ ] Verify "Application terms of service link" = https://brilliantjobs.app/terms.html
- [ ] Verify "Authorized domains" includes "brilliantjobs.app"
- [ ] Update scopes: remove `gmail.readonly`, add `gmail.metadata` (if not already)
- [ ] Record demo video (30-60s screencast: Gmail connect → pipeline signals appear)
- [ ] Click "PUBLISH APP" to move from Testing → In Production
- [ ] Click "PREPARE FOR VERIFICATION" and submit justification form

### Justification Text (for Google's form)
"Brilliant Jobs is a job application management platform. We use Gmail and Calendar access to automatically detect application-related emails (interview invitations, rejections, offer letters) and calendar events (interview meetings) to update users' job application pipeline. We only read email metadata (sender, subject, date) and calendar event metadata (title, organizer, time). We never read email body content. Users explicitly connect and can disconnect at any time, which immediately deletes all stored data."
