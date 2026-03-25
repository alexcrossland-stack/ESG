# ESG Manager — SME ESG Platform

## Overview

The ESG Manager is a SaaS web application designed for Small and Medium-sized Enterprises (SMEs) to simplify Environmental, Social, and Governance (ESG) policy management, data tracking, and reporting. It replaces manual processes with an AI-assisted platform, making ESG accessible to business owners, CFOs, HR, and operations managers regardless of prior ESG expertise. Key capabilities include policy generation, questionnaire autofill, and carbon emissions calculation, along with multi-dimensional ESG scoring and an AI advisor. The project aims to become the leading ESG platform for SMEs, helping them achieve sustainability goals and meet reporting requirements efficiently.

## User Preferences

No explicit user preferences were provided in the original `replit.md` file. The agent should infer best practices for coding and communication based on the project's nature (production-style SaaS application).

## System Architecture

The application is a full-stack SaaS web application.

**UI/UX Decisions:**
- **Design System:** Shadcn UI and Tailwind CSS for a modern, responsive interface.
- **Theming:** Supports light and dark modes with a primary green color (`hsl(158, 64%, 32%)`).
- **Typography:** Uses Open Sans font.
- **Onboarding:** A 7-step guided wizard (Company Profile to ESG Action Plan).
- **Page Guidance Panels:** Collapsible info panels on key pages (`client/src/components/page-guidance.tsx`).
- **In-app Support Assistant:** Floating chat panel (`client/src/components/support-assistant.tsx`) using OpenAI, page and company-context-aware.

**Technical Implementations:**
- **Frontend:** React, TanStack Query, Wouter, Recharts.
- **Backend:** Node.js with Express.
- **Database:** PostgreSQL with Drizzle ORM.
- **Authentication:** Session-based authentication with `express-session`, `connect-pg-simple`, `bcrypt`, role-based access control (RBAC) with four roles and seven permission modules.
- **Core Features:**
    - **Dashboard:** ESG performance overview, scores, emissions, alerts. Action-based hero card with confidence labels (Score in progress / Draft / Provisional / Confirmed), ranked priority action feed, and first-report milestone banner.
    - **ESG Policy Builder:** Policy creation, versioning, draft/publish workflow.
    - **Metrics Library & Data Entry:** 58 default ESG metrics (manual, calculated, derived) with bulk Excel uploads. Pre-filled sector-based estimate acceptance UI with accept/skip affordances and Actual/Estimated/Missing badges (`ValueSourceBadge` component).
    - **Scoring System:** Traffic light system for metric status, weighted ESG scoring, multi-dimensional scoring (completeness, performance, management maturity, framework readiness).
    - **Action Tracker:** Management of ESG improvement actions.
    - **Reports:** Structured report generator with configurable sections, text/CSV export. Readiness indicator with data quality breakdown, dynamic report naming (Initial ESG Baseline Report / Draft ESG Summary / confirmed report titles), and methodology notes on draft-quality reports.
    - **Evidence Management:** Tracking files linked to modules.
    - **Workflow Management:** Enforced state transitions and audit trails for key entities.
    - **AI Safety/Governance:** AI-generated outputs require human review.
    - **Admin Controls:** User, role, configuration, scoring, metrics, templates, emission factors, audit log management.
    - **Notifications & Reminders:** Auto-generated for due dates, reviews, expiry.
    - **Reporting Periods:** Management of data entry and reporting cycles.
    - **Data Quality Score System:** Per-metric quality scores.
    - **Compliance Framework Mapping:** Integration with frameworks (e.g., GRI, ISO 14001, UN SDGs), with a Framework Readiness Dashboard.
    - **ESG Control Centre:** Aggregated view of outstanding ESG issues and Gap Score.
    - **Customer Procurement Answer Library:** CRUD for pre-approved ESG answers.
    - **Recommendations Engine:** Rule-based recommendations (missing data, overdue actions).
    - **ESG Programme Status:** Overall completion percentage and prioritized next-best-actions.
    - **Questionnaire AI Response Generator:** AI-powered Q&A generation.
    - **ESG Company Profile:** Professional, public-shareable ESG profile page.
    - **ESG Benchmarking:** Comparison against 7 SME reference benchmarks.
    - **Multi-Site Architecture:** Support for tracking ESG data across multiple physical sites per organization, with site-specific data filtering and reporting.
