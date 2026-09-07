# Consistent categories and policy editing

## Scope

Resolve duplicate-looking metric subheadings (for example `waste` and `Waste`),
equivalent Answer Library grouping/filtering inconsistencies, and simultaneous
policy editor/preview headings. This is a presentation and interaction change,
not a metric-record deduplication or database migration.

## Implementation

- Shared category keys normalise case, surrounding whitespace and word separators.
  Explicit aliases combine Health & Safety / health_safety and Data & Privacy /
  Data Privacy. Related but distinct topics remain separate.
- Metrics group by canonical category **within each pillar**. Counts, expansion
  state, accessible names and test IDs use the same grouping. Searching a category
  also finds its metrics, alongside existing name/code/description matches.
- Answer Library grouping, filters and editor selectors share the category keys.
  Custom and uncategorised options remain available. Editing text alone preserves
  the original category metadata; new or explicitly changed categories use canonical
  keys. A custom category named All cannot collide with the All Categories filter.
- Editable policies use separate Edit and Preview tabs. Preview includes current
  draft text and metadata; switching tabs preserves edits and Save remains available.
  Locked/read-only policies show only the complete preview. Opening another policy
  resets document-local state. Exported section headings remain intact.

## Validation — 7 September 2026

- Production build passed using Node 24 and the repository build script.
- TypeScript diagnostic ratchet passed: 374/395 inherited diagnostic allowance,
  no new diagnostic files or per-file increases. Full TypeScript is not clean.
- Existing Chromium browser regressions: **29/29 passed** — Metrics/data workspace
  and navigation 18/18, policy workspace 11/11. These suites use mocked APIs.
- Category normalisation assertions passed; Answer Library unit cases 6/6 passed;
  generated-document Markdown cases 30/30 passed; four related metric/workspace/
  SME reliability unit contract files passed.
- Separate Playwright CLI checks used real APIs and a disposable local PostgreSQL
  database with fictional users and fixtures:
  - Ten metric alias pairs combine once in their respective pillars; all 84 fixture
    catalogue entries retain unique IDs, enabled counts and individual controls.
  - Expand/collapse all and category searches work; relevant name/description
    matches outside the category remain visible.
  - A fictional metric activation survives reload, then is restored to disabled.
  - Seven Answer Library filter choices (including custom All and Uncategorised)
    return the expected records. Search works with the grouped results.
  - Custom-category and null-category answers save their text without silently
    changing category; the saved answer remains correct after reload.
  - Policy text, owner, approver and review date survive tab switching, keyboard
    navigation, saving from Preview and reload. One Purpose heading is visible.
  - TXT export retains the heading and saved content/metadata.
  - Desktop and 360px layouts were checked; no document-width overflow.

Local browser screenshots and fixture setup are in ignored `output/playwright/`.
The local free-plan account returns an existing entitlement denial for optional
compliance links; the existing answer dialog also emits an accessibility-description
warning. Neither prevents category filtering or answer persistence. No live user
data or production services were changed.

## Delivery and rollback

No schema changes, catalogue rewrites, production data updates or deployment are
included. Existing IDs, values, units, formulas and activation states are preserved.
Reverting this client change restores the previous presentation without a data
rollback. Production deployment requires separate authorisation.
