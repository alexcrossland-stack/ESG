# Hetzner Preflight

Use this as the final launch gate for the standalone company release on the Hetzner host.

This preflight is intentionally limited to:

- DB-backed security / tenant-isolation regression tests
- metric upsert / duplicate-prevention regression tests
- selected Playwright journeys for signup, onboarding, first metric entry, reports, admin, and viewer restrictions

Portfolio/group workflows are not part of this launch gate.

## Preconditions

- The app code is deployed at `/root/ESG`
- `.env` exists and includes `DATABASE_URL`
- The app is already reachable at `http://127.0.0.1:5000`
- Playwright dependencies are installed on the host
- The database is the same one the app is currently using

## One-Time Setup Check

Run these first:

```bash
cd /root/ESG
set -a
source .env
set +a

node -v
npm -v

test -n "$DATABASE_URL"
curl -fsS http://127.0.0.1:5000/health
```

If any of those fail, stop. Fix runtime/env first.

## Final Launch Gate

Run the full standalone-company preflight:

```bash
cd /root/ESG
set -a
source .env
set +a

export BASE_URL=http://127.0.0.1:5000

npm run test:security-db
npm run test:metric-upsert
npm run test:e2e:release
```

Or run the same gate through the combined script:

```bash
cd /root/ESG
set -a
source .env
set +a

export BASE_URL=http://127.0.0.1:5000

npm run test:preflight:standalone
```

## What Must Pass

- `test:security-db`
  - verifies auth boundaries and tenant isolation on sensitive API routes
  - covers viewer denial, contributor denial on admin-only writes, company-admin denial on super-admin routes, and cross-tenant write blocking
- `test:metric-upsert`
  - verifies uniqueness and idempotent upsert behavior for `metric_values` and `metric_definition_values`
  - covers repeated and concurrent submissions
- `test:e2e:release`
  - signup and onboarding activation journey
  - first metric entry
  - report generation
  - admin browser journeys
  - viewer restriction journeys

## If A Test Fails

Do not launch.

Capture:

- failing command
- failing test name
- HTTP status / error body
- current commit SHA
- recent app logs

Then follow [launch-rollback.md](/Users/alexcrossland/Documents/Playground/ESG/docs/runbooks/launch-rollback.md) if the candidate build is already deployed.

## Post-Preflight Sanity Check

After all tests pass:

```bash
curl -fsS http://127.0.0.1:5000/health
curl -fsS http://127.0.0.1:5000/api/onboarding/status >/dev/null
curl -fsS http://127.0.0.1:5000/api/reports >/dev/null
```

Those last two should be run with an authenticated session or bearer token if you are validating them outside the browser tests.
