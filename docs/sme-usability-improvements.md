# SME usability improvements — 5 September 2026

## Release scope

Implements the highest-impact reliability and daily-workflow recommendations from the 4 September UX assessment. This is an implementation/review branch, not a production deployment. No production records, credentials or infrastructure were changed, and no new database migration is required.

### Delivered

- Onboarding: correctly prefilled company details, numeric/Yes–No controls, finite-number validation, truthful saved-item completion feedback and continuity into the selected reporting year/month.
- Company profile: store a size band separately from exact headcount in existing onboarding metadata. Show the band in Settings and Passport; preserve onboarding industry values not in Settings' option list.
- Data: company-scoped working month shared with Overview, Action plan and Reports; stable loading defaults; unsaved-edit warnings for links, browser exit/history, local modes/periods and sidebar site/logout controls; preserve pending edits during refetches; acknowledge confirmed saves only.
- Data presentation: one clear entry action, compact filters, editable figures before calculated results, less repeated status/quality detail, readable values with their periods, default metrics catalogue view limited to what the company tracks.
- Overview and actions: three actionable next steps with explanation and precise metric/period links; manual source figures precede calculated outputs; My work, review submissions and action creation are discoverable with existing role restrictions.
- Policies: one searchable list for existing and template-created policies, one Add policy entry point, template starter shortlist, collapsed governance details, loading/error/empty states and a scrollable small-phone editor with reachable Save.
- Reports: lead with the available management report, reveal other formats on request, retain working month and present an explicit choose/period/review sequence. Passport sits in Reports' navigation context.
- Questionnaires: lead with New response and Upload request; clarify the separate builder; remove raw-ID entry fallbacks in the answer library.
- Presentation: more consistent working-page widths/headers, compact mobile evidence counters, separate Company and Account & security settings, corrected contributor-role wording, SimplyESG product branding, named theme control and mobile sidebar closes on selection.

## Verification

All data-changing tests used fictional tenants in an isolated PostgreSQL database. Local browser checks used Chromium at 1440×1000, 390×844 and 360×640. Build and final command-line regressions use Node 24.19.0, within the repository's supported range.

| Check | Result |
| --- | --- |
| Production build | Passed; existing PostCSS and large-chunk warnings remain |
| TypeScript diagnostic ratchet | Passed at 379/395 diagnostics; full TypeScript remains baseline-limited |
| Targeted unit test files | 8 passed: onboarding values/cadence, employee sizes, period/boundary resolution, action ordering, workspace state, raw mutation and navigation |
| API security/RBAC/tenant isolation | 70 passed |
| Metric upsert, spreadsheet validation/commit, typed Yes/No | 18 passed |
| Evidence multipart, persistence/download, MIME/size, permissions and tenant checks | 25 passed |
| Policy records and attachment lifecycle | 9 passed |
| Public Passport accuracy and privacy | 8 passed |
| Secret scan | Passed, 502 tracked/staged files checked |
| Normal local startup health | HTTP 200: database connected and scheduler running; regression mode intentionally disables the scheduler |

Real-browser checks completed: fresh signup and all onboarding steps; four saved starter values including Yes and No; working month carried into data, Overview and report selection; edited metric cancel/discard/save/reload; policy creation at small-phone size; existing and template-created policies in one list; search and no-match feedback; template policy opens in the existing viewer; action creation from Action plan; industry and company-size band survive Settings save/reload; report generation with entered figures and explicit gaps; mobile sidebar closes and data page has no horizontal overflow. A locally seeded template draft exercised list/view integration, not external AI generation.

Local screenshot evidence is under `output/playwright/ux-improvements-2026-09-05/` (ignored by Git). These are fictional-company screenshots, not live customer data.

Cancelling browser Back restores the editing URL and retains the entered value. Cancelling logout retains the value and session. Saving the edited value was independently confirmed in PostgreSQL after a server restart. Local authentication requires signing in again after restart; this release does not change session persistence. Initial development/restart console errors were followed by fresh-page checks; missing external-service credential warnings remain expected in the isolated environment.

## Boundaries and follow-up work

This is not a claim that every feature, role, integration or assessment recommendation is complete or exhaustively tested.

1. Fully unify report/dashboard readiness definitions across monthly, quarterly and annual scopes. This release aligns working-month context and labels the monthly dashboard denominator, but existing report readiness algorithms are not replaced.
2. Extend the existing spreadsheet workflow with a general XLSX file-mapping/import wizard if required. Existing paste/import safety controls remain; no arbitrary-workbook importer was added.
3. Complete one customer-questionnaire wizard with reviewed provenance and export. This release simplifies its entry points, not the entire underlying workflow.
4. Further tailor starter metrics/templates by business context. The template shortlist is a practical starting selection, not a determination of legal requirements.
5. Validate email, billing, real AI-generated output and all plan/role combinations in a credentialled non-production environment. These integrations were intentionally not configured locally.
6. Conduct moderated SME usability testing, screen-reader/zoom/keyboard/contrast review and real-device software-keyboard tests. Browser viewport checks are not a complete accessibility certification.
7. Review historical employee counts that may previously have been derived from size-band upper limits. The original band cannot be reliably inferred, so existing records are not silently rewritten.
8. Confirm the support email destination with the product owner; do not invent a replacement for the existing address. Legal-entity wording is not globally rebranded.

## Deployment and rollback

Production deployment requires explicit approval under repository policy and was not performed. Review and CI must precede deployment. No schema migration is added. A code rollback is possible, but the older frontend does not understand newly stored size bands; retain the new metadata and review the onboarding/profile compatibility implications before reverting. Do not roll back by deleting user data.

### Deployment preparation following owner approval

The owner subsequently requested production deployment. The first full CI run was blocked by browser/API assertions tied to the old interface. The existing tests now exercise the replacement controls rather than removed badges or hidden panels; permission, persistence, scope and export-content assertions remain in place. Follow-up fixes synchronise Passport's initial month after company context loads, include the canonical reporting-period key in the framework-summary filename, and show an inline Saved acknowledgement only after a confirmed metric save.

The production dependency audit passes its high-severity gate but reports one moderate `qs` finding; no dependency upgrade or exception to the release threshold is included. Lockfile consistency passes. Production deployment remains conditional on a successful exact-commit full release gate and the existing manual deployment workflow, including backup/restore rehearsal and public health checks. The previous live release is `71f632847b26a28f6a697cdfa3c5e705a5170de0`.

Local deployment-preparation checks: the revised onboarding/report suite passed 18/18; the affected Chromium run passed 40/41, exposing an intermittent nested policy-menu pointer lock. The menu now uses non-modal interaction alongside the modal editor; the previously failing full policy journey then passed three consecutive repeats. All other affected Chromium cases passed, including cadence-aware saving, multi-site data/evidence/report continuity and security controls. The complete CI gate remains the deployment authority; no tests were skipped or release thresholds weakened.
