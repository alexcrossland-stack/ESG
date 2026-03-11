# ESG Manager — SME ESG Platform

## Overview

The ESG Manager is a SaaS web application designed for Small and Medium-sized Enterprises (SMEs) to streamline their Environmental, Social, and Governance (ESG) policy management, data tracking, and reporting. It aims to replace manual processes with a guided, AI-assisted platform, making ESG accessible to business owners, CFOs, HR, and operations managers without requiring prior ESG expertise. The platform provides tools for policy generation, questionnaire autofill, and carbon emissions calculation, ultimately helping businesses improve their ESG performance and reporting capabilities. The project envisions becoming the leading ESG platform for SMEs, empowering them to achieve sustainability goals and meet reporting requirements efficiently.

## User Preferences

No explicit user preferences were provided in the original `replit.md` file. The agent should infer best practices for coding and communication based on the project's nature (production-style SaaS application).

## System Architecture

The application is a full-stack SaaS web application.

**UI/UX Decisions:**
- **Design System:** Utilizes Shadcn UI and Tailwind CSS for a modern, responsive interface.
- **Theming:** Supports both light and dark modes.
- **Color Scheme:** Primary color is green (`hsl(158, 64%, 32%)`).
- **Typography:** Uses Open Sans font.
- **Layout:** Features a fixed-width sidebar (14rem).
- **Onboarding:** Onboarding v2 implements a 6-step action-based flow (Profile, Focus Topics, Reporting Setup, Data Entry, Evidence, Output) with Quick Start path. V1 (guided 8-step wizard or manual) is still supported. Both versions have database persistence, autosave, and resume functionality.

**Technical Implementations:**
- **Frontend:** Built with React, utilizing TanStack Query for data fetching, Wouter for routing, and Recharts for data visualization.
- **Backend:** Developed with Node.js and Express.
- **Database:** PostgreSQL is used as the primary data store, managed via Drizzle ORM.
- **Authentication:** Session-based authentication with `express-session` and `connect-pg-simple`, incorporating `bcrypt` for password hashing, rate limiting, and secure cookie practices. RBAC (Role-Based Access Control) is implemented with four roles (admin, contributor, approver, viewer) and seven permission modules, enforced server-side via middleware and client-side via hooks.
- **Core Features:**
    - **Dashboard:** Provides an overview of ESG performance with weighted scores, category performance, submission rates, emissions trends, and alerts.
    - **ESG Policy Builder:** Allows for the creation and management of ESG policies with version history and a draft/publish workflow.
    - **Metrics Library & Data Entry:** Features 28 default ESG metrics, supporting manual, calculated, and derived types. Supports raw data inputs, manual metric entry, and bulk Excel uploads.
    - **Scoring System:** Employs a traffic light system for metric status and a weighted ESG scoring methodology.
    - **Action Tracker:** Manages ESG improvement actions with owners, due dates, and status tracking.
    - **Reports:** Structured report generator with 3 templates and 9 configurable sections, supporting text and CSV export.
    - **Evidence Management:** Tracks evidence files linked to various modules, with statuses and review workflows.
    - **Workflow Management:** Key entities have `workflowStatus` with enforced state transitions and audit trails.
    - **AI Safety/Governance:** AI-generated outputs are marked as "draft" requiring human review, and metadata is logged.
- **Admin Controls:** Comprehensive admin panel for managing users, roles, module configurations, scoring weights, metric settings, policy templates, emission factors, approval workflows, report branding, and audit logs.
- **Notifications & Reminders:** Auto-generated notifications for metric due dates, overdue actions, policy reviews, evidence expiry, and stale questionnaires.
- **Phase 2 Enhancements:**
    - **Task Ownership & Workflow Standardisation:** Standardized workflow fields and assigned user/due dates for various entities.
    - **Reporting Periods:** Introduced `reporting_periods` for managing data entry and reporting cycles.
    - **My Tasks/My Approvals:** Dedicated pages for users to manage assigned tasks and approvals.
    - **Period-Filtered Views:** Enhanced data entry and dashboard views with reporting period selection.
    - **Bulk Operations:** Added bulk approve/reject and owner assignment functionalities.
    - **Activity Feed:** Timeline component from audit log for dashboard.
- **Phase 2 — Release 3 Features:**
    - **Data Quality Score System:** Per-metric quality scores based on various criteria.
    - **Compliance Framework Mapping:** Integrated compliance frameworks (e.g., GRI, ISO 14001, UN SDGs) with tracking of requirements.
    - **Enhanced Report Sections:** Added Data Quality Assessment, Compliance Status, and Period Comparison sections to reports.
    - **Dashboard Completeness Indicators:** Progress bars and quick action cards for data completeness.
