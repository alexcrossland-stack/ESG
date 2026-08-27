# Hetzner Preflight

Use this as the final launch gate for a disposable, production-like Hetzner test host. Never run the mutating test commands in this document against production or a shared staging database.

This preflight is intentionally limited to:

- DB-backed security / tenant-isolation regression tests
- metric upsert / duplicate-prevention regression tests
- selected Playwright journeys for signup, onboarding, first metric entry, reports, admin, and viewer restrictions

Portfolio/group workflows are not part of this launch gate.

## Preconditions

- The app code is deployed to an isolated test checkout
- `.env` exists and includes `DATABASE_URL`
- The app is already reachable at `http://127.0.0.1:5000`
- Playwright dependencies are installed on the host
- `DATABASE_URL` points to a disposable database created solely for this test run
- Evidence uploads use disposable storage

The Playwright global setup seeds tenants directly through SQL. The security, upsert, API and browser suites create, update and delete records. Do not point `test:preflight:standalone`, `test:release`, `db:push`, Playwright global setup or `tests/api/*.test.ts` at production.

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

If the candidate has already reached production, follow the rollback checklist in [production-deployment.md](./production-deployment.md) and first confirm database compatibility with the previous release.

## Post-Preflight Sanity Check

After all disposable-environment tests pass, production receives read-only public probes plus an approved internal-tenant smoke test only:

```bash
curl -fsS https://www.simplyesg.co.uk/health
curl -fsS -o /dev/null https://www.simplyesg.co.uk/
test "$(curl -sS -o /dev/null -w '%{http_code}' https://www.simplyesg.co.uk/api/auth/me)" = "401"
```
