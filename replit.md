# ESG Manager — SME ESG Platform

## Overview

The ESG Manager is a SaaS web application designed for Small and Medium-sized Enterprises (SMEs) to simplify Environmental, Social, and Governance (ESG) policy management, data tracking, and reporting. It replaces manual processes with an AI-assisted platform, making ESG accessible to business owners, CFOs, HR, and operations managers. The platform provides AI-assisted policy generation, questionnaire autofill, carbon emissions calculation, multi-dimensional ESG scoring, and an AI advisor. The project aims to be the leading ESG platform for SMEs, helping them achieve sustainability goals and meet reporting requirements efficiently.

## User Preferences

No explicit user preferences were provided in the original `replit.md` file. The agent should infer best practices for coding and communication based on the project's nature (production-style SaaS application).

## System Architecture

The application is a full-stack SaaS web application.

**UI/UX Decisions:**
- **Design System:** Shadcn UI and Tailwind CSS are used for a modern, responsive interface.
- **Theming:** Supports light and dark modes with a primary green color (`hsl(158, 64%, 32%)`) and Open Sans font.
- **Onboarding:** A 7-step guided wizard from Company Profile to ESG Action Plan.
- **Guidance:** Collapsible info panels on key pages and an in-app support assistant using OpenAI for page and company-context-aware help.

**Technical Implementations:**
- **Frontend:** React, TanStack Query, Wouter, Recharts.
- **Backend:** Node.js with Express.
- **Database:** PostgreSQL with Drizzle ORM.
- **Authentication:** Session-based authentication with `express-session`, `connect-pg-simple`, `bcrypt`, and role-based access control (RBAC) with four roles and seven permission modules.
- **Core Features:**
    - **Dashboard:** ESG performance overview, scores, emissions, alerts, action-based hero card, ranked priority action feed, and first-report milestone banner.
    - **ESG Policy Builder:** Policy creation, versioning, draft/publish workflow.
    - **Metrics Library & Data Entry:** 58 default ESG metrics (manual, calculated, derived) with bulk Excel uploads and sector-based estimate acceptance UI.
    - **Scoring System:** Traffic light system for metric status, weighted ESG scoring, multi-dimensional scoring (completeness, performance, management maturity, framework readiness).
    - **Action Tracker:** Management of ESG improvement actions.
    - **Reports:** Structured report generator with configurable sections, text/CSV export, readiness indicator, dynamic naming, and methodology notes.
    - **Evidence Management:** Tracking files linked to modules.
    - **Workflow Management:** Enforced state transitions and audit trails.
    - **AI Safety/Governance:** AI-generated outputs require human review.
    - **Admin Controls:** Management of users, roles, configuration, scoring, metrics, templates, emission factors, and audit logs.
    - **Super Admin Support Tools (Task #80):** Company diagnostics with ESG readiness (completeness, evidence, estimated %, blocking factors), activation milestones timeline (first data/evidence/report dates), company access grants view, and support action panel (preflight check, resend invite, reset onboarding). Audit-trailed via super_admin_actions table.
    - **Customer Activation Dashboard (Task #80):** `/api/admin/activation-dashboard` endpoint; "Activation" tab in admin panel showing all companies with milestone progress dots, ESG state badges, stuck-company detection (amber >30d), summary stats. Single JOIN query (no N+1 array binding).
    - **Read-Only Support Mode (Task #80):** `session.supportMode = "read_only"` set on impersonation; impersonation banner redesigned with prominent "Read-Only Support Mode" badge, "— changes made here are not saved" note, and "Exit Support Mode" button.
    - **Notifications & Reminders:** Auto-generated for due dates, reviews, expiry.
    - **Reporting Periods:** Management of data entry and reporting cycles.
    - **Data Quality Score System:** Per-metric quality scores.
    - **Compliance Framework Mapping:** Integration with frameworks (e.g., GRI, ISO 14001, UN SDGs) and a Framework Readiness Dashboard.
    - **ESG Control Centre:** Aggregated view of outstanding ESG issues and Gap Score.
    - **Customer Procurement Answer Library:** CRUD for pre-approved ESG answers.
    - **Recommendations Engine:** Rule-based recommendations.
    - **ESG Programme Status:** Overall completion percentage and prioritized next-best-actions.
    - **Questionnaire AI Response Generator:** AI-powered Q&A generation.
    - **ESG Company Profile:** Professional, public-shareable ESG profile page.
    - **ESG Benchmarking:** Comparison against 7 SME reference benchmarks.
    - **Multi-Site Architecture:** Support for tracking ESG data across multiple physical sites per organization.
- **Performance & Reliability:**
    - **Background Job Scheduler:** Recurring and on-demand jobs with retry logic.
    - **Platform Health Monitoring:** Super-admin dashboard.
    - **PDF/DOCX Report Engine:** Generates branded reports.
    - **Carbon Data Import:** Two-step import with column auto-mapping.
    - **Security Hardening:** Helmet.js for security headers, CORS, body size limits, comprehensive rate limiting across various endpoints, file upload validation, production error sanitization, and an extended audit log schema.
    - **Identity Hardening & GDPR:** TOTP-based MFA with AES-256-GCM encrypted secrets, backup codes, MFA enforcement policies, SSO/SAML readiness stubs, GDPR data export, account anonymisation, and company deletion scheduling.
    - **Monitoring, Alerts & Incident Basics:** Lightweight security alert engine with threshold-based rules, Slack webhook delivery, deduplication, cooldown logic, alert history, and containment helpers. 8 incident runbooks are provided.
- **Help Centre & User Guide System:**
    - **Content Library:** 25 structured help articles across 7 categories with synonym-aware search.
    - **Help Landing Page:** Category cards, featured guides, real-time search, category drill-down, and integrated support form.
    - **Article Pages:** Full article rendering with navigation and related guides.
    - **Contextual Help Entry Points:** Integrated help links in key application areas.
- **AI Agent Integration Layer:** API key-based authentication, webhook dispatch for critical health events, and dedicated API endpoints for agent interaction with company/user data, health, knowledge base, and events.

**Feature Specifications:**
- **AI-Assisted Tools:** Policy Generator, Supplier Questionnaire Autofill.
- **Carbon Estimator:** SME-focused carbon module with versioned emission factors.
- **Policy Templates:** 28 structured templates.
- **Calculation Engine:** Centralized service for 12 automated ESG metric calculations.
- **ESG Metric Definitions Engine:** 58 metric definitions across Environmental, Social, and Governance pillars.
- **AI Advisor Upgrade:** `/api/chat/assist` now pulls live company context for more precise responses.

## External Dependencies

- **AI Services:** OpenAI.
- **Database:** PostgreSQL.
- **Session Store:** `connect-pg-simple`.
- **Password Hashing:** `bcrypt`.
- **UI Frameworks:** React, Tailwind CSS, Shadcn UI.
- **Data Visualization:** Recharts.
- **Security:** Helmet.js.
- **MFA:** otplib.
- **Email:** Resend (optional).
- **Billing:** Stripe (optional).
- **Data Fetching:** TanStack Query.