- **Phase 3 — Commercial Usability Features:**
    - **ESG Control Centre:** Aggregated view of outstanding ESG issues with an ESG Gap Score.
    - **Customer Procurement Answer Library:** CRUD for pre-approved ESG answers with usage tracking and auto-flagging.
    - **Automated Recurring Reminders:** Scheduled background jobs for multi-tier escalations.
    - **Evidence Reuse & Suggestions:** Functionality for suggesting and reusing evidence files.
    - **Improved Exports:** New presentation-ready export packs (Board, Customer, Compliance, Assurance).
    - **Guided Demo Mode:** Provides a guided tour and seeded data for new users.
    - **Trust & Source-Status Layer:** `SourceBadge` component to display data status, owner, date, and evidence.
- **Phase 6 — Product Readiness & Commercial Value:**
    - **AI Rate Limiting:** `aiLimiter` (20 req/min) applied to all AI endpoints including `policy-templates/:slug/generate`, `policy-generator/generate`, `questionnaires/:id/autofill`, `questionnaires/generate-responses`. File upload limits 5MB, row import limits 10,000.
    - **ESG Control Centre Upgrade** (`client/src/pages/control-centre.tsx`): Filter tabs (All/Data/Actions/Compliance/Approvals), priority sort, bulk complete overdue actions, improved empty states, 3-stat header row.
    - **Recommendations Engine** (`/api/recommendations`, `client/src/pages/recommendations.tsx`): 7 rule-based recommendations (missing_data, expiring_evidence, expired_evidence, overdue_actions, low_quality, compliance_gap, draft_policies), priority sorted high→medium→low. Dashboard widget shows top 3. Sidebar nav link added.
    - **Simplified Report Types** (`client/src/pages/reports.tsx`): 4 named report types (Board Summary, Customer Response Pack, Compliance Summary, Full ESG Report) with audience and time estimates shown as cards.
    - **Questionnaire AI Response Generator** (`client/src/pages/questionnaire.tsx`): New "AI Response Generator" tab (default). Paste questionnaire text → POST `/api/questionnaires/generate-responses` → Q&A pairs with confidence & source. Copy-per-answer and bulk export.
    - **Demo Mode Guided Scenarios** (`client/src/components/product-tour.tsx`): 3 scenarios (customer ESG request, board report, ESG gap review) with step-by-step walkthrough UI.
    - **Expanded CSV Import Templates** (`/api/raw-data/import/templates`, `/api/raw-data/import/template?type=`): 4 template types (energy, travel, workforce, all). Import dialog shows template selector cards with download.
- **Phase 5 — Performance & Onboarding:**
    - **Test Data Generator** (`server/seed-generator.ts`): Deterministic seed with small/medium/large presets (1126/6435+ records). `server/perf-test.ts` benchmarks 24 workflows all under 200ms.
    - **Database Optimization** (`server/ensure-indexes.ts`): 40 targeted indexes, ensured at server startup.
    - **Reliability Hardening** (`server/scheduler.ts`): FOR UPDATE SKIP LOCKED job locking, stuck job recovery (10min timeout), exponential backoff (30s/2min/8min, max 3 retries), job cleanup (30 days) and health event cleanup (90 days). Slow route monitoring (2s threshold) in `server/index.ts`.
    - **Performance Admin View** (`client/src/pages/admin-health.tsx`): Tabbed layout with Health Events, Background Jobs, and Performance tabs. `/api/admin/performance` endpoint returns DB size, connection count, index count, table row counts.
    - **Onboarding v2** (`client/src/pages/onboarding.tsx`): 6-step action-based flow (Profile, Focus Topics, Reporting Setup, Data Entry, Evidence, Output) with `onboardingVersion=2`. Quick Start path seeds demo data. Dashboard activation card shows progress for incomplete onboarding.
- **Phase 4 — Platform Reliability & Automation:**
    - **Background Job Scheduler** (`server/scheduler.ts`): Recurring system jobs (reminders, evidence expiry, procurement revalidation, compliance recalculation) on 60s tick; on-demand queued jobs with retry logic, idempotency keys, worker locking. `background_jobs` table tracks all runs.
    - **Platform Health Monitoring** (`client/src/pages/admin-health.tsx`): Super-admin-only dashboard with status cards (scheduler, API errors, report engine), health events table, background job history. Auto-refreshes every 30s. `platform_health_events` table logs job failures and API 500 errors.
    - **PDF/DOCX Report Engine** (`server/report-engine.ts`): Uses `pdfkit` and `docx` packages. Generates branded PDF and DOCX files for all 5 report types. Files persisted in `generated_files` table with re-download support.
    - **Questionnaire Import Tool**: Import via text (paste), CSV, or Excel. Multi-strategy answer matching with confidence scores (exact/keyword/category). All imports default to draft status.
    - **Carbon Data Import**: Two-step flow (parse then confirm). Column auto-mapping with fuzzy matching and confidence scores. Users can override mappings before confirming. Audit trail logged.
    - **ESG Company Profile** (`client/src/pages/esg-profile.tsx`, `client/src/pages/public-profile.tsx`): Professional ESG profile page with sharing controls (toggle, expiry, section visibility). Public shareable link via token with server-side section whitelisting. Token rotation supported.
    - **User Activity Analytics** (`client/src/pages/admin-analytics.tsx`): Tracks page views and feature usage. `user_activity` table with 90-day retention. Admin dashboard shows active users, feature usage bars, top pages, daily activity timeline.
    - **ESG Benchmarking** (`server/benchmarks.ts`, `client/src/pages/benchmarks.tsx`): 7 SME reference range benchmarks with source attribution. Range bar visualization with company marker. Dashboard summary card with color-coded indicators.

