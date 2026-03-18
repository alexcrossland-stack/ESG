# ESG Manager — SME ESG Platform

## Overview

The ESG Manager is a SaaS web application designed for Small and Medium-sized Enterprises (SMEs) to simplify Environmental, Social, and Governance (ESG) policy management, data tracking, and reporting. It replaces manual processes with an AI-assisted platform, making ESG accessible to business owners, CFOs, HR, and operations managers regardless of prior ESG expertise. Key capabilities include policy generation, questionnaire autofill, and carbon emissions calculation. The project aims to become the leading ESG platform for SMEs, helping them achieve sustainability goals and meet reporting requirements efficiently.

## User Preferences

No explicit user preferences were provided in the original `replit.md` file. The agent should infer best practices for coding and communication based on the project's nature (production-style SaaS application).

## System Architecture

The application is a full-stack SaaS web application.

**UI/UX Decisions:**
- **Design System:** Shadcn UI and Tailwind CSS for a modern, responsive interface.
- **Theming:** Supports light and dark modes with a primary green color (`hsl(158, 64%, 32%)`).
- **Typography:** Uses Open Sans font.
- **Onboarding:** V2 7-step guided wizard: Company Profile → ESG Maturity Assessment (5-question quiz scoring to Starter/Developing/Established) → ESG Priorities (with business benefit statements) → Reporting Setup → First Data Entry → Evidence Linking → Your ESG Action Plan (rule-based, no AI). Action plan saved to `esgActionPlan` jsonb column on companies table. Endpoint: POST /api/onboarding/action-plan.

**Technical Implementations:**
- **Frontend:** React, TanStack Query for data fetching, Wouter for routing, Recharts for data visualization.
- **Backend:** Node.js with Express.
- **Database:** PostgreSQL managed via Drizzle ORM.
- **Authentication:** Session-based authentication with `express-session`, `connect-pg-simple`, `bcrypt` for password hashing, rate limiting, and secure cookies. Role-Based Access Control (RBAC) supports four roles (admin, contributor, approver, viewer) and seven permission modules, enforced server-side and client-side.
- **Core Features:**
    - **Dashboard:** Overview of ESG performance, weighted scores, emissions trends, and alerts.
    - **ESG Policy Builder:** Create and manage policies with version history and draft/publish workflow.
    - **Metrics Library & Data Entry:** 28 default ESG metrics supporting manual, calculated, derived types, and bulk Excel uploads.
    - **Scoring System:** Traffic light system for metric status and weighted ESG scoring.
    - **Action Tracker:** Manage ESG improvement actions.
    - **Reports:** Structured report generator with configurable sections, supporting text and CSV export.
    - **Evidence Management:** Track evidence files linked to various modules.
    - **Workflow Management:** Key entities have `workflowStatus` with enforced state transitions and audit trails.
    - **AI Safety/Governance:** AI-generated outputs are marked as "draft" requiring human review.
    - **Admin Controls:** Comprehensive panel for managing users, roles, configurations, scoring, metrics, templates, emission factors, and audit logs.
    - **Notifications & Reminders:** Auto-generated notifications for due dates, overdue actions, reviews, and expiry.
    - **Reporting Periods:** Management of data entry and reporting cycles.
    - **Data Quality Score System:** Per-metric quality scores.
    - **Compliance Framework Mapping:** Integration with compliance frameworks (e.g., GRI, ISO 14001, UN SDGs).
    - **ESG Control Centre:** Aggregated view of outstanding ESG issues with an ESG Gap Score.
    - **Customer Procurement Answer Library:** CRUD for pre-approved ESG answers.
    - **Recommendations Engine:** Rule-based recommendations (missing data, overdue actions, compliance gaps).
    - **ESG Programme Status:** GET /api/programme/status computes overall completion % (maturity 20%, metrics 40%, policies 25%, evidence 15%), policies/metrics/evidence counts, and prioritised next-best-actions. Displayed as ProgrammeStatusCard on dashboard.
    - **Page Guidance Panels:** `client/src/components/page-guidance.tsx` — collapsible blue info panel on policy, metrics, evidence, topics, reports pages. Dismissible per page via localStorage. Shows: summary, "what good looks like", and numbered steps.
    - **In-app Support Assistant:** `client/src/components/support-assistant.tsx` — floating chat panel (bottom-right), globally rendered in ProtectedApp. Uses POST /api/chat/assist (OpenAI gpt-4o-mini, graceful fallback). Shows suggested questions when fresh. Page-aware and company-context-aware.
    - **Action Plan Banner:** Dashboard shows dismissible banner (localStorage) when esgActionPlan is populated. Links to policy generator and metrics.
    - **Questionnaire AI Response Generator:** AI-powered Q&A generation from questionnaire text.
    - **ESG Company Profile:** Professional, public-shareable ESG profile page.
    - **ESG Benchmarking:** Comparison against 7 SME reference benchmarks.
