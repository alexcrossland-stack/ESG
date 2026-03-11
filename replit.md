# ESG Manager — SME ESG Platform

## Overview

The ESG Manager is a SaaS web application designed for Small and Medium-sized Enterprises (SMEs) to streamline their Environmental, Social, and Governance (ESG) policy management, data tracking, and reporting. It aims to replace manual processes with a guided, AI-assisted platform, making ESG accessible to business owners, CFOs, HR, and operations managers without requiring prior ESG expertise. The platform provides tools for policy generation, questionnaire autofill, and carbon emissions calculation, ultimately helping businesses improve their ESG performance and reporting capabilities.

## User Preferences

No explicit user preferences were provided in the original `replit.md` file. The agent should infer best practices for coding and communication based on the project's nature (production-style SaaS application).

## Admin Controls (Settings → Administration tab)

The admin panel is organized into 9 sections accessible via button bar:
1. **Users & Roles** — Assign admin/contributor/approver/viewer roles
2. **Module Configuration** — Enable/disable 7 ESG tracking modules per company (stored in company_settings)
3. **Scoring Weights** — Set weight (0-10) and importance (critical/high/standard/low) per metric
4. **Metric Settings** — Enable/disable individual metrics, set targets, thresholds, scoring direction, data owner
5. **Policy Templates** — Activate/deactivate templates with inline toggle + full editor dialog
6. **Emission Factors** — Select which emission factor dataset version to use for carbon calculations
7. **Approval Workflow** — Toggle approval requirements for metrics/reports/policies, auto-lock approved items
8. **Report Branding** — Custom report header name, tagline, brand colour, footer text (with live preview)
9. **Audit Log** — Searchable/filterable audit log with entity type badges

New DB columns on company_settings: require_approval_metrics, require_approval_reports, require_approval_policies, auto_lock_approved, report_branding_name, report_branding_tagline, report_branding_color, report_branding_footer, emission_factor_set. Policy templates gained an `enabled` column.

## System Architecture

The application is a full-stack SaaS web application.

**UI/UX Decisions:**
- **Design System:** Utilizes Shadcn UI and Tailwind CSS for a modern, responsive interface.
- **Theming:** Supports both light and dark modes.
- **Color Scheme:** Primary color is green (`hsl(158, 64%, 32%)`).
- **Typography:** Uses Open Sans font.
- **Layout:** Features a fixed-width sidebar (14rem).
- **Onboarding:** Implements a two-path onboarding system (guided 8-step wizard or manual setup) with database persistence, autosave, and resume functionality to ease user adoption.

**Technical Implementations:**
- **Frontend:** Built with React, utilizing TanStack Query for data fetching, Wouter for routing, and Recharts for data visualization.
- **Backend:** Developed with Node.js and Express.
- **Database:** PostgreSQL is used as the primary data store, managed via Drizzle ORM.
- **Authentication:** Session-based authentication with `express-session` and `connect-pg-simple`, incorporating `bcrypt` for password hashing, rate limiting, and secure cookie practices (SameSite=lax, httpOnly, secure). RBAC (Role-Based Access Control) is implemented with four roles (admin, contributor, approver, viewer) and seven permission modules, enforced server-side via middleware and client-side via hooks.
- **Core Features:**
    - **Dashboard:** Provides an overview of ESG performance with weighted scores, category performance, submission rates, emissions trends, and alerts.
    - **ESG Policy Builder:** Allows for the creation and management of ESG policies with version history and a draft/publish workflow.
    - **Metrics Library & Data Entry:** Features 28 default ESG metrics across Environmental, Social, and Governance categories, with manual, calculated, and derived types. Supports raw data inputs, manual metric entry, and bulk Excel uploads, triggering automatic recalculation of scores.
    - **Scoring System:** Employs a traffic light system (Green/Amber/Red/Missing) for metric status and a weighted ESG scoring methodology that considers metric importance, material topics, and compliance.
    - **Action Tracker:** Manages ESG improvement actions with owners, due dates, and status tracking.
    - **Reports:** Structured report generator with 3 templates (Internal Management, Customer/Supplier Response Pack, Annual ESG Summary) and 9 configurable sections (executive summary, metrics by category, carbon summary, policy summary, actions progress, data quality flags, evidence coverage, methodology notes, approval sign-off). Reports label approved vs draft data, evidenced vs estimated values, current reporting period, and factor methodology version. Supports text and CSV export with full methodology disclosure.
    - **Evidence Management:** Tracks evidence files linked to various modules, with statuses and review workflows.
- **Workflow Management:** Key entities (metric values, raw data, reports, policies, questionnaire answers) have `workflowStatus` (draft/submitted/approved/rejected/archived) with enforced state transitions and audit trails.
- **AI Safety/Governance:** All AI-generated outputs are explicitly marked as "draft" requiring human review. AI generation metadata, including model, prompt version, user, and source data, is logged. Prompt sanitization is applied to user inputs.

