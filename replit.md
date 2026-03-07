# ESG Manager — SME ESG Platform

A production-style SaaS web application for SME businesses to manage ESG policies, ESG data, and ESG reporting, with AI-assisted tools for policy generation, questionnaire autofill, and carbon calculation.

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

### AI-Assisted Features

9. **AI Policy Generator** — Guided 4-step questionnaire (company profile, environmental, social, governance) that generates a tailored ESG policy using AI. Preview, edit, and save as a new policy version.
10. **Supplier Questionnaire Autofill** — Paste or enter ESG questionnaire questions; the system uses rules-based matching + AI to generate suggested answers using existing company data (policy, metrics, actions, carbon data). Shows confidence levels and source references. Export as CSV or copy to clipboard.
11. **Carbon Calculator** — Simple SME-friendly calculator for Scope 1, 2, and 3 emissions. Uses configurable emission factors stored in database. Shows breakdown by source, per-employee metrics, and history of calculations.
12. **Policy Templates** — 18 structured policy templates (Quality, Environmental, H&S, InfoSec, Data Protection, Risk Management, Document Control, NC/CA, Internal Audit, Management Review, Incident Reporting, Emergency Preparedness, Supplier CoC, Modern Slavery, Anti-Bribery, Sustainability/Carbon, EDI, Whistleblowing) with guided questionnaires, clause-based AI drafting, compliance mapping (ISO/legal), version control, approve/publish workflow, and multi-format export (TXT/DOCX/PDF). Admin area for editing clause text, review cycles, and compliance references.

## Tech Stack

- **Frontend**: React, TanStack Query, Wouter, Recharts, Shadcn UI, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (via Drizzle ORM)
- **Auth**: Session-based with express-session and connect-pg-simple
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2 for policy generation and questionnaire autofill)

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
- `policy_generation_inputs` — AI policy generator questionnaire inputs and generated content
- `emission_factors` — Configurable carbon emission factors (UK DEFRA 2024 defaults)
- `carbon_calculations` — Carbon calculation inputs, results, and history
- `questionnaires` — Uploaded/created ESG questionnaires
- `questionnaire_questions` — Individual questions with suggested/edited answers, confidence, and source
- `policy_templates` — 18 structured policy templates with clause definitions, questionnaires, and compliance mapping
- `generated_policies` — AI-generated policies from templates with clause-by-clause content, version control, and approval workflow

## Emission Factors

Pre-seeded UK DEFRA 2024 emission factors:
- Grid Electricity: 0.20707 kgCO2e/kWh
- Natural Gas: 0.18293 kgCO2e/kWh
- Diesel: 2.70559 kgCO2e/litre
- Petrol: 2.31482 kgCO2e/litre
- Company Car: 0.27436 kgCO2e/mile
- Domestic Flight: 0.24587 kgCO2e/passenger-km
- Short-haul Flight: 0.15353 kgCO2e/passenger-km
- Long-haul Flight: 0.19309 kgCO2e/passenger-km
- Rail Travel: 0.03549 kgCO2e/passenger-km
- Hotel Nights: 10.24000 kgCO2e/night

Factors are stored in the `emission_factors` table and can be updated via the database.

## Demo Account

- **Email**: demo@example.com
- **Password**: password123
- Pre-loaded with 6 months of sample data, 4 improvement actions, a published ESG policy, and a sample carbon calculation

## Architecture

- All routes prefixed with `/api`
- Session stored in PostgreSQL via `connect-pg-simple`
- Frontend served by Vite in development
- Seed data created on first user registration
- Password hashing: SHA-256 with salt `esg_salt_2024`
- Design: green primary color (`hsl(158, 64%, 32%)`), Open Sans font, supports light/dark mode
- Sidebar width: 14rem via CSS vars on SidebarProvider
- `apiRequest` used as `apiRequest(method, url, data)` not fetch-style

## Running

The app runs via the "Start application" workflow which executes `npm run dev`.
