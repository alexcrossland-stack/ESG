# SimplyESG visual assessment and implementation plan

## Assessment — 5 September 2026

Baseline: main release `0aec0e5`. This is a front-end refinement of the existing SME workflow, not a change to ESG calculations, permissions, stored data or reporting requirements.

The core navigation is now appropriately short, but the presentation still lacks a consistent hierarchy. The reviewed source and baseline screenshots show:

1. White canvas, grey panels and grey menus make surfaces and active controls difficult to distinguish.
2. Page widths vary between four presets, while some card titles are larger than page titles. This makes moving between tasks feel inconsistent.
3. Sidebar selection resembles hover, the header is often empty, and small-screen navigation has no visible close control.
4. Overview renders three equal-weight cards in a two-column grid, leaving a large orphan area. Repeated explanatory text competes with the next task.
5. Workspace tabs have inconsistent styling. Policy route links claim tab semantics without the corresponding keyboard behavior.
6. Policy records use small edit/delete targets and can overflow on long names or document addresses. Register controls are scattered across several rows.
7. Report creation gives the Passport link a separate row and makes the main step/preview structure harder to scan.
8. The viewport disables user zoom, and the page requests roughly 25 external font families despite using only one UI family.

## Design direction

A calm, professional workspace: pale neutral-green canvas, white working surfaces, deep readable text, emerald reserved for selection and primary action, restrained borders and depth. Keep the familiar navigation order and existing feature names. No decorative hero images, new navigation levels, invented scores or hidden mandatory checks.

## Implementation sequence

### 1. Shared visual foundation and navigation

- Establish coherent light/dark surface and text tokens and use one system UI font stack; remove unused external font requests.
- Restore zoom, strengthen visible keyboard focus, respect reduced motion and give touch controls larger targets.
- Add reusable page/header primitives with consistent spacing and responsive title/action placement.
- Give the sidebar a stronger selected state, clear workspace grouping and visible mobile close action. Add a skip-to-content control and useful current-page header context.

### 2. Core workspace refinement

- Recompose Overview into compact baseline context, balanced confidence/progress panels and a clearly ranked task list. Preserve every value, disclosure and scope caveat.
- Apply a consistent page rhythm to Data & evidence, Documents, Policies, Action plan, Reports, Questionnaires and Settings.
- Unify route-navigation styling without replacing routing, unsaved-change protection or panel state.
- Improve policy toolbar/record hierarchy, mobile actions and long-text wrapping.
- Move Passport to a secondary Reports header action and strengthen the existing creation steps and preview boundary.

### 3. Verification and handoff

- Inspect rendered desktop, tablet and 360px phone layouts, light/dark themes, keyboard focus, zoom-equivalent layout and menu/dialog interactions using Playwright.
- Exercise data edit/save/back, policy create/edit/template navigation, report creation/library/export navigation and action navigation against fictional local tenants.
- Run build, TypeScript diagnostic ratchet, relevant existing unit/browser regressions and the full CI release gate. Do not skip failures or weaken thresholds to accommodate regressions.
- Record screenshots, results and remaining limits; commit and open a review PR.

## Acceptance and boundaries

The core pages should share their title position, surface hierarchy and navigation language; selected navigation and primary actions must be easy to identify; essential controls must remain reachable at 360px; keyboard focus must be visible. Calculations, report contents, permissions, tenant boundaries and unsaved-edit guards must remain unchanged.

No production records or credentials will be used for mutation tests. No schema migration or new dependency is planned. Production deployment is not included in this request and requires separate approval. This is not a full accessibility certification or a substitute for moderated SME usability research.

## Verification results

Implemented the three planned UI workstreams. The shared foundation applies throughout the product; explicit page/header and toolbar refinement covers Overview, Data & evidence, Documents, Policies, Action plan, Action tracker, Reports, Questionnaires and Settings. Existing secondary tools inherit the shared theme/controls but have not all received bespoke layout redesigns.

| Check | Result |
| --- | --- |
| Complete existing Chromium and API E2E suite | 180 passed, 0 failed; fictional local tenants |
| Focused policy suite | 11 passed, including keyboard multiselect state through review/submission and descriptive mobile edit/delete targets |
| Production build | Passed; existing PostCSS and large-chunk warnings remain |
| TypeScript diagnostic ratchet | Passed, 379/395; full TypeScript is still baseline-limited |
| Existing navigation, report-template, dashboard-period, SME action-order and usability units | Passed |
| Secret scan and lockfile consistency | Passed; no dependency changes |
| Production dependency audit | High-severity gate passed; one pre-existing moderate `qs` advisory remains |
| Desktop/phone visual inspection | 1440px Overview/Data/Policies/Reports, 360px Policies/navigation/metric editor |
| Tablet/dark inspection | 768px Settings and 1440px Reports; no horizontal document overflow at the checked narrow widths |
| Keyboard/manual interaction | Skip control moves focus to main without discarding a dirty metric; value remains 2450, save returns Saved; mobile navigation closes after selection |
| Real local report flow | Saved metric used in generated management report; data-gap caveats remain; no browser console errors on final report check |

The first integrated subset run passed 31/34. The three failures were old tab-role/breadcrumb assertions: policy links now have correct navigation semantics, and top-level header context is plain text rather than a redundant breadcrumb. Existing tests were aligned with those contracts; none were skipped or weakened. Review also caught and resolved an unsaved-edit interaction in the initial skip-link implementation, active-tab CSS specificity, tablet header compression, and long governance-owner badge wrapping.

Core token pairs were checked independently: light primary/foreground contrast 5.58:1 and muted text on cards 5.57:1; corresponding dark pairs 8.17:1 and 8.02:1. This is a focused contrast check, not an exhaustive WCAG audit. Zoom restrictions were removed and reduced-motion styles added; physical-device pinch zoom, software keyboards, screen readers and moderated SME usability testing remain follow-up validation.

Screenshots are in ignored local `output/playwright/modern-*.png`. No production account, customer data or external email/billing/AI credentials were used. CI/review status will be recorded on the PR. No production deployment has been performed for this update.
