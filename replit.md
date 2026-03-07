# ESG Manager — SME ESG Platform

A production-style SaaS web application for SME businesses to manage ESG policies, ESG data, and ESG reporting.

## Overview

This platform replaces spreadsheets and documents with a single, guided platform for managing Environmental, Social, and Governance (ESG) responsibilities. Designed for business owners, CFOs, HR managers, and operations managers — no ESG expertise required.

## Features

1. **Dashboard** — Real-time ESG performance with charts (electricity trends, workforce, category breakdown), completion scores, and action summaries
2. **ESG Policy Builder** — Accordion-style policy editor with sections (purpose, environmental, social, governance, roles, data collection, review cycle), version history, draft/publish workflow, and export
3. **Priority Topics** — Select which ESG topics matter most across Environmental, Social, and Governance categories
4. **Metrics Library** — Pre-loaded 19 default ESG metrics (7 environmental, 7 social, 5 governance) with enable/disable toggle, data owner, frequency, and target setting
5. **Data Entry** — Monthly/quarterly data entry grouped by category, with period selector, notes, individual/bulk save, and period locking
6. **Action Tracker** — Create and manage ESG improvement actions with title, description, owner, due date, status, and progress notes
7. **Reports** — Generate ESG reports with configurable sections (policy, topics, metrics, actions), preview, and export (text/CSV)
8. **Settings** — Company profile (industry, country, employee count, revenue band), account info, and activity log

## Tech Stack

- **Frontend**: React, TanStack Query, Wouter, Recharts, Shadcn UI, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (via Drizzle ORM)
- **Auth**: Session-based with express-session and connect-pg-simple

## Database Tables

- `users` — User accounts with role (admin/editor)
- `companies` — Company profiles
- `company_settings` — Which ESG areas to track
- `esg_policies` — Policy documents with status
- `policy_versions` — Version history for policies
- `material_topics` — Priority ESG topics (environmental/social/governance)
- `metrics` — Metric definitions (enabled/disabled per company)
- `metric_targets` — Target values per metric
- `metric_values` — Actual data submissions per period
- `evidence_files` — Document uploads
- `action_plans` — ESG improvement actions
- `report_runs` — Report generation history
- `audit_logs` — Activity history

## Demo Account

- **Email**: demo@example.com
- **Password**: password123
- Pre-loaded with 6 months of sample data, 4 improvement actions, and a published ESG policy

## Architecture

- All routes prefixed with `/api`
- Session stored in PostgreSQL via `connect-pg-simple`
- Frontend served by Vite in development
- Seed data created on first user registration

## Running

The app runs via the "Start application" workflow which executes `npm run dev`.