**Feature Specifications:**
- **AI-Assisted Tools:** Policy Generator, Supplier Questionnaire Autofill, Carbon Estimator (rules-based, not AI).
- **Carbon Estimator:** SME-focused carbon module with versioned emission factors (UK DEFRA 2024), data quality tracking, fuel-type-specific factors, and proxy calculations.
- **Policy Templates:** 28 structured templates with guided drafting.
- **Calculation Engine:** Centralized service for 12 automated ESG metric calculations using database emission factors.

- **Phase 7 — Launch Readiness:**
    - **Security Hardening** (`server/index.ts`): Helmet.js with production CSP (disabled in dev for Vite HMR), CORS restricted to REPLIT_DOMAINS in production, 2MB body size limit, startup validation for DATABASE_URL/SESSION_SECRET, slow route health events (>2s threshold), 5xx error handler logs health events.
    - **Email Service** (`server/email.ts`): Resend integration with graceful fallback if API key absent. `generateSecureToken()` returns `{plaintext, hash}`. 5 HTML email templates: invitation, password reset, report ready, support confirmation, evidence expiry. Support confirmation emails sent on ticket creation.
    - **Password Reset Flow**: `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` routes. Token stored as SHA-256 hash in `auth_tokens` table with 1-hour expiry. Auth page shows forgot-password form and "Check your inbox" confirmation. Reset link shows new password form.
    - **Stripe Billing** (`client/src/pages/billing.tsx`): Billing page with Free vs Pro plan cards. `POST /api/billing/create-checkout` creates Stripe Checkout session. `POST /api/billing/webhook` verifies Stripe signatures and handles checkout.session.completed, invoice.payment_succeeded, invoice.payment_failed, customer.subscription.deleted events. `GET /api/billing/status` returns current plan tier. Cancel subscription endpoint. Billing link in sidebar.
    - **Database Schema Extensions**: `auth_tokens` table (token_hash, type, email, expires_at, used_at). Billing fields on companies (plan_tier, plan_status, current_period_end, stripe_customer_id, stripe_subscription_id). New enums: plan_tier, plan_status, auth_token_type.
    - **Health Monitoring Expansion** (`client/src/pages/admin-health.tsx`): Event severity filtering, event breakdown by type (24h summary), Security Audit tab. `GET /api/admin/health/counts` returns 24h event counts by type/severity. `GET /api/admin/security-audit` runs environment config checks. CSV import failures and AI failures log health events.
    - **Demo Reset** (`POST /api/admin/demo/reset`): Super-admin only, requires `{confirm: "RESET_DEMO"}`, scoped to demo company only.
    - **Client Error Boundary** (`client/src/App.tsx`): React class-based error boundary wrapping all routes. Reports errors to `POST /api/health/client-error`. Shows branded error UI with reload button.
    - **Branded 404** (`client/src/pages/not-found.tsx`): Redesigned with ESG Manager branding, "Go to dashboard" and "Get help" buttons.
    - **Demo Banner** (`client/src/pages/dashboard.tsx`): Shows amber banner when on demo account with link to create own account.
    - **Environment Config** (`.env.example`): Documents all required and optional environment variables.

## External Dependencies

- **AI Services:** OpenAI (via Replit AI Integrations, specifically `gpt-5.2`).
- **Database:** PostgreSQL.
- **Session Store:** `connect-pg-simple`.
- **Password Hashing:** `bcrypt`.
- **UI Frameworks:** React, Tailwind CSS, Shadcn UI.
- **Data Visualization:** Recharts.
- **Security:** Helmet.js for HTTP security headers.
- **Email:** Resend (gracefully disabled if RESEND_API_KEY not set).
- **Billing:** Stripe (gracefully disabled if STRIPE_SECRET_KEY not set).
- **Data Fetching:** TanStack Query.