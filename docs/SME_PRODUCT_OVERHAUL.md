# SME Product Overhaul

## Product promise

Help an SME turn information it already holds in bills, payroll, accounts, policies, and operational records into a credible ESG baseline it can improve and share.

The everyday journey is:

1. Set the company scope.
2. Measure a small, relevant set of ESG inputs.
3. Support important figures with evidence.
4. Choose and manage practical improvements.
5. Share a clear baseline report or reuse the information in a request.

The product should expose complexity only when it creates value for the company. Framework mappings, calculations, evidence provenance, site scoping, audit history, and report snapshots remain strong platform capabilities even when they are not primary navigation choices.

## Experience principles

### Start with business language

Use words such as bills, people, waste, policies, actions, and report. Framework codes and specialist ESG terminology should be available in context, not required to begin.

### Ask once, reuse everywhere

A value, source, document, policy, or answer entered once should be reusable in dashboards, calculations, reports, questionnaires, and future reporting periods.

### Show one next action

Home must resolve competing prompts into one highest-value action. Supporting detail may explain why, but it must not introduce a second action queue.

### Make confidence visible

Every reported figure retains its period, organisational or site boundary, source type, actual/estimated status, evidence links, methodology, and review state. "Evidence-backed" is reserved for baselines with sufficient measured data and unique metric evidence.

### Hide before deleting

The first releases simplify the product surface while retaining routes, permissions, data, and APIs. Domain deletion or migration happens only after telemetry shows the new journeys cover existing customer needs.

## Information architecture

### Home

- Plain-language baseline status
- Data completeness and evidence confidence
- One next action
- Compact Environmental, Social, and Governance progress
- Detailed scores, trends, alerts, recommendations, and milestone history in Advanced insights

### Measure

- Guided priority inputs first
- Tracked metrics with source, note, and inline evidence
- Calculated outputs displayed read-only
- Optional inputs progressively disclosed and spreadsheet import kept in a dedicated tab
- Metric library and custom metrics available in Advanced

### Improve

- One improvement plan combining actions and targets
- Simple policy/practice next steps
- Owners, due dates, status, and expected benefit
- Materiality, risks, recommendations, approvals, and detailed policy tools available in Advanced

### Share

- One primary SME ESG baseline report
- Clear status and caveats
- Report history and immutable snapshots
- Public profile and reusable questionnaire answers
- Custom report packs, framework exports, and branding available in Advanced

### Utilities

- Settings
- Help
- Site selector when a company has active sites
- Portfolio and administration only for eligible roles

## Default and advanced capability

Always visible:

- Home
- Measure
- Improve
- Share
- Settings and Help

Progressively disclosed:

- Metrics catalogue and custom metrics
- Framework configuration and readiness
- Formal materiality assessment
- Carbon calculator detail
- Risk register
- Benchmarks
- Questionnaires and answer library
- Policy generator, templates, and register
- Team tasks and approvals
- Sites, portfolio, integrations, branding, and enterprise controls

Hidden platform capability that remains active:

- Tenant isolation, roles, audit, MFA, SSO, and data governance
- Metric definitions, mappings, raw inputs, calculations, and emission factors
- Evidence metadata, scanning, provenance, and review status
- Reporting periods, site scope, report snapshots, and generated files
- Policies, topics, targets, actions, and risk records consumed by reporting
- Billing, entitlements, jobs, alerts, telemetry, and administration

## Baseline integrity rules

- Include balanced Environmental, Social, and Governance coverage.
- Collect direct operational inputs; never ask users to type calculated metrics.
- Label data as measured, estimated, or missing.
- Count evidence by unique supported metric, not number of uploaded files.
- Require both data completeness and evidence coverage before using an evidence-backed status.
- Show calculation methodology and material caveats in exports.
- Do not use a single composite ESG score as the main product outcome.

## Delivery phases

### Phase 0 — Trustworthy activation

- Preserve metric UUIDs through onboarding and submission.
- Exclude calculated and derived metrics from editable starter inputs.
- Use one current reporting period across onboarding and Home actions.
- Clearly separate focused guided-input progress from full active-metric readiness.
- Make evidence part of evidence-backed status.
- Nominate one canonical status and next-action resolver.

### Phase 1 — SME shell

- Replace the specialist-first sidebar with Home, Measure, Improve, and Share.
- Put existing specialist routes under Advanced.
- Replace overlapping Home prompts with one baseline summary and one next action.
- Default Measure to priority inputs and progressively reveal optional detail.

### Phase 2 — Unified workspaces

- Combine data and evidence into one Measure workflow.
- Combine targets, actions, policies, and recommendations into one Improvement Plan.
- Combine reports, public profile, questionnaires, and reusable answers into Share.
- Add a single SME Home read model backed by the canonical status engine.

### Phase 3 — Domain consolidation

- Select canonical metric, policy, action, and framework models.
- Add explicit adapters and foreign keys between legacy and canonical records.
- Backfill, dual-read, verify, and only then retire legacy APIs and tables.

## Success measures

North star:

- Median time from signup to first evidence-backed baseline report.

Activation measures:

- Percentage completing company setup, first measured value, first supporting document, and first report within seven days.
- Median number of screens visited before first report.
- Abandonment at each onboarding step.

Ongoing value measures:

- Monthly baseline update rate.
- Percentage of entered information reused in a later report or questionnaire.
- Improvement actions completed on time.
- Percentage of shared reports with sufficient measured-data and evidence coverage.

Guardrails:

- No loss of tenant, permission, site, provenance, or audit controls.
- No increase in failed metric submissions or report generation failures.
- Existing advanced routes and saved records remain accessible throughout surface simplification.

## Release acceptance criteria

- A new SME can understand the four primary areas without ESG training.
- The first useful input can be entered from a normal business record.
- Calculated metrics cannot be manually submitted through onboarding.
- One Home action consistently points to the next incomplete activation milestone.
- Optional and specialist tools are discoverable but do not dominate the default journey.
- A baseline cannot be labelled evidence-backed when supporting evidence is below the defined threshold.
- Build, focused unit tests, core activation tests, navigation tests, and browser smoke tests pass.
