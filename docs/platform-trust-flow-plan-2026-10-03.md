# Platform trust and SME flow improvement plan

Keep the seven-section navigation and existing visual language. Improve trust first,
then delivery speed, then the day-to-day workflow. Do not delete/merge historical
records, infer an authoritative policy from its title, or change production data.

## Implementation and acceptance

1. **Correct results:** aggregate history by reporting period and active site boundary;
   apply the same rules to current and previous values, preserve zero, exclude future
   periods and legacy alias duplicates. Batch tenant-scoped history and site counts.
   Acceptance: two-site 330/300 = 10%, one chart point per period; tenant isolation.
2. **Reliable refresh and failures:** checked JSON reads, validated queue payloads,
   explicit retry/stale states, bounded operational freshness, complete mutation
   dependencies and safe cross-tab refresh. Never retry writes automatically or
   overwrite a dirty form. Acceptance: short save/return and injected failures.
3. **Fast delivery:** compressed immutable hashed assets before sessions, revalidated
   HTML, real missing-resource errors, recoverable obsolete chunks, lazy Word export
   and advanced insights. Acceptance: production HTTP negotiation/cache/MIME tests.
4. **Clear context and workload:** shared month/scope/status strip, Due now versus
   all tracked, inherited carbon reporting month, confirmed compatible-source reuse,
   accessible focused controls and consistent next-task ranking.
5. **Policy lifecycle and imports:** identify known versions/drafts without merging,
   show missing owners/reviews, make adoption requirements explicit; describe CSV/
   paste formats, persist validated company-scoped column mappings and preserve
   row-level preview/errors. Keep questionnaire/report source reuse transparent.
6. **Validate:** production build, TypeScript baseline ratchet, unit/API/tenant tests,
   existing browser release gate plus local fault/short-navigation/mobile checks.
   Record evidence and limitations; external provider delivery, production monitoring,
   load targets and old-asset retention require deployment/environment validation.

## Release boundary

Commit and open a review PR after validation. Production deployment, infrastructure,
secrets, production migrations and records require separate explicit approval.
No claim that every external provider or possible workflow is error-free.

## Delivered design

- Keep the familiar sidebar. Overview leads with figures due and the primary
  next task; methodology and advanced charts remain available on demand.
- Data & evidence defaults to **Due now**. **All tracked** retains quarterly,
  annual and other workflows; guided entry, CSV/paste, history and metric setup
  remain in the same workspace. Accessible labels include units.
- Use a shared working-period/scope strip and explicit refresh controls where
  operational freshness matters. Failed requests must not become empty queues.
- Policies distinguish known template versions and separate drafts. Show owner/
  review gaps and an adoption checklist; opening an existing template policy is
  the primary action, with an explicit option to create another draft. Do not
  automatically merge records or retroactively block locked approved versions.
- Carbon offers exact compatible source inputs for confirmation, fills only
  blank fields and keeps typed drafts safe. Mixed gas/fuel metrics, other units,
  duplicate sources, other periods and other site boundaries are not guessed.
- Store validated CSV column mappings per company. Questionnaire source text
  explicitly explains that prepared answers are not silently rewritten later.

## Validation outcome

Validated using Node 24 and an isolated local PostgreSQL database. Production
records, credentials and the user's live workspace were not modified.

- Final strict release gate: **135 passed, 0 failed, 0 skipped**. This includes
  production build, secret scan, unit contracts, **81 Chromium journeys**, **99
  Playwright API tests**, and standalone API/security/RBAC/tenant/export tests.
- TypeScript ratchet: **371/395 baseline diagnostics**, no new diagnostic files
  or per-file increases. This is not a clean full-repository TypeScript check.
- Real short-navigation check: save waste = 5, return immediately to Overview;
  recorded figures update from 2 to 3 and the completed task disappears without
  reload. Task/approval/action-plan HTTP 503 injection shows errors and retry,
  not false-empty queues. HTTP status, malformed JSON and offline contracts
  are also covered by unit tests.
- Mobile Overview/carbon checked at 390px; document width remains 390px.
  Existing data/policy browser coverage also checks narrow layouts and roles.
  Advanced-insight module absent initially, loaded only after opening its section.
- Carbon reuse preserves a typed value of 123, fills a blank with recorded 400
  kWh, calculates 52.4 kgCO2e at the configured factor, and persists in history
  after reload. Historical working month inherits correctly and does not reuse
  a different month's figures. Ambiguous gas/fuel records are not offered.
- Word export unit verifies the OpenXML archive and expected heading, emphasis,
  list/table content, escaping and invalid-character sanitisation. This is not
  a visual certification in every Word/PDF viewer.
- Site summaries stay at **4 database queries for 1/10/50 sites**. A 14,400-row,
  36-month history uses **1 query**, with company and site boundaries validated.
  Recorded local storage timing is diagnostic only, not a production SLA.
- Built production app: Brotli/immutable cache/correct JavaScript MIME, no asset
  session cookie, revalidated deep-link HTML, asset 404 and JSON API 404 confirmed.
  Regression mode intentionally stops the scheduler: `/health` reports database
  connected/scheduler stopped (503), as specified by the existing CI contract.

Evidence logs/screenshots are retained locally in
`output/playwright/platform-trust-flow/` (ignored test artifacts).

## Remaining release/environment validation

Production deployment is not authorised by this implementation request. After
approval, verify exact release SHA, scheduler-running health, runtime logs and
the live user journeys. Provider calls in acceptance tests use isolated fixtures;
real email delivery, billing/webhooks and AI-provider credentials still require
their configured environment. Agree and measure production p50/p95, load and
LCP/INP/CLS rather than inferring them from compressed bundle sizes. Old hashed
asset retention through a real deployment remains a deployment follow-up; this
change provides safe chunk-failure feedback but does not promise indefinite
compatibility for tabs running an obsolete release. No existing records/history
were merged or deleted, and no schema migration is introduced by this change.