- **Performance & Reliability:**
    - **Background Job Scheduler:** Recurring and on-demand jobs with retry logic.
    - **Platform Health Monitoring:** Super-admin dashboard.
    - **PDF/DOCX Report Engine:** Generates branded reports.
    - **Carbon Data Import:** Two-step import with column auto-mapping.
    - **Security Hardening (Task #12):** Helmet.js with full header suite (HSTS, referrer-policy, X-Content-Type-Options, X-Frame-Options), CORS, body size limits. Comprehensive rate limiting: login (10/15min), register (5/hr), password change (5/15min), AI/agents (20/min), uploads (60/15min), reports (30/15min), CSV import (20/15min), invites (20/hr). File upload validation with blocked extensions and allowlisted MIME types. Production error sanitization. Extended audit log schema (ip_address, user_agent, actor_type, actor_agent_id). Audit events with IP/UA enrichment for login, evidence, role changes, API key operations, and billing lifecycle events. Company API key management UI (settings page). Super-admin Security & Audit tab (admin panel) with platform-wide event log and stats. Operational documentation: `docs/deployment-checklist.md`, `docs/backup-restore.md`, `docs/security-isolation-audit.md`, `.env.example`.
    - **Identity Hardening & GDPR (Task #44):** TOTP-based MFA with AES-256-GCM encrypted secrets (`server/mfa.ts`), backup codes (scrypt-hashed, single-use), MFA enforcement policies (optional/admin_required/all_required on `companies.mfa_policy`). SSO/SAML readiness stubs (`identity_providers` table, initiate/callback routes). GDPR data export (async job with single-use download tokens, 24h expiry), account anonymisation, company deletion scheduling (7-day cancellation window). Admin UI: MFA policy management with adoption dashboard, user MFA status. User UI: MFA setup/disable/backup code regeneration card, data export card, account deletion with confirmation. Login flow supports MFA challenge and forced MFA enrollment for policy-required users. New tables: `identity_providers`, `data_export_jobs`, `data_deletion_requests`. New MFA fields on `users`, new deletion/policy fields on `companies`.
    - **Monitoring, Alerts & Incident Basics (Task #46):** Lightweight security alert engine (`server/alert-engine.ts`) evaluating 10 threshold-based rules (repeated failed logins by IP/account, MFA failures, API key auth failures, admin role changes, company deletion requests, super-admin critical actions, export/delete volume spikes, high access-denial volume). Slack webhook delivery (primary, best-effort, non-blocking). Per-rule deduplication and cooldown logic prevents notification floods. Alert history stored in `security_alerts` table with delivery status tracking. Super-admin Security Overview page (`/admin/security`) shows recent alerts, failed logins, MFA failures, export/delete activity, role changes, and super-admin actions. Alert acknowledgement workflow. Containment helpers: revoke sessions, disable user accounts. Admin API routes under `/api/admin/security/*`. Alert engine hooks integrated into login, MFA verify, role change, and company deletion routes. 8 incident runbooks committed in `docs/runbooks/` covering: account compromise, admin compromise, leaked API key, suspicious export/delete, secret exposure, cross-tenant access, accidental deletion, malicious upload.
- **Help Centre & User Guide System (Task #9):**
    - **Content library:** `client/src/lib/help-content.ts` — 25 structured help articles across 7 categories (Getting Started, Adding Data, Score and Progress, Reports, Compliance, Account and Team, Troubleshooting). Each article has typed `HelpSection` blocks (intro, text, list, steps, callout). Synonym-aware search engine with `searchArticles()`, `getArticleBySlug()`, `getFeaturedArticles()`, `getArticlesByCategory()`.
    - **Help landing page:** `/help` — category cards (7), featured guides section (6 articles), synonym-aware real-time search, category drill-down, and integrated support form. URL param `?category=` restores category filter, `?contact=1` opens contact form directly.
    - **Article pages:** `/help/:slug` — full article renderer with breadcrumb nav, category badge, typed section components, sticky related guides panel, more-in-category list, and back navigation.
    - **Reusable components:** `client/src/components/help.tsx` — `HelpCalloutBox` (info/tip/warning tones), `HelpSteps` (numbered), `HelpSectionRenderer`, `RelatedGuides`, `ContextualHelpLink`.
    - **Contextual help entry points:** Dashboard (ESG score card → "What does this mean?"), Data Entry (Save button → "How to enter data"), Evidence upload dialog (→ "What counts as evidence?"), Reports (Generate button → "How to generate a report").
    - **Support form** (backed by existing `support_requests` backend): category, subject, message, auto-populates user email and page context. Returns SR-YY-XXXXXX reference number.
    - **Route:** `/help/:slug` registered in `client/src/App.tsx`.
- **AI Agent Integration Layer:**
    - **Agent Authentication:** API key-based authentication.
    - **Webhook Dispatch:** Critical health events to optional agent webhook.
    - **Agent Routes:** Dedicated API endpoints for agent interaction (company/user data, health, knowledge base, events, support tickets, audit logs, escalations, chat sessions).

**Feature Specifications:**
- **AI-Assisted Tools:** Policy Generator, Supplier Questionnaire Autofill.
- **Carbon Estimator:** SME-focused carbon module with versioned emission factors.
- **Policy Templates:** 28 structured templates.
- **Calculation Engine:** Centralized service for 12 automated ESG metric calculations.
- **ESG Metric Definitions Engine:** 58 metric definitions across Environmental, Social, and Governance pillars, with core and advanced metrics.
- **AI Advisor Upgrade:** `/api/chat/assist` now pulls live company context (missing submissions, overdue actions, policy status, framework readiness) before building the OpenAI prompt for more precise responses.

## Test Infrastructure

- **API Security Tests** (`tests/api-security.test.ts`): 40-test suite covering 8 suites — input validation, unauthenticated tenant isolation, auth endpoints, dashboard endpoints, cross-tenant isolation (authenticated), RBAC enforcement, session lifecycle (revocation, fabricated tokens), and malformed payloads. Run via `npx tsx tests/api-security.test.ts` or the `test:api` workflow.
- **Playwright E2E Tests** (`tests/e2e/`): 16 API-mode tests covering auth flow, onboarding, metric entry, dashboard endpoints, report generation, and viewer restrictions. Run via `npx playwright test` or the `test:e2e` workflow.
- **Shared Fixture** (`tests/fixtures/seed.ts`): Provisions two isolated tenants with admin + viewer users via direct SQL (no rate limiter exposure). Used by both API tests and Playwright global-setup.
- **Coverage Doc** (`tests/COVERAGE.md`): Table of covered suites/routes and explicit out-of-scope gaps (MFA, step-up auth, email, rate-limiter enforcement, CI).
- **Server-side fix (Task #51)**: `PUT /api/metrics/:id/target` now validates `targetValue` is numeric (returns 400 instead of 500 on string input).

## External Dependencies

- **AI Services:** OpenAI (via Replit AI Integrations).
- **Database:** PostgreSQL.
- **Session Store:** `connect-pg-simple`.
- **Password Hashing:** `bcrypt`.
- **UI Frameworks:** React, Tailwind CSS, Shadcn UI.
- **Data Visualization:** Recharts.
- **Security:** Helmet.js.
- **MFA:** otplib (TOTP generation/verification).
- **Email:** Resend (optional).
- **Billing:** Stripe (optional).
- **Data Fetching:** TanStack Query.