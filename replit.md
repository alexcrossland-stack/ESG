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
    - **Dashboard:** ESG performance overview, scores, emissions, alerts.
    - **ESG Policy Builder:** Policy creation, versioning, draft/publish workflow.
    - **Metrics Library & Data Entry:** 58 default ESG metrics (manual, calculated, derived) with bulk Excel uploads.
    - **Scoring System:** Traffic light system for metric status, weighted ESG scoring, multi-dimensional scoring (completeness, performance, management maturity, framework readiness).
    - **Action Tracker:** Management of ESG improvement actions.
    - **Reports:** Structured report generator with configurable sections, text/CSV export.
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