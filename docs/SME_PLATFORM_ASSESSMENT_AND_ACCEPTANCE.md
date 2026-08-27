# SimplyESG SME Platform Assessment and Release Acceptance

**Assessment date:** 27 August 2026

**Scope:** current `esg-sme-market-leading` worktree and the companion SME platform market assessment

**Decision:** the implementation passes the local release-candidate acceptance described below. It should not yet be described as production-ready, externally assured or proven market-leading until staging integrations and live-SME outcome measures pass.

## Executive Summary

SimplyESG should position itself as **the shortest trusted path from everyday SME records to an evidence-backed ESG baseline that can be improved and reused for customers, tenders and voluntary reporting**.

The market lesson is not to reproduce an enterprise ESG suite. Greenly and Zellar show the value of guided simplicity; Normative and Sumday show why carbon calculations need provenance; FuturePlus shows how assessment should lead to action; DiginexESG shows the value of tasks, evidence and approvals; Position Green shows the importance of standards maintenance; EcoVadis shows the commercial importance of procurement-ready evidence; and Sweep shows the potential—and complexity risk—of supplier collaboration.

The current implementation applies those patterns through four primary jobs—**Home, Measure, Improve and Share**—with specialist workflows behind **Advanced**. It adds an explainable status model, evidence states, factor provenance, ranked improvement actions, VSME and PPN 006 readiness, reusable report templates and a public ESG Passport. It deliberately avoids an opaque composite score or a claim of certification.

The defensible position is therefore:

- broader than a carbon calculator, but much simpler than an enterprise reporting suite;
- more operational than a questionnaire-only assessment;
- more trustworthy than a self-declared badge because readiness is tied to company facts, evidence, period and site;
- more useful than a one-off report because the same information can support improvement, customer requests and future disclosures.

The local application, database, role, tenant and browser paths have now been validated. Production release remains conditional on the external-service, storage, operational and accessibility items explicitly marked below.

## Target SME Positioning

| Decision | Recommended position |
|---|---|
| Primary user | An SME owner, finance/operations lead or generalist who has ESG requests but no dedicated sustainability team |
| Trigger | A customer questionnaire, tender, lender request, board need, voluntary VSME baseline or desire to improve performance |
| Promise | Turn bills, payroll, accounts, policies and operating records into a credible baseline, a short action plan and reusable outputs |
| Product wedge | Evidence-led VSME and procurement readiness across environmental, social and governance topics |
| Experience principle | One clear next action; ask once and reuse; business language first; specialist detail only when opened |
| Trust principle | Show measured, estimated and missing data separately; expose source, factor, period, site, approval and evidence state |
| Explicit non-position | Not an external rating, legal opinion, independent assurance, certification or substitute for a specialist where one is required |

“Market-leading” should be measured as the **fastest low-friction route to a decision-useful, auditable SME ESG pack**, not as the largest feature list.

## Market Lessons and Product Decisions

The comparison is qualitative. It uses public vendor materials, not a like-for-like hands-on procurement exercise, and does not assign unsupported numeric rankings.

| Theme | Product pattern worth adopting | SimplyESG response | Complexity or claim to avoid |
|---|---|---|---|
| Simplicity | Greenly and Zellar use guided journeys and plain actions to reduce the blank-page problem | Four primary jobs, progressive **Advanced**, compact onboarding and one next action | A module-first enterprise menu, long setup project or mandatory specialist terminology |
| VSME | Greenly, DiginexESG and Position Green make formal reporting approachable through guided requirements and maintained mappings | VSME catalogue, conservative requirement mappings, framework readiness and a dedicated VSME report template | Treating a framework definition as completed disclosure; hiding version changes; implying compliance or assurance |
| Procurement | EcoVadis demonstrates that SMEs invest when evidence can answer buyer and tender requests | PPN 006 requirement set and readiness pack, questionnaires, answer reuse and a shareable ESG Passport | Copying an opaque external score or promising equivalence with a buyer's own rating |
| Evidence | DiginexESG, FuturePlus and EcoVadis make documents, review and workflow central to credibility | Per-metric evidence, source-linked/reviewed/evidence-backed states, approval history and assurance-pack metadata | Counting files instead of unique covered facts; accepting stale, cross-period or cross-site evidence as current |
| Carbon provenance | Normative and Sumday emphasise traceable calculations; Plan A links footprints to reduction planning | Versioned factors, units, source URLs, methodology notes, fail-closed missing-factor behaviour and report/passport provenance | Silent hard-coded fallbacks, unexplained estimates or presenting a free estimate as disclosure-grade accounting |
| Collaboration | DiginexESG and Sweep use owners, tasks, approvals and supplier coordination to move work through an organisation | Role-gated entry and approval, owners, due dates, evidence, tasks and questionnaires; advanced workflow remains available | Making a small firm configure an enterprise workflow before it can record its first fact |
| Outputs | DiginexESG supports formal outputs; Greenly supports customer reporting; EcoVadis creates a reusable commercial result | Shared report-template catalogue, VSME and PPN packs, customer/board/annual outputs, assurance pack and privacy-controlled public Passport | One universal report, unverifiable badges, public leakage or an unexplained headline score |

## Platform-by-Platform Assessment

This is a product-pattern assessment based on public vendor material, not a scored procurement exercise or a claim that every product was hands-on tested. Packaging, pricing and capabilities should be rechecked during procurement.

