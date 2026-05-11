# Report Library Deploy Readiness

Date: 2026-05-11

Scope: Report Library manual QA hardening and deploy-readiness validation after PR #51. No production deploy was performed as part of this check.

## Status

- Build: passed.
- Security regressions: passed.
- Report Library and report-generation focused regressions: passed.
- Migration required: no.
- Production deploy performed: no.

## Validation

Commands run against the local Postgres validation database:

```bash
npm run build
DATABASE_URL=postgresql://esgtest@127.0.0.1:55432/esg_pr4_report_access SECURITY_TEST_BASE_PORT=5120 npm run test:security:api
DATABASE_URL=postgresql://esgtest@127.0.0.1:55432/esg_pr4_report_access SECURITY_TEST_BASE_PORT=5130 npm run test:security:browser
DATABASE_URL=postgresql://esgtest@127.0.0.1:55432/esg_pr4_report_access SECURITY_TEST_BASE_PORT=5140 npm run test:security
BASE_URL=http://127.0.0.1:5150 DATABASE_URL=postgresql://esgtest@127.0.0.1:55432/esg_pr4_report_access npx playwright test tests/e2e/reports.spec.ts --project=api
BASE_URL=http://127.0.0.1:5150 DATABASE_URL=postgresql://esgtest@127.0.0.1:55432/esg_pr4_report_access npx playwright test tests/e2e/report-generation.spec.ts --project=api
BASE_URL=http://127.0.0.1:5150 DATABASE_URL=postgresql://esgtest@127.0.0.1:55432/esg_pr4_report_access npx tsx tests/api/reports.test.ts
```

Focused results:

- `tests/e2e/reports.spec.ts --project=api`: 8/8 passed.
- `tests/e2e/report-generation.spec.ts --project=api`: 8/8 passed.
- `tests/api/reports.test.ts`: 22/22 passed.
- `npm run test:security:api`: passed.
- `npm run test:security:browser`: passed.
- `npm run test:security`: passed.

## Readiness Observations

- Report Library file actions use secured API download URLs and do not depend on local filesystem paths.
- No new unsafe debug output was found in the Report Library flow. Existing server/test logging remains verbose in local regression runs.
- Local validation emits expected optional-service warnings when `RESEND_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`, and `STRIPE_SECRET_KEY` are unset. Production should continue to provide the required environment values for enabled email, AI, and billing paths.
- Existing deferred build warnings remain: Browserslist data age, a PostCSS `from` option warning, and chunk-size warning. The former `import.meta` CommonJS warning in `server/seed-pe-demo.ts` was removed in the production deploy-prep pass.

## Deploy Checklist

- Confirm production environment variables for email, AI integration, billing, session secret, database, and generated-file storage are present.
- Confirm generated-file retention and download audit logging remain enabled.
- Deploy from `main` only after PR checks pass.
- After deployment, run a read-only smoke check for the Reports tab:
  - Historical reports load.
  - Search/filter/sort/pagination work.
  - A selected historical report opens the expected snapshot.
  - Available generated files can be opened by an authorized user.
  - Expired/deleted files remain unavailable with clear messaging.