- **Performance & Reliability:**
    - **Background Job Scheduler:** Recurring and on-demand jobs with retry logic and idempotency.
    - **Platform Health Monitoring:** Super-admin dashboard for scheduler status, API errors, health events, and background job history.
    - **PDF/DOCX Report Engine:** Generates branded reports.
    - **Carbon Data Import:** Two-step import process with column auto-mapping.
    - **Security Hardening:** Helmet.js, CORS restrictions, body size limits, environment validation, slow route monitoring, 5xx error handling.
    - **AI Rate Limiting:** `aiLimiter` (20 req/min) on all AI endpoints.
- **AI Agent Integration Layer:**
    - **Agent Authentication:** API key-based authentication with scopes, revocation, and expiry.
    - **Webhook Dispatch:** Critical health events dispatched to an optional agent webhook.
    - **Agent Routes:** Dedicated API endpoints for agent interaction, including company/user data, health, knowledge base, events, support tickets, audit logs, escalations, and chat sessions.

**Feature Specifications:**
- **AI-Assisted Tools:** Policy Generator, Supplier Questionnaire Autofill.
- **Carbon Estimator:** SME-focused carbon module with versioned emission factors (UK DEFRA 2024).
- **Policy Templates:** 28 structured templates.
- **Calculation Engine:** Centralized service for 12 automated ESG metric calculations.

## Multi-Site Architecture (Phase 1 + Phase 2 — Complete)

The platform supports tracking ESG data across multiple physical sites per organisation.

### Database Layer
- **`organisation_sites` table:** id, company_id, name, slug, type (`site_type` enum: operational/office/manufacturing/warehouse/retail/data_centre/other), status (`site_status` enum: active/archived), country, city, address, created_at, updated_at.
- **Indexes:** `company_id`, `(company_id, status)`, unique `(company_id, slug)` on `organisation_sites`. Plus individual `site_id` indexes on all 10 affected tables.
- **Nullable `site_id` column** added to: `metric_values`, `raw_data_inputs`, `evidence_files`, `questionnaires`, `generated_policies`, `carbon_calculations`, `report_runs`, `agent_runs`, `chat_sessions`, `user_activity`.
- No FK constraints by design — application-level `validateSiteOwnership()` enforces ownership on every write.

### API (server/routes.ts)
- `GET /api/sites` — list active sites; `?includeArchived=true` for all
- `GET /api/sites/summary` — per-site data counts (metrics/evidence/questionnaires); optional `?period=`; registered BEFORE `/:id` to prevent wildcard match
- `GET /api/sites/:id` — single site
- `GET /api/sites/:id/dashboard` — site-scoped dashboard (metric values + evidence + questionnaires)
- `POST /api/sites` — create site (auto-generates slug)
- `PATCH /api/sites/:id` — update metadata (allowed even when archived)
- `DELETE /api/sites/:id` — soft-archive (status → archived)
- `validateSiteOwnership(siteId, companyId)` — shared helper: returns 404 if not found/wrong company, 400 if archived on writes; null siteId always passes.
- **siteId filtering:** `GET /api/evidence`, `/api/questionnaires`, `/api/carbon/calculations`, `/api/raw-data/:period` all accept optional `?siteId=` (pass `"null"` for unassigned-only).
- **siteId writes:** `POST /api/data-entry`, `/api/raw-data`, `/api/evidence`, `/api/questionnaires`, `/api/carbon/calculate` all accept `siteId` in body (validated, archived check, saved to DB).

### Rules
- Archived sites: PATCH metadata allowed; data writes to archived site return 400.
- Null siteId = org-level data (included in aggregations as "Unassigned").
- Slugs: auto-generated from name (lowercase, hyphens, collision suffixes).

### Frontend
- `client/src/hooks/use-site-context.tsx` — SiteProvider + useSiteContext; persists activeSiteId in localStorage; validates against live sites list on load.
- `client/src/App.tsx` — ProtectedApp wrapped in SiteProvider; `/sites/:siteId/dashboard` route registered.
- Sidebar: **SiteSwitcher** dropdown (Globe = All Sites / MapPin = per-site) in SidebarHeader; hidden when no sites exist.
- Pages that pass `activeSiteId` to mutations: data-entry, evidence, carbon-calculator.
- Route: `/sites` — `client/src/pages/sites.tsx` — includes "View Dashboard" button per site card.
- Route: `/sites/:siteId/dashboard` — `client/src/pages/site-dashboard.tsx` — summary cards + recent data.
- Dashboard: `SiteBreakdownCard` shows per-site metrics/evidence counts; hidden when no sites have data.
- Startup validator in `server/index.ts` checks `organisation_sites` table and all `site_id` columns exist at boot.

## External Dependencies

- **AI Services:** OpenAI (via Replit AI Integrations).
- **Database:** PostgreSQL.
- **Session Store:** `connect-pg-simple`.
- **Password Hashing:** `bcrypt`.
- **UI Frameworks:** React, Tailwind CSS, Shadcn UI.
- **Data Visualization:** Recharts.
- **Security:** Helmet.js.
- **Email:** Resend (optional).
- **Billing:** Stripe (optional).
- **Data Fetching:** TanStack Query.