| Platform | Strongest capabilities | SME fit and trade-off | What SimplyESG should learn or avoid |
|---|---|---|---|
| [Greenly](https://greenly.earth/en-us/products/vsme) | Guided carbon accounting, VSME/ESG reporting, integrations, audit trail and expert support | A strong guided route for firms that begin with carbon and grow into disclosure; the broader suite and advisory model can be more than a small firm needs initially | Match the guided journey and reuse of source data, but keep the first baseline self-serve and separate evidence-backed facts from AI-drafted narrative |
| [Zellar](https://www.zellar.com/) | Explicit SME focus, simple emissions capture, practical actions, cost-saving prompts and shareable progress | One of the clearest examples of low-friction sustainability action for smaller organisations; its centre of gravity is environmental action and supply-chain emissions rather than full evidence-led E/S/G disclosure | Preserve one clear next action and visible business benefit; go deeper on social, governance, requirement evidence and approval without importing enterprise navigation |
| [Normative](https://normative.io/platform/) | Detailed Scope 1–3 accounting, extensive factor coverage, calculation traceability, reduction planning and specialist support | Strong when a defensible carbon inventory is the primary need; its depth and implementation/support model can be heavier than a generalist SME needs for its first customer request | Treat factor source, version, unit, boundary and calculation trail as product data; do not make a full carbon programme a prerequisite for a useful SME ESG baseline |
| [Sumday](https://www.sumday.io/carbon) | Accounting-led carbon ledger, audit-ready workpapers, site/project breakdown and workflows suited to finance and advisers | Particularly credible for accountants, finance teams and supplier engagement; narrower than a complete environmental, social, governance and procurement-readiness workspace | Make carbon feel like a controlled finance process and support adviser reuse; retain a broader E/S/G evidence model and simple non-carbon entry path |
| [FuturePlus](https://future-plus.co.uk/about-us/our-methodology/) | Broad sustainability assessment, actual-versus-ambition framing, practical roadmap and human guidance | Accessible for organisations wanting a rounded improvement programme; a proprietary score can become the result rather than the underlying facts a buyer needs | Keep assessment-to-action momentum and plain guidance, but make raw evidence, requirement status and caveats more prominent than any composite score |
| [DiginexESG](https://www.diginex.com/sustainability-reporting) | Guided framework selection, materiality, assigned data/evidence, approvals, audit-ready reporting and exports | Strong disclosure workflow for lean teams, but its multi-framework enterprise breadth can create setup and terminology overhead for a small first-time reporter | Adopt requirement tasks, owners, evidence and approval; reveal that machinery only when the user opens Framework Readiness or an advanced workflow |
| [Position Green](https://www.positiongreen.com/) | Central sustainability data hub, maintained standards, reporting automation, carbon management and expert advisory | Strong single source of truth for sophisticated or multi-entity organisations; explicitly enterprise-grade configuration may exceed the needs of a typical standalone SME | Maintain standards and reuse data across outputs, while defaulting SimplyESG to a preconfigured SME baseline rather than a configurable reporting implementation |
| [EcoVadis](https://ecovadis.com/solutions/ratings/) | Buyer recognition, supplier network, document-backed assessment and a reusable procurement result | Commercially powerful where a customer requests the rating; it is an external assessment relationship, not a day-to-day internal ESG operating system, and scoring can feel opaque | Optimise for buyer-ready evidence and reuse, but never imply equivalence with EcoVadis or hide readiness behind an unexplained score |
| [Sweep](https://www.sweep.net/) | Value-chain data collection, supplier collaboration, carbon/ESG data management, targets and enterprise-scale workflows | Strong for complex Scope 3 and network coordination; collaboration and configuration breadth can be disproportionate for a small company starting alone | Keep lightweight invitations and supplier collection as later extensions; do not burden the core SME flow with network administration |
| [Plan A](https://plana.earth/) | Carbon measurement, emissions intelligence, decarbonisation planning and standards-aligned expert support | Strong measure-to-reduce carbon proposition; less directly centred on full SME E/S/G evidence and tender-response workflows | Connect measured hotspots to a short reduction plan, while differentiating through social/governance facts, VSME/PPN readiness and the ESG Passport |

### Comparative conclusion

No assessed pattern combines all of the following in one deliberately small SME journey: a broad E/S/G baseline, explicit measured/estimated/missing states, requirement-level evidence and approval, five ranked actions, VSME and UK procurement readiness, and a privacy-controlled reusable Passport. That combination is SimplyESG's credible differentiation. It remains a product hypothesis—not proof of market leadership—until SMEs complete the journey faster, with less support and with higher output reuse than credible alternatives.

## Implemented Product Changes

This is a code-level implementation assessment of the current worktree, not a statement that all changes are deployed.

### Home — know where the business stands

- A canonical status model reports completeness, measured/estimated/missing states, evidence confidence and the next recommended action. Annual and quarterly contexts include contained sub-period facts while excluding out-of-period, rejected, archived and inactive-site records ([`server/esg-status.ts`](../server/esg-status.ts), [`server/reporting-context.ts`](../server/reporting-context.ts)).
- The SME dashboard turns that state into a concise overview rather than a dense analytics surface ([`client/src/components/sme-dashboard-overview.tsx`](../client/src/components/sme-dashboard-overview.tsx), [`client/src/lib/get-next-action.ts`](../client/src/lib/get-next-action.ts)).
- Onboarding focuses on the smallest relevant data set and does not ask users to type calculated or derived metrics ([`client/src/pages/onboarding.tsx`](../client/src/pages/onboarding.tsx), [`client/src/lib/onboarding-metrics.ts`](../client/src/lib/onboarding-metrics.ts)).

### Measure — enter once, understand confidence

- Data entry is metric-type aware, supports period/site scope and exposes evidence against the specific fact being entered ([`client/src/pages/data-entry.tsx`](../client/src/pages/data-entry.tsx), [`shared/data-entry-metrics.ts`](../shared/data-entry-metrics.ts)).
- Evidence states distinguish **Evidence needed**, **Source linked**, **Reviewed** and **Evidence-backed** rather than treating upload as assurance ([`client/src/lib/metric-evidence-state.ts`](../client/src/lib/metric-evidence-state.ts), [`server/assurance-pack.ts`](../server/assurance-pack.ts)).
- Carbon calculations retain factor year, source, methodology and units, and fail closed when a required factor is absent ([`shared/emission-factor-metadata.ts`](../shared/emission-factor-metadata.ts), [`server/seed-emission-factors.ts`](../server/seed-emission-factors.ts), [`server/calculations.ts`](../server/calculations.ts)).

### Improve — turn gaps into a manageable plan

- The Control Centre presents a ranked top-five improvement plan with owner, status, due date, evidence, expected result and reason ([`client/src/pages/control-centre.tsx`](../client/src/pages/control-centre.tsx), [`client/src/lib/sme-improvement-plan.ts`](../client/src/lib/sme-improvement-plan.ts)).
- Recommendations use the same canonical reporting period and active-site boundary as status and reporting, so an old fact or archived-site evidence cannot suppress or improve current-period work ([`client/src/pages/recommendations.tsx`](../client/src/pages/recommendations.tsx), [`server/routes.ts`](../server/routes.ts)).
- Full workloads and specialist tools remain discoverable through progressive disclosure, while viewer access remains read-only.

### Share — answer real requests without overstating confidence

- A shared template catalogue includes management, customer, annual, board and compliance outputs plus dedicated **VSME Readiness & Draft Pack** and **PPN 006 Readiness Pack** templates ([`shared/report-templates.ts`](../shared/report-templates.ts)).
- Framework readiness is company-specific and requires one concrete reporting period for every score and export; all-period and arbitrary date-range readiness claims fail closed. Saved fiscal periods are selectable in both quick exports and the main report builder, with authoritative server-owned dates and human-readable output labels. Site scope remains explicit. A mapped metric definition alone is missing; a contained sub-period value is partial and receives no strict score credit; an exact-period fact can advance readiness; approval and evidence are explicit. Policies, targets, risks, narratives and evidence are not inferred from catalogue availability ([`server/framework-readiness.ts`](../server/framework-readiness.ts), [`client/src/pages/framework-readiness.tsx`](../client/src/pages/framework-readiness.tsx), [`client/src/pages/reports.tsx`](../client/src/pages/reports.tsx)).
- The VSME and PPN 006 catalogues use direct mappings only where one fact can satisfy the requirement; multi-input and documentary requirements remain partial or evidence-led ([`server/seed-frameworks.ts`](../server/seed-frameworks.ts)).
- The public ESG Passport shares allowlisted, explainable facts—including boundary, period, completion numerator/denominator, evidence confidence and carbon basis—without an opaque score ([`shared/esg-passport.ts`](../shared/esg-passport.ts), [`client/src/pages/public-profile.tsx`](../client/src/pages/public-profile.tsx)).
- Report caveats distinguish drafts, estimates and incomplete data from external-ready output ([`server/report-engine.ts`](../server/report-engine.ts)).

### Administration and trust controls

- The default information architecture is Home, Measure, Improve and Share; specialist routes sit in Advanced ([`client/src/lib/navigation.ts`](../client/src/lib/navigation.ts)).
- Company Admin, Editor, Approver, Viewer and Super Admin permissions separate entry, policy editing, report generation, administration and platform control ([`shared/schema.ts`](../shared/schema.ts), [`client/src/lib/permissions.ts`](../client/src/lib/permissions.ts)).
- Company, period and site scope is carried through readiness, evidence and status logic; public sharing is token-bound and section-allowlisted.

## Release Acceptance Matrix

Role shorthand: **manage** means the area's permitted write/approval actions; **view** means authenticated read access; **read-only fallback** means Measure opens the Metrics view rather than data entry. Super Admin rights are platform-wide but should still respect the selected company context.

| Area | Functional acceptance outcome | Company Admin | Editor / Contributor | Approver | Viewer | Super Admin | Automated evidence in the worktree | Runtime status |
|---|---|---|---|---|---|---|---|---|
| Home | Shows one clear next action, balanced E/S/G status, measured/estimated/missing data and explainable evidence confidence; no opaque composite score | View | View | View | View | View | [`esg-status-state.test.ts`](../tests/unit/esg-status-state.test.ts), [`esg-status-reporting-context.test.ts`](../tests/unit/esg-status-reporting-context.test.ts), [`dashboard-score-period.test.ts`](../tests/unit/dashboard-score-period.test.ts), [`dashboard.test.ts`](../tests/api/dashboard.test.ts) | Local acceptance passed |
| Measure | Relevant editable metrics only; unit/type validation; period/site scope; evidence attached to the specific fact; carbon basis visible | Manage | Enter data and evidence | Read-only fallback | Read-only fallback | Manage | [`data-entry-metric-type.test.ts`](../tests/unit/data-entry-metric-type.test.ts), [`metric-evidence-state.test.ts`](../tests/unit/metric-evidence-state.test.ts), [`emission-factor-provenance.test.ts`](../tests/unit/emission-factor-provenance.test.ts), [`evidence-audit.browser.spec.ts`](../tests/e2e/evidence-audit.browser.spec.ts) | Local acceptance passed |
| Improve | Presents no more than five priority actions by default; each has owner, status, due date, evidence, result and rationale; full work remains available progressively | Manage | View and edit where the underlying policy/action permission permits | View | View only | Manage | [`sme-improvement-plan.test.ts`](../tests/unit/sme-improvement-plan.test.ts), [`recommendations-period.test.ts`](../tests/api/recommendations-period.test.ts), [`control-centre-improve.browser.spec.ts`](../tests/e2e/control-centre-improve.browser.spec.ts) | Local acceptance passed |
| Share | Generates audience-specific outputs with caveats; readiness reflects company facts; approved public content is allowlisted and revocable | Generate, approve, configure and share | Read; complete permitted questionnaires | Generate/approve reports | Read only | Full tenant and platform control | [`sme-framework-catalog.test.ts`](../tests/unit/sme-framework-catalog.test.ts), [`report-template-contract.test.ts`](../tests/unit/report-template-contract.test.ts), [`framework-readiness-contract.test.ts`](../tests/unit/framework-readiness-contract.test.ts), [`framework-readiness-boundary.test.ts`](../tests/api/framework-readiness-boundary.test.ts), [`reports.spec.ts`](../tests/e2e/reports.spec.ts), [`esg-passport.test.ts`](../tests/unit/esg-passport.test.ts), [`esg-passport-public.test.ts`](../tests/api/esg-passport-public.test.ts), [`public-esg-passport.browser.spec.ts`](../tests/e2e/public-esg-passport.browser.spec.ts) | Local acceptance passed |
| Admin | Tenant settings, sites, framework settings, templates and users are hidden or rejected for non-admin roles; platform administration remains Super Admin only | Manage company | No access | No access | No access | Manage platform and companies | [`navigation-structure.test.ts`](../tests/unit/navigation-structure.test.ts), [`permissions.test.ts`](../tests/api/permissions.test.ts), [`navigation.browser.spec.ts`](../tests/e2e/navigation.browser.spec.ts) | Local acceptance passed |
| Cross-cutting trust | Cross-company access is rejected; period/site filters do not leak or inflate readiness; generated and public claims preserve provenance and caveats | In scope | In scope | In scope | In scope | In scope when acting in a tenant | [`framework-readiness-contract.test.ts`](../tests/unit/framework-readiness-contract.test.ts), [`framework-readiness-boundary.test.ts`](../tests/api/framework-readiness-boundary.test.ts), [`esg-status-reporting-context.test.ts`](../tests/unit/esg-status-reporting-context.test.ts), [`assurance-pack-evidence.test.ts`](../tests/unit/assurance-pack-evidence.test.ts), [`permissions.test.ts`](../tests/api/permissions.test.ts) | Local acceptance passed |

### Test evidence actually executed for this assessment

On 27 August 2026, the final fail-closed local release gate completed **81/81 steps with no failures or skips**. It included:

- a production build, tracked-secret scan and TypeScript diagnostic ratchet;
- all 28 unit contract files;
- 51/51 Chromium browser journeys covering signup, onboarding, Home, Measure, evidence, Improve, Share, framework completion, settings/security, role restrictions and connected site/period flows;
- 98/98 Playwright API journeys;
- 70/70 API security, RBAC and tenant-isolation assertions and 18/18 metric upsert assertions;
- all 45 standalone API regression files, including carbon, evidence, yes/no metrics, canonical period/site boundaries, saved fiscal reporting, VSME/PPN reporting, PDF/DOCX/JSON integrity, public Passport privacy, authentication, rate limiting and audit logging;
- a WebKit application-boot check (1/1) and a manual Firefox smoke of Home, Measure, Improve and Share with zero browser-console errors;
- both schema migrations applied twice to isolated PostgreSQL 16, including preservation of an explicitly selected historical emission-factor set;
- GitHub Actions syntax/security validation, zero vulnerabilities in both full and production dependency audits, and a clean diff whitespace check.

The repository still contains **395 pre-existing TypeScript diagnostics across 26 files**. The new ratchet fails if this branch adds a diagnostic, adds a diagnostic file or increases any per-file count; this branch passes at 395/395. This debt should be reduced separately and is not represented as a clean raw type-check.

## Mandatory Release-Validation Gates

Release approval should require recorded evidence for all of the following:

1. A new SME can complete onboarding, enter a first fact, attach evidence, receive a useful action and generate a caveated output without specialist help.
2. The same journey works for Company Admin, Editor, Approver and Viewer, including direct-URL denial—not only hidden controls.
3. Two-company, two-period and two-site scenarios prove isolation and prevent evidence or readiness from being credited to the wrong scope.
4. VSME and PPN 006 packs show the correct requirement version, missing items, methods, estimates, caveats and factor provenance.
5. Public Passport tests prove token isolation, approved-only reports, section revocation, privacy filtering and no accidental unpublished data.
6. Supported desktop/mobile browsers, keyboard navigation, focus order, contrast, empty states and failure recovery are checked on the four core jobs.
7. Production database migrations, object/file persistence, email, AI, billing (if enabled), logging, backup/restore and incident monitoring are exercised in the release environment.

**Runtime status:** gates 1–5 passed locally. Gate 6 is partially complete: Chromium journeys, WebKit boot and Firefox core-route smoke passed, but a dedicated WCAG audit, complete keyboard/focus/contrast pass and full supported mobile-device matrix remain. Gate 7 is partially complete: idempotent PostgreSQL 16 migrations and no-AI startup/fallback passed locally; live email, AI, billing, durable object storage, backup/restore, monitoring and staging deployment were not exercised.

## Known External-Service and Assurance Limitations

| Dependency or boundary | Current limitation | Safe product behaviour / release requirement | Runtime status |
|---|---|---|---|
| AI drafting | Requires configured OpenAI-compatible credentials and may produce incomplete or incorrect narrative | Keep AI optional, preserve non-AI workflows and require human review before approval or sharing | No-key startup/fallback passed; live provider not tested |
| Transactional email | Invites, password flows and notifications depend on the configured email provider and sender domain | Fail visibly, retain an admin recovery path and test deliverability, expiry and replay protection | Token/security paths passed; delivery not tested |
| Billing | Self-service billing depends on configured payment-provider keys; it is not part of ESG evidence quality | Do not block entitled users when billing is intentionally disabled; validate webhooks and entitlement changes if enabled | RBAC/disabled-state paths passed; live provider not tested |
| File/evidence storage | Durability, malware controls, retention, restore and download headers depend on the production storage arrangement | Validate private storage, tenant-bound access, backup/restore, safe content handling and lifecycle policy before external use | Local lifecycle/access passed; production durability and restore not tested |
| External data integrations | The assessed SME path does not establish live coverage for every accounting, utility, HR, travel or supplier system | Keep manual/CSV entry clear and honest; do not market unsupported connectors | Manual/CSV paths passed; live connectors not tested |
| Standards and factors | VSME, procurement rules and emission factors change over time; seeded mappings are maintained product content | Assign owners, version content, record change dates and regression-test affected calculations and reports | 2026 catalogues/factors passed locally; ongoing content ownership required |
| Assurance and ratings | SimplyESG records evidence and workflow but is not an independent assurer or EcoVadis-equivalent external rating | Label readiness packs and the Passport as self-reported unless an independent review is explicitly recorded | Claim/caveat contracts passed; no external assurance performed |

## Remaining Post-Release Opportunities

Prioritise these only after the simple core journey is proven in live SME use:

### Next — strengthen the trusted path

1. **Import once, reuse everywhere:** focused Xero, Sage, QuickBooks, utility, payroll and travel imports with preview, reconciliation and source lineage.
2. **Framework content operations:** versioned requirement-to-fact mappings, change alerts and explicit links for policy, target, risk, narrative and requirement-level evidence.
3. **Procurement response workspace:** reusable buyer answers, request-specific gaps, owners, due dates and exportable response packs without building a full enterprise supplier suite.
4. **Carbon ledger and auditor export:** richer calculation lineage, controlled factor updates, Scope 3 category depth and a compact source-to-factor-to-result workpaper.
5. **Collaboration inbox:** role-specific reminders, comments, approvals and exceptions around the existing simple action plan.

### Later — extend reach without diluting simplicity

1. Time-limited data rooms, branded Passport/report variants and machine-readable exports.
2. Adviser/accountant portfolio workflows with explicit client isolation and review status.
3. Supplier invitations and lightweight collection for material Scope 3 categories.
4. Independent assurance and verification partner hand-offs, clearly separated from SimplyESG's own status labels.
5. Multilingual outputs and jurisdiction packs, released only with maintained content ownership.

### Product success measures

Track outcomes that reinforce the position, especially median time to first complete fact, first evidence-backed metric, first five-action plan and first approved reusable output; completion and abandonment by step; percentage of outputs reused for a second request; and support demand per active SME. Do not optimise for module usage or the number of fields collected.

### Open decisions before general availability

1. Which initial buying trigger leads the go-to-market message: customer/tender response, voluntary VSME reporting or accountant/adviser delivery?
2. Which two or three imports remove the most work for the first target segment, based on observed pilot data rather than vendor feature parity?
3. Will independent review be a partner hand-off, a premium workflow or out of scope—and how will that boundary appear in every shared output?

## Evidence Basis and Caveats

- Product intent: [`docs/SME_PRODUCT_OVERHAUL.md`](SME_PRODUCT_OVERHAUL.md).
- Market sources are the official vendor pages linked in the platform-by-platform table: Greenly, Zellar, Normative, Sumday, FuturePlus, Diginex, Position Green, EcoVadis, Sweep and Plan A; reviewed 27 August 2026.
- Official reference points: [European Commission Recommendation C(2026) 5011 on voluntary sustainability reporting for SMEs](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=intcom:C(2026)5011), [EFRAG VSME standard](https://knowledgehub.efrag.org/eng/interactive/vsme/vsme-standard-annex-i/2025-07-30-ec-rec/30/a), [UK PPN 006 Carbon Reduction Plans](https://www.gov.uk/government/publications/ppn-006-taking-account-of-carbon-reduction-plans-in-the-procurement-of-major-government-contracts/ppn-006-taking-account-of-carbon-reduction-plans-html) and [UK 2026 GHG conversion factors](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026).
- This assessment reflects the release-candidate branch and its isolated local acceptance environment. It is not evidence that external services, staging operations or real-SME outcomes have passed.
- Vendor capabilities, packaging and regulatory status change. Re-verify primary sources during procurement and before making public compliance claims.

## Recommendation

Proceed with this branch as a **release candidate** for staging and controlled SME pilots, using the exact-commit release gate before any deployment. Keep the product centred on **simple input, visible confidence, five useful actions and reusable evidence-backed outputs**. Do not claim production readiness, external assurance or market leadership until the remaining staging integrations, accessibility matrix and measurable pilot outcomes pass.
