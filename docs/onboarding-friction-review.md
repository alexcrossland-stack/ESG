# Onboarding Friction Review
**Date:** March 2026  
**Reviewer:** Task Agent (Task #61)  
**Method:** Manual code walkthrough of the full first-user journey  
**Scope:** Onboarding wizard → first metric entry → first evidence upload → first report generation + dashboard and help-centre review

---

## 1. Executive Summary

A manual walkthrough of the complete first-user journey was conducted against the live codebase. Twelve friction points (F-01 through F-12) were identified across the journey, ranging from high-severity blockers that would cause measurable drop-off to low-severity clarity gaps. The most significant risks are:

1. The evidence upload form asks for a **filename typed by hand** — no real file picker — which breaks user mental models and may prevent first evidence completion.
2. The **Quick Start path bypasses all of the onboarding wizard** and lands users on the dashboard with no personalised metrics or action plan, creating a blank-state experience that is confusing for new users.
3. The **Data Entry page has two entry modes** (Raw Data and Manual Metrics tabs) with no onboarding guidance on which to use, causing paralysis for first-time users.

---

## 2. Journey Walkthrough — Observed Friction Points

### Step 0 — Landing choice screen: Guided Setup vs Quick Start

**What happens:** The first screen offers two paths: "Guided Setup (7 steps, ~5 min, Recommended)" or "Quick Start (Jump straight in with defaults)".

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-01 | The Quick Start path immediately calls `POST /api/onboarding/complete` with `path: "quick_start"` and redirects to the dashboard with default metrics. No company name, industry, employee count, or topic selection is collected. The dashboard then shows a generic "Score in progress" state with no next-step signposting that references the user's actual business. | **HIGH** | The trade-off between speed and personalisation is not surfaced to the user. The Quick Start label implies speed, but the consequence (no action plan, no tailored metrics, no ESG maturity baseline) is not communicated before the user clicks. |
| F-02 | There is no time estimate for Quick Start. The Guided Setup correctly says "~5 minutes". A user choosing Quick Start because they "don't have 5 minutes right now" will likely never return to complete their profile. | **MEDIUM** | Missing copy. |

**Measurement gap:** `ONBOARDING_COMPLETED` fires for both paths with a `path` property, so split is measurable. However, there is no event for "user viewed the landing screen" or "user chose quick start despite seeing guided setup", so session-level intent cannot be inferred without a page-view event.

---

### Step 1 — Company Profile

**What happens:** Collects company name, industry, country, employee count, and operational profile. Has inline validation that surfaces missing fields.

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-03 | The "Number of Employees" field has no guidance on what counts (full-time only? contractors? group total?). The label shows "(full-time equivalent)" in smaller muted text but there is no tooltip or example to resolve ambiguity for users who employ a mix of full-time and part-time staff. | **LOW** | Missing micro-copy / tooltip. |

**Measurement gap:** `ONBOARDING_STEP_COMPLETED` fires with `{ step: 1, stepKey: "profile" }` — this gives completion data. Time-on-step is not captured so it is impossible to know if users are pausing or abandoning on this field.

---

### Step 2 — ESG Maturity Quiz

**What happens:** 5 yes/no/not-sure questions. Computes a maturity level (Starter / Developing / Established) and shows a result card before the user advances.

No significant friction identified. The "Not sure" option is present for each question, which reduces abandonment caused by uncertainty. The maturity result is explained clearly. The step is well-structured.

---

### Step 3 — ESG Priorities (Topic Selection)

**What happens:** Topics are pre-selected based on industry (from `INDUSTRY_TOPICS` map). User must select at least 1.

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-04 | Industry-based pre-selection is correct and reduces effort. However, the pre-selected state is not visually distinguished from user-selected state — the user cannot easily tell which topics were chosen for them vs which they added. If a user deselects all industry-recommended topics and then wonders "is this okay?", there is no guard or prompt. | **LOW** | Visual design: no "industry recommended" badge on pre-selected topics. |

---

### Step 4 — Reporting Setup (Metric Selection + Frequency)

**What happens:** Metrics are pre-selected based on topic choices. Frequency dropdown defaults to "monthly". User can add/remove metrics.

No significant friction. The frequency recommendation copy ("Monthly is recommended — you can enter figures straight from your utility bills") is clear and reduces decision fatigue. Auto-calculated metrics are labelled clearly.

---

### Step 5 — First Data Entry (in wizard)

**What happens:** Optional step where the user can enter one data value inside the wizard itself using a quick-entry form with a metric dropdown and value field.

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-05 | Step 5 is marked valid (`isStepValid()` returns `true` when step === 5`) whether or not the user has entered any data. The step can be skipped silently. The label ("First Data Entry") implies something must be done, but the UI does not confirm or prompt if the user skips it. Users who skip this will land in the post-onboarding state with no data entered, triggering the `FIRST_DATA_ADDED` event gap. | **MEDIUM** | The opt-out is invisible. A summary like "You can skip this — we'll remind you from the dashboard" would set expectations. |

---

### Step 6 — Evidence Linking (in wizard)

**What happens:** User can enter a description and select a module to link evidence to. This is a text-only form — there is no file upload widget.

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-06 | The evidence step inside the wizard only collects a description and linked module — it does not upload an actual file. Users who complete this step believing they have "uploaded evidence" will be surprised when they later visit the Evidence page and find it empty. The step description reads "Attach a supporting document" but nothing is actually attached. This is the highest risk of all wizard steps for creating a false sense of completion. | **HIGH** | The wizard captures intent but not the action. The gap between the wizard's evidence step and the real evidence upload flow (on `/evidence`) is not bridged. |

**Measurement gap:** `FIRST_EVIDENCE_UPLOADED` is defined in `AnalyticsEvents` but is not fired inside the wizard's evidence step. It would only fire if the user later independently navigates to the Evidence page and uploads a file there. This means the wizard evidence step creates no telemetry signal and no completion incentive.

---

### Step 7 — ESG Action Plan

**What happens:** An action plan is generated (server-side or via a local fallback) and displayed: recommended policies, recommended metrics, recommended evidence types, and reporting frequency.

No significant friction. The plan is clear and actionable. However:

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-07 | The completion screen after Step 7 has two CTAs: "Add your first data point" (primary) and "Go to dashboard" (secondary). The primary CTA correctly directs to the most important next action. However, users who click "Go to dashboard" have no contextual reminder of what to do next unless the activation checklist card is visible. If the activation checklist is already complete (e.g. the user entered data in Step 5), the card is hidden and the dashboard shows the full platform with no clear next step. | **MEDIUM** | `ActivationCard` hides when `activationComplete` is true. For a first-time user, "activation complete" may not mean "set up correctly". |

---

## 3. Post-Onboarding: Data Entry Page

**What happens:** User arrives at `/data-entry`. The page has two tabs: "Raw Data" and "Manual Metrics".

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-08 | The two-tab data entry model (Raw Data vs Manual Metrics) is not explained anywhere in the onboarding. "Raw Data" tab asks for source inputs (kWh, litres, tonnes) and auto-calculates derived metrics. "Manual Metrics" tab asks for final metric values directly. A first-time user does not know which tab to use. Both tabs show data for the same period and can overwrite each other. The page description says "Enter raw data and record manual metric values" but does not explain the relationship between the two. | **HIGH** | The conceptual model (raw inputs → derived metrics vs manually-entered metric values) is a platform-level concept that requires upfront explanation. |

**Measurement gap:** No telemetry event distinguishes between a user who saves data via the Raw Data tab vs the Manual Metrics tab. The `FIRST_DATA_ADDED` event fires in both paths but carries no tab context property.

---

## 4. Post-Onboarding: Evidence Page

**What happens:** User arrives at `/evidence`. Upload dialog opens. Form fields include: filename (text input — not a file picker), file type, description, linked module, linked period, expiry date.

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-09 | The evidence upload form uses a plain `<Input>` for the filename field — it is a text box, not a file chooser. Users who expect to browse their file system will not understand what to type. The placeholder "e.g. electricity-bill-jan-2025.pdf" hints at intent, but does not resolve the fundamental UX problem: the user must know the filename of their document and type it manually. This is a known friction point for non-technical users. | **HIGH** | The evidence model stores metadata only (no binary file storage), but this is not communicated to the user. A label like "Enter the name of the document you are referencing" would reduce confusion. |

**Measurement gap:** `FIRST_EVIDENCE_UPLOADED` fires when evidence is successfully uploaded. There is no event for "user opened upload dialog but did not complete" (dialog abandon rate). This is a measurable gap once real users are present.

---

## 5. Post-Onboarding: Reports Page

**What happens:** User arrives at `/reports`. They see report templates (Board Summary, Customer Response Pack, Compliance Summary, Full ESG Report), export options, and a preview panel.

No critical friction identified for the first-user journey. The page has good empty-state handling via the `EmptyState` component when no reports exist, and the `ActivationCard` on the dashboard points users here.

Minor observation: The distinction between "ESG Report Exports" (structured data exports such as the ESG Metrics Summary) and "Report Templates" (narrative reports) is not labelled clearly on the page. A first-time user may not understand which to use.

---

## 6. Help Centre Review

**What happens:** The help centre at `/help` has 7 categories, search, featured articles, and a contact support form.

**Strengths:**
- The search field has placeholder text showing query examples: "try 'score', 'evidence', 'report'".
- The "Start here" section surfaces featured articles for new users.
- The `ContextualHelpLink` component is used in the Evidence upload dialog to surface "What counts as evidence?", and is present in several data-entry contexts.
- The AI support assistant (Pro only) is available as a floating chat button throughout the platform.

| # | Friction Point | Severity | Likely cause |
|---|---|---|---|
| F-10 | There are no help-centre entry points within the onboarding wizard itself. A user who is confused by "ESG maturity", "Scope 1 vs Scope 2", or "what is a metric?" during onboarding has no in-context help link. The `EsgTooltip` component exists and is used occasionally (e.g. on the maturity step), but help article links are absent from the wizard. | **MEDIUM** | The wizard was built separately from the help centre. The `ContextualHelpLink` pattern used elsewhere was not carried into the wizard screens. |
| F-11 | The AI support assistant is gated behind the Pro plan. During onboarding — the highest-value moment for AI guidance — free-tier users see an upgrade prompt rather than contextual help. This removes the most effective onboarding support tool at the moment it is most needed. | **MEDIUM** | Business model constraint. |
| F-12 | The help centre has no article specifically about the two-tab data entry model (Raw Data vs Manual Metrics). The "Adding Data" category covers individual metric entry but not the relationship between raw inputs and derived metrics. | **MEDIUM** | Content gap. |

---

## 7. Telemetry Event Map

The following table maps the 6 telemetry events defined in Task #59 (`client/src/lib/analytics.ts`) to the journey steps reviewed above.

| Event | `event_name` | Journey Step | Coverage | Gap |
|---|---|---|---|---|
| `ONBOARDING_STEP_COMPLETED` | `onboarding_step_completed` | Each of the 7 wizard steps (fired in `saveAndNext()`) | **Full** — fires with `{ step, stepKey }` | Step 5 and 6 can be skipped; completion ≠ the user did something useful |
| `ONBOARDING_COMPLETED` | `onboarding_completed` | Wizard completion (Step 7 → "Finish") and Quick Start path | **Full** — fires with `{ path: "guided" | "quick_start" }` | No time-in-wizard property; no step-where-drop-off-would-have-been-for-quick-start |
| `ONBOARDING_DROPPED` | `onboarding_drop_off` | Fires on component unmount if wizard was showing and completion hadn't fired | **Partial** — fires with `{ step_reached }` | Only fires on component unmount; browser tab close or navigation to another tab within the SPA may not trigger it reliably |
| `FIRST_DATA_ADDED` | `first_data_added` | Data Entry page (Raw Data save and Manual Metric save) | **Full** — fires with `{ period }` or `{ period, source: "manual" }` | Does not fire when the wizard Step 5 quick-entry is used (separate code path). Does not distinguish Raw vs Manual tab. |
| `FIRST_REPORT_GENERATED` | `first_report_generated` | Reports page (fires on report download) | **Full** — present in reports page analytics import | No properties captured (no template type, no period, no format) |
| `FIRST_EVIDENCE_UPLOADED` | `first_evidence_uploaded` | Evidence page (on successful upload mutation) | **Partial** — defined in constants but NOT confirmed to be fired in evidence upload flow | Wizard Step 6 does not fire this event. Must verify it fires in the Evidence page upload mutation's `onSuccess`. |

### Measurement Gaps Summary

| Gap | Description | Recommended Event / Property |
|---|---|---|
| G-01 | No page-view event for the onboarding landing screen | `onboarding_landing_viewed` |
| G-02 | No signal for "user opened Quick Start but abandoned before completion" | `onboarding_path_selected { path }` before the API call |
| G-03 | `FIRST_DATA_ADDED` does not fire from wizard Step 5 quick-entry | Add `trackEvent(AnalyticsEvents.FIRST_DATA_ADDED, { source: "wizard" })` in Step 5 save handler |
| G-04 | `FIRST_DATA_ADDED` does not capture entry mode (raw vs manual) | Add `{ mode: "raw" | "manual" }` property |
| G-05 | `FIRST_REPORT_GENERATED` has no properties | Add `{ template, format, period }` |
| G-06 | `FIRST_EVIDENCE_UPLOADED` may not be wired to the evidence upload `onSuccess` | Verify and add to `uploadMutation.onSuccess` in `evidence.tsx` |
| G-07 | Evidence upload dialog abandon rate is not tracked | `evidence_upload_dialog_opened` on dialog open |
| G-08 | `ONBOARDING_DROPPED` drop-off step is not reliable for SPA in-tab navigation | Supplement with server-side audit log on `PUT /api/onboarding/step` |

---

## 8. Prioritised Recommendations

The following are ordered by estimated impact on first-user completion rates, grouped by effort level.

### High Priority — Fix before first live user cohort

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| R-01 | **Rename and reframe the wizard Step 6 (Evidence):** Rename it "Evidence Checklist" not "Evidence Linking". Add copy explaining that evidence is uploaded separately at `/evidence` after setup. Remove the implication that "attaching" happens here. | F-06 | Low |
| R-02 | **Add a real file description to the Evidence upload form:** Change the filename label to "Document name or reference" and add a placeholder like "e.g. Electricity Bill January 2025" to clarify that this is a text reference, not a file chooser. Add a callout: "You are recording a reference to a document you hold — no file is stored here." | F-09 | Low |
| R-03 | **Add consequences copy to the Quick Start path:** Before or alongside the Quick Start card, add a one-line note: "Skips personalisation — your dashboard will show generic defaults until you complete your profile." | F-01 | Low |
| R-04 | **Add an explanatory header to the Data Entry page:** Above the tab bar, add a short callout or tooltip explaining the two-mode model: "Raw Data mode: enter source figures (kWh, litres) and we calculate your metrics automatically. Manual mode: enter final metric values directly." | F-08 | Low |

### Medium Priority — Address in first UX iteration sprint

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| R-05 | **Wire `FIRST_EVIDENCE_UPLOADED` to the evidence upload `onSuccess`:** Verify and add the missing telemetry call. Add `{ source: "evidence_page" }` property. | G-06 | Low |
| R-06 | **Add `{ source: "wizard" }` `FIRST_DATA_ADDED` event to wizard Step 5 save path.** | G-03 | Low |
| R-07 | **Add `{ template, format, period }` properties to `FIRST_REPORT_GENERATED`.** | G-05 | Low |
| R-08 | **Add help article links into the onboarding wizard steps:** At minimum, add a "What is ESG maturity?" link on Step 2, and "What are Scope 1 and 2 emissions?" on Step 4. Use the existing `ContextualHelpLink` pattern. | F-10 | Low |
| R-09 | **Add an `onboarding_path_selected` event** before the Quick Start and Guided Setup API calls, so path intent is captured even if the session drops before completion. | G-02 | Low |
| R-10 | **Post-onboarding dashboard: add a re-entry point for profile completion when Quick Start was used.** If `company.onboardingPath === "quick_start"` and key profile fields are missing, show an "Improve your results: complete your profile" card. | F-01 | Medium |

### Low Priority — Include in backlog for UX review

| # | Recommendation | Addresses | Effort |
|---|---|---|---|
| R-11 | **Add an employee count tooltip** clarifying FTE definition. | F-03 | Low |
| R-12 | **Mark industry-recommended topics with a visual "Recommended" chip** on Step 3 so users understand what was pre-selected for them vs what they added. | F-04 | Low |
| R-13 | **Add a "No data entered yet" confirmation prompt on Step 5** if the user clicks Next without entering any data: "You haven't entered a data value yet. You can add one now or do it from the Data Entry page after setup." | F-05 | Low |
| R-14 | **Add a help article on the two-tab data entry model** ("Should I use Raw Data or Manual Metrics?") in the "Adding Data" category. | F-12 | Medium |
| R-15 | **Consider unlocking one AI assistant message for free users during onboarding** — or providing a non-AI onboarding chatbot — to reduce support load from confused new users. | F-11 | High |

---

## 9. Appendix — Files Reviewed

| File | Role in Journey |
|---|---|
| `client/src/pages/onboarding.tsx` | Full onboarding wizard (7 steps) + landing + completion screens |
| `client/src/pages/dashboard.tsx` | Post-onboarding landing; activation checklist; next-step banner |
| `client/src/pages/data-entry.tsx` | First data entry page; Raw Data and Manual Metrics tabs |
| `client/src/pages/evidence.tsx` | Evidence upload form; evidence list |
| `client/src/pages/reports.tsx` | Report templates; export panel |
| `client/src/pages/help.tsx` | Help centre homepage; article search; support form |
| `client/src/pages/help-article.tsx` | Individual help article renderer |
| `client/src/components/support-assistant.tsx` | Floating AI chat assistant |
| `client/src/lib/analytics.ts` | Telemetry event definitions (Task #59) |
| `client/src/lib/help-content.ts` | Help article content and category definitions |

---

*This is a code-walkthrough analysis only. No code changes were made as part of this review. All recommendations are inputs for a follow-up UX fix task.*
