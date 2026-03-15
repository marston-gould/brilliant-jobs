# Extension Release Process

> EXT-BUILD-001-S3 | Last updated: 2026-03-15

## Overview

The extension build pipeline has three stages:
1. **Compile** — TypeScript → JavaScript (3 build modes)
2. **Upload** — Compiled files to Supabase Storage
3. **Distribute** — Users download fingerprinted builds via EF

## Release Steps

### 1. Make changes to extension/ TypeScript source files

All source is in `extension/` as `.ts` files. Never edit compiled `.js` files directly.

### 2. Build clean dev output

```bash
node extension/build-dev.js
```

Verify: 0 errors, 58+ compiled files, 11 static files, all manifest refs resolve.

Three compilation modes:
- **Plain** — `importScripts()` / `<script>` tags (supabase.js, popup*.js, utils/crypto, etc.)
- **ESM** — `dynamic import()` in contentScript (17 handlers + utils/fillMetrics)
- **IIFE** — manifest content_scripts / service_worker (background, contentScript, interceptor*, etc.)

### 3. Upload to Supabase Storage

```bash
node scripts/upload-extension-source.js
```

Uploads 69 files to `extension-source/v4/`. Upsert mode (overwrites existing).

If Node DNS fails in your environment, use the curl-based fallback:
```bash
# See /tmp/upload-extension.sh pattern from EXT-BUILD-001-S1
```

### 4. Deploy build-extension EF (if file list changed)

Only needed when adding/removing files from the categorized arrays in `build-extension/index.ts`.

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy build-extension --project-ref qojhagupdnbtomfoxnsf
```

### 5. Update extension-version EF with new version number

Edit `supabase/functions/extension-version/index.ts`:
- Update `LATEST_VERSION`
- Update `updated_at`

Deploy:
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy extension-version --project-ref qojhagupdnbtomfoxnsf
```

### 6. Bump manifest.json + version.json

- `extension/manifest.json` → update `"version": "X.Y.Z"`
- `extension/version.json` → update `"version": "X.Y.Z"` and `"build"` field

### 7. Users receive updates

- Background.ts checks extension-version EF every 6 hours
- When behind: badge `!` on extension icon + popup update banner
- User clicks Download → receives fingerprinted ZIP from build-extension EF
- User unzips + reloads in chrome://extensions

## File Map

| File | Purpose |
|------|---------|
| `extension/build-dev.js` | Clean dev build (3 modes, no fingerprinting) |
| `extension/build-extension.js` | Fingerprinted batch build (local, `--batch N`) |
| `scripts/upload-extension-source.js` | Upload dist/dev/ → Supabase Storage |
| `supabase/functions/build-extension/index.ts` | Per-user fingerprinted ZIP builder EF |
| `supabase/functions/extension-version/index.ts` | Version check endpoint |
| `js/extension-download.js` | Dashboard download button handler |

## CI Gate

The `gate-ext-build` job in `.github/workflows/ci.yml` runs `node extension/build-dev.js` on every PR. It verifies:
- Exit code 0 (build succeeded)
- 60+ output files
- All manifest references resolve
- All ESM handlers have export statements

This gate is **BLOCKING** — PRs that break the extension build cannot merge.

## Fingerprinting

The build-extension EF (`build-extension/index.ts`) produces per-user unique builds:
- Randomized JS filenames
- Randomized manifest metadata (name, description)
- Randomized internal message channel names
- Dead code injection
- CSS class randomization
- String literal obfuscation

Channel map is stored in `extension_builds` table and cached in `localStorage` (`bj_channel_map`) for dashboard↔extension communication.
