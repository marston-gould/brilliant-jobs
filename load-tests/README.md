# Load Tests — Brilliant Jobs

CS-020 FIX-20: Load testing infrastructure for all 4 surfaces.

## Prerequisites

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/):

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Test Structure

| Script | Surface | Target VUs | Exit Gate |
|--------|---------|-----------|-----------|
| `preview-jobs.js` | Landing | 480 | p95 < 2s, err < 0.1% |
| `dashboard-api.js` | Dashboard | 420 | p95 < 2s, err < 0.1% |
| `extension-heartbeat.js` | Extension | 240 | p95 < 1.5s, err < 0.1% |
| `admin-concurrent.js` | Admin | 60 | p95 < 3s, err < 1% |
| `full-suite.js` | All | 1,200 | All above + combined |

## Running Tests

### Smoke test (quick sanity — 5 VUs, 30s)

```bash
k6 run --env PROFILE=smoke load-tests/preview-jobs.js
```

### Individual surface — ramp to target

```bash
# Landing preview-jobs (unauthenticated — no creds needed)
k6 run --env PROFILE=ramp load-tests/preview-jobs.js

# Dashboard API (needs test user)
K6_TEST_EMAIL=test@brilliantjobs.app K6_TEST_PASSWORD=... \
  k6 run --env PROFILE=ramp load-tests/dashboard-api.js

# Extension heartbeat (needs test user)
K6_TEST_EMAIL=test@brilliantjobs.app K6_TEST_PASSWORD=... \
  k6 run --env PROFILE=ramp load-tests/extension-heartbeat.js

# Admin (needs admin user)
K6_ADMIN_EMAIL=admin@brilliantjobs.app K6_ADMIN_PASSWORD=... \
  k6 run load-tests/admin-concurrent.js
```

### Full suite — all surfaces, 1,200 VUs

```bash
K6_TEST_EMAIL=test@brilliantjobs.app K6_TEST_PASSWORD=... \
  k6 run load-tests/full-suite.js
```

### Spike test (rate limit / kill-switch validation)

```bash
k6 run --env PROFILE=spike load-tests/preview-jobs.js
```

### Soak test (4-hour stability)

```bash
K6_TEST_EMAIL=test@brilliantjobs.app K6_TEST_PASSWORD=... \
  k6 run --env PROFILE=soak load-tests/dashboard-api.js
```

## Test User Setup

Before running authenticated tests, create a test user in Supabase:

```sql
-- Run in Supabase SQL Editor
-- Creates a test user for load testing (no real data)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role)
VALUES (
  gen_random_uuid(),
  'loadtest@brilliantjobs.app',
  crypt('CHANGE_ME_STRONG_PASSWORD', gen_salt('bf')),
  now(),
  'authenticated'
);
```

## Results

Results are written to `load-tests/results/` as JSON (gitignored). Each run
produces a summary in stdout with pass/fail against exit gates.

## Exit Gates (from HANDOFF.md)

All must be green before CS-022 Go/No-Go:

- [ ] No P0-class failures under load
- [ ] p95 response < 2s (all surfaces)
- [ ] Error rate < 0.1%
- [ ] Extension heartbeat stable under load
- [ ] Landing preview-jobs rate limit holds
