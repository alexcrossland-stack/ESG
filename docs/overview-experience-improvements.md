# Overview experience improvements

## Scope

The monthly Overview now leads with “Your ESG at a glance”, followed by one primary task and two quieter follow-ups. Optional data-confidence detail follows the tasks; advanced analysis remains collapsed initially. Existing category-heading and policy Edit/Preview changes in commit `769b0e7` are included in this release.

- Recorded/total counts use canonical readiness counts, not rounded percentages. No metrics due, unavailable responses and genuine zero results are distinct.
- Action and policy review counts are explicitly company-wide and relative to today. Policy reviews distinguish overdue from due within 30/90 days.
- Report readiness is a baseline threshold, not report approval or a compliance assessment.
- One comparable individual metric can be highlighted, avoiding mixed-unit area aggregates. With insufficient history, show guidance or a clearly lifetime report milestone; never invent a trend.
- Tasks retain urgent ordering, diversify routine work, preserve independent metric records and show available owners. Restricted users receive view destinations rather than approval/edit CTAs.
- Historical/future month selections are labelled and retained. The current-month shortcut requires an explicit click.
- Saved-period advanced readiness uses the full saved-period identity; monthly metric scoring retains its existing month anchor. Advanced loading/errors do not replace the selected-month summary with unrelated figures. Missing-data links explain longer-period navigation.
- Repeated advanced onboarding/task/milestone narratives and their unused component definitions have been removed.

## Validation

All write testing used the disposable local PostgreSQL database and fictional companies. No production data was created or changed during validation.

- Build passed (existing PostCSS and large-chunk warnings remain).
- TypeScript diagnostic ratchet passed; the repository still has pre-existing full-typecheck debt.
- 29 existing Chromium metrics/navigation/policy regressions passed.
- 19 final affected journeys passed: onboarding, admin data/report flows, live dashboard invalidation, connected period/evidence/report flow, viewer UI/API restrictions and Chromium/WebKit boot.
- New unit suites cover period identity, historical/future dates, exact counts, unavailable/empty/error rendering, policy review windows, trend comparability, task diversity, ownership and role-safe links.
- Local Playwright CLI acceptance checks passed for populated/empty/error/retry/milestone states, monthly versus annual scope, four roles, keyboard disclosure and 360/768/1280px overflow checks. Desktop, mobile and dark-theme screenshots were visually inspected.
- Secret scan, lockfile dry-run, deployment workflow lint and production high-severity dependency audit passed. The audit retains a pre-existing moderate `qs` advisory; no dependency changes are included.

The browser acceptance fixture responses are explicitly fictional and local only. Production verification must remain read-only and confirm the deployed SHA after the existing full release gate and production workflow succeed. Existing advanced company-wide programme, maturity and data-quality widgets have not been redefined as period-specific in this change.