**Feature Specifications:**
- **AI-Assisted Tools:**
    - **Policy Generator:** Guides users through a questionnaire to generate tailored ESG policies.
    - **Supplier Questionnaire Autofill:** Auto-suggests answers for ESG questionnaires using existing company data, providing rationale and confidence levels.
    - **Carbon Estimator:** SME-focused carbon module with versioned emission factor sets (UK DEFRA 2024), data quality tracking (actual/estimated/proxy), fuel-type-specific factors (diesel/petrol/hybrid/electric/LPG), proxy calculations from floor area, per-line-item methodology notes, assumptions tracking, and detailed text export. Rules-based calculations only (no AI).
    - **Policy Templates:** Offers 28 structured templates with guided drafting, compliance mapping, and multi-format export.
- **Calculation Engine:** Centralized service (`server/calculations.ts`) handles 12 automated ESG metric calculations using DB emission factors via `buildEmissionFactorMap()`. Raw inputs collected: 26 fields across environmental (12), social (8), governance (5 including annual_revenue), plus water_m3 (tracked but no formula).

## Notification & Reminder Framework

Auto-generated notifications scanned on dashboard load and via manual refresh button. Types:
- **metric_due** — Enabled metrics without data for current period
- **action_overdue** — Action plans past due date that aren't complete
- **policy_review** — ESG policy or generated policy reviews within 90 days
- **evidence_expiry** — Evidence files expiring within 60 days
- **questionnaire_review** — Stale questionnaires (no updates for 14+ days)
- **report_approval** — Reports in submitted/pending approval state

Deduplication via `source_key` column prevents duplicate notifications. Dashboard shows NotificationsPanel with dismiss individual/all, severity-coded items (critical/warning/info), and expand/collapse for 5+ items. Sidebar bell icon shows active notification count with polling every 60s.

DB table: `notifications` with company_id, user_id, type, title, message, severity, linked_module, linked_entity_id, link_url, due_date, dismissed, dismissed_at, dismissed_by, auto_generated, source_key, created_at.

## Phase 2 — Release 1 Features

### Task Ownership & Workflow Standardisation
- All workflow-enabled tables now have standardised `submitted_by`/`submitted_at`/`reviewed_by`/`reviewed_at`/`review_comment`/`workflow_status` columns
- Submit action sets `submitted_by`/`submitted_at` only (no longer overwrites `reviewed_by`)
- Approve/reject sets `reviewed_by`/`reviewed_at`/`review_comment` only
- 6 entity tables gained `assigned_user_id` (varchar UUID): metrics, raw_data_inputs, action_plans, esg_policies, questionnaires, evidence_files
- 3 tables gained `assigned_due_date`: metrics, raw_data_inputs, questionnaires

### New Tables
- **evidence_requests** — Status enum: requested/uploaded/under_review/approved/rejected/expired. Links requestor, assignee, module, evidence file.
- **reporting_periods** — Type enum: monthly/quarterly/annual. Status enum: open/closed/locked. Supports chaining via previousPeriodId.
- `metric_values` and `raw_data_inputs` gained `reporting_period_id` (nullable, backward compatible)

### New API Routes
- `GET /api/my-tasks` — All tasks assigned to current user
- `GET /api/my-approvals` — Pending workflow items with submitter usernames (admin/approver only)
- `PUT /api/assign/:entityType/:entityId` — Assign owner to entity (admin only)
- `GET/POST /api/evidence-requests` — CRUD for evidence requests
- `GET /api/evidence-requests/mine` — User's assigned requests
- `PUT /api/evidence-requests/:id/link` — Link evidence file to request
- `GET/POST /api/reporting-periods` — CRUD for reporting periods
- `POST /api/reporting-periods/:id/close|lock|copy-forward` — Period lifecycle
- `GET /api/reporting-periods/compare` — Period-over-period comparison

### New Frontend Pages
- **My Tasks** (`/my-tasks`) — Grouped task cards (metrics due, actions, evidence requests, policy reviews, questionnaires)
- **My Approvals** (`/my-approvals`) — Inline approve/reject with comment (admin/approver only)
- **Evidence Requests tab** — Added to evidence page with create dialog, status badges, link evidence
- **Reporting Periods admin** — Settings admin section 10th item with create, close, lock, copy-forward
- **Owner Assignment** — Reusable `OwnerAssignment` component on metrics admin (settings), action tracker

### Shared Component
- `client/src/components/owner-assignment.tsx` — Reusable dropdown for admin, read-only text for non-admin

### Admin Sections (Updated)
10 sections in Settings Administration tab (added "Reporting Periods" with Calendar icon)

## External Dependencies

- **AI Services:** OpenAI (via Replit AI Integrations, specifically `gpt-5.2`) for AI-assisted features like policy generation and questionnaire autofill.
- **Database:** PostgreSQL.
- **Session Store:** `connect-pg-simple` for storing session data in PostgreSQL.
- **Password Hashing:** `bcrypt` library.
- **UI Frameworks:** React, Tailwind CSS, Shadcn UI.
- **Data Visualization:** Recharts.
- **Data Fetching:** TanStack Query.