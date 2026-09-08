# User audit remediation plan — 8 September 2026

## Scope and safeguards

Implement the seven confirmed user-audit findings. Prioritise preservation of saved data, clear SME workflows and compatibility with existing records. No production writes, database migrations or deployment are authorised by this implementation request.

## Implementation sequence

| Finding | Change | Required verification |
|---|---|---|
| F01: action edit loses details | Reset/reinitialise the form for the chosen action and each open session | Create populated records, edit one field, reload; switch records, cancel/reopen, preserve status and notes |
| F02: inconsistent action ownership | Distinguish real assigned users from existing free-text responsibility, without dropping either | Form/card agreement, persistence and permission-safe assignment |
| F03: policy task exposes an ID | Resolve a friendly policy title with safe fallback | UUID fixture produces a human-readable task and correct deep link |
| F04: policy headings/order | Canonical section ordering and narrowly scoped leading-heading normalisation | Legacy and new content, nested headings preserved, preview/export consistency |
| F05: duplicate waste concepts | Canonical presentation with compatible aliases; no historical deletion | Both aliases, enabled-state changes, completion counts, input/import/history compatibility |
| F06: calculator accessibility | Associate inputs/selectors with labels and helper text | Accessible names, keyboard access and existing calculator tests |
| F07: evidence instruction mismatch | Match empty-state wording to the actual Create Request control | Source regression and browser inspection |

## Verification and handoff

1. Add focused unit/API regressions and run affected existing checks.
2. Reproduce the corrected UI workflows with Playwright CLI against a disposable local database.
3. Run strict release acceptance, production build, TypeScript diagnostic ratchet and WebKit boot check.
4. Review the combined diff for preservation of historical data, permission boundaries and unrelated user changes.
5. Record test results and remaining limitations. Prepare the repository handoff/PR; do not merge or deploy without production approval.

Passing this work does not certify external email, payments, live AI providers or every device combination. Those remain separate staging sign-off work identified by the audit.

## Implementation decisions and evidence

- Action dialogs mount with the selected record. Partial update payloads preserve untouched fields, nulls and original dates. Free-text responsibility remains supported and is explicitly separate from real account assignment.
- Policy display-name resolution uses the generated title, then the template name, then a friendly fallback. Policy section normalization is presentation-only; stored content is not rewritten. Unfamiliar historical sections are retained.
- Waste consolidation is limited to the two named pairs of compatible manual numeric metrics. Different units/cadences/pillars and calculated metrics must not be grouped. Existing IDs, values, evidence links and saved report snapshots remain intact.
- Calculator visible labels now target their controls. Adjacent period/boundary/fuel/data-quality selectors and helper text were included in the accessibility pass.

Verified during implementation (8 September):

- Local browser action lifecycle: required-field rejection, create/reload, prefilled edit, exact title-only request, preserved description/responsibility/date/notes, cancellation/reopening and switching between two records.
- Desktop and 390px-wide action dialog checks; scrollable mobile controls remain reachable after the opening animation settles.
- Calculator accessibility tree gives names to every numeric input and selector; formerly unnamed fields can receive focus, with no horizontal overflow at 390px width.
- Policy Preview and actual downloaded text have canonical section order, one heading per section, and preserved nested/custom historical content.
- Evidence Requests empty-state instruction matches the Create Request button.

Local screenshots and replay logs are retained in `output/playwright/user-audit-fixes-20260908/`.

## Final local verification

- Strict release acceptance: **129 passed, 0 failed, 0 skipped**. This includes 81 Chromium browser journeys, 99 Playwright API scenarios, all standalone API regressions and unit contracts, production build and diagnostic/secret checks.
- New database-backed alias regression: all seven groups passed, covering legacy-only value fallback, concept counts across Overview/readiness/report readiness, tenant/role restrictions, grouped activation, direct legacy-ID bulk writes, guided input and immutable historical/report snapshot checks.
- New action lifecycle regression passed, including responsibility versus assignment, My Tasks, permission boundaries, explicit clearing, status transitions and deletion readback.
- New policy task API regression passed for title/template/friendly fallbacks, correct links, approval filtering and tenant isolation.
- TypeScript diagnostic ratchet passed at **372/395**, with no new diagnostic files or per-file increases. Existing unrelated TypeScript diagnostic debt remains.
- WebKit app boot: **1 passed** (boot check only, not full Safari coverage).
- After local restart and reauthentication, Overview displayed the friendly policy title and the correct policy link; saved action records and assignment remained present.
- Manual conflicting waste fixture: default workspace showed one Waste Generated item with value 12 and a review warning. Both original records remained accessible (12 and 15). Spreadsheet default was safely read-only for the mixed history; its explicit previous-label view exposed both original editable records without changing their values.

No database migration, production data mutation, merge or deployment was performed. The implementation is prepared for code review; production release still requires approval. A code rollback does not require reversing a data migration because original records are retained.
