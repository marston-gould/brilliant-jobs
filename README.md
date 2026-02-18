# Brilliant Jobs Dashboard

Single-page dashboard for the Brilliant Jobs platform — a job search intelligence tool that scans company hiring pages directly, bypasses job board noise, and delivers a real-time feed matching your criteria.

## Files

- `dashboard.html` — Main dashboard (single-file SPA, ~10K lines)
- `roadmap.html` — Product roadmap tracker
- `CHANGELOG.md` — Version history

## Architecture

The dashboard is currently a monolithic single-file HTML/CSS/JS application using:
- **Supabase** for auth, database, and storage
- **localStorage** for client-side state (filters, pipeline, resumes, tuning)
- **IndexedDB** for resume file blob storage (downloads)
- **pdf.js** for PDF text extraction
- **Outfit + JetBrains Mono** fonts via Google Fonts

## Development

Open `dashboard.html` directly in a browser or serve via any static file server. The app connects to Supabase for backend data.

## Versioning

Version format: `v2.XX` — incremented per meaningful change set. Version appears in:
1. HTML comment on line 2
2. `console.log` on load
3. Feedback form submission payload
<!-- deploy trigger 2026-02-18T21:59:24.570379 -->
