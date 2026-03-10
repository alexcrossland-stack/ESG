# ESG Manager — SME ESG Platform

A production-style SaaS web application for SME businesses to manage ESG policies, ESG data, and ESG reporting, with AI-assisted tools for policy generation, questionnaire autofill, and carbon calculation.

## Overview

This platform replaces spreadsheets and documents with a single, guided platform for managing Environmental, Social, and Governance (ESG) responsibilities. Designed for business owners, CFOs, HR managers, and operations managers — no ESG expertise required.

## Features

1. **Dashboard** — Real-time ESG performance with ESG score ring, traffic light summary (green/amber/red), category performance bars, emissions trend charts, workforce chart, needs-attention list, and action summaries
2. **ESG Policy Builder** — Accordion-style policy editor with sections (purpose, environmental, social, governance, roles, data collection, review cycle), version history, draft/publish workflow, and export
3. **Priority Topics** — Select which ESG topics matter most across Environmental, Social, and Governance categories
4. **Metrics Library** — 28 default ESG metrics (10 environmental, 10 social, 8 governance) with traffic light status dots, trend arrows, metric type badges (Manual/Calculated/Derived), category/status/type filters, and detail dialog with trend charts, formulas, and current/previous/target values
5. **Data Entry** — Tabbed interface with Raw Data Inputs (grouped environmental/social/governance fields with auto-calculation), Manual Metrics entry, and Excel Upload (bulk import with template download, preview, validation, and auto-recalculation). Save & Calculate triggers recalculation of all calculated/derived metrics with live results display
6. **Action Tracker** — Create and manage ESG improvement actions with title, description, owner, due date, status, and progress notes
7. **Reports** — Generate ESG reports with configurable sections (policy, topics, metrics, actions), preview, and export (text/CSV)
8. **Settings** — Company profile, account info, Metric Configuration admin (direction, targets, thresholds, enable/disable), Policy Template admin, and activity log

### AI-Assisted Features

9. **Policy Generator** — Guided 4-step questionnaire that generates a tailored ESG policy using AI
10. **Supplier Questionnaire Autofill** — Paste ESG questionnaire questions; generates suggested answers using existing company data
11. **Carbon Calculator** — SME-friendly calculator for Scope 1, 2, and 3 emissions with configurable emission factors
12. **Policy Templates** — 28 structured policy templates with guided questionnaires, clause-based drafting, compliance mapping, version control, and multi-format export (TXT/DOCX/PDF)

## Metrics System

### 28 Default Metrics

**Environmental (10):** Electricity Consumption, Gas/Fuel Consumption, Company Vehicle Fuel Use, Scope 1 Emissions (calculated), Scope 2 Emissions (calculated), Waste Generated, Recycling Rate (calculated), Water Consumption, Business Travel Emissions (calculated), Carbon Intensity (derived)

**Social (10):** Total Employees, Gender Split (% Female), Management Gender Diversity (calculated), Employee Turnover Rate (calculated), Absence Rate (calculated), Training Hours per Employee (calculated), Lost Time Incidents, Employee Engagement Score, Living Wage Coverage (calculated), Community Investment

**Governance (8):** Board Meetings Held, Anti-Bribery Policy in Place, Whistleblowing Policy in Place, Data Privacy Training Completion (calculated), Supplier Code of Conduct Adoption (calculated), Cybersecurity Policy in Place, ESG Responsibility Assigned, ESG Targets Set

### Metric Types
- **Manual**: User enters values directly (e.g. electricity kWh, headcount)
- **Calculated**: Auto-computed from raw data inputs (e.g. Scope 1 = gas + fuel factors)
- **Derived**: Computed from other metrics (e.g. Carbon Intensity = emissions / employees)

### Traffic Light Scoring
- **Green**: On target or improving
- **Amber**: Within amber threshold % of target
- **Red**: Beyond red threshold % of target
- Directions: higher_is_better, lower_is_better, target_range, compliance_yes_no

### Calculation Engine (server/calculations.ts)
- Scope 1: (Gas kWh × factor + Vehicle litres × factor) / 1000
- Scope 2: Electricity kWh × factor / 1000
- Recycling Rate: Recycled / Total × 100
- Business Travel: Sum of (activity × factor) / 1000
- Carbon Intensity: Total emissions / employees (or per £m revenue)
- Turnover Rate: Leavers / Headcount × 100
- Absence Rate: Absence days / Working days × 100
- Training per Employee: Total hours / Headcount
- And more (privacy training, supplier code, living wage, management diversity)

### Raw Data Inputs
Stored in `raw_data_inputs` table. Categories: electricity_kwh, gas_kwh, vehicle_fuel_litres, total_waste_tonnes, recycled_waste_tonnes, water_m3, employee_headcount, employee_leavers, absence_days, total_working_days, total_training_hours, trained_staff, total_staff, signed_suppliers, total_suppliers, female_managers, total_managers, living_wage_employees, domestic_flight_km, short_haul_flight_km, long_haul_flight_km, rail_km, hotel_nights, car_miles

## Tech Stack

- **Frontend**: React, TanStack Query, Wouter, Recharts, Shadcn UI, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (via Drizzle ORM)
- **Auth**: Session-based with express-session and connect-pg-simple, bcrypt password hashing, rate limiting
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2)

## Database Tables

- `users` — User accounts with role (admin/contributor/approver/viewer)
- `companies` — Company profiles
- `company_settings` — Which ESG areas to track
- `esg_policies` — Policy documents with status
- `policy_versions` — Version history for policies
- `material_topics` — Priority ESG topics
- `metrics` — Metric definitions with metricType, calculationType, formulaText, direction, targetValue/Min/Max, displayOrder, helpText, amberThreshold, redThreshold
- `metric_targets` — Target values per metric
- `metric_values` — Data submissions with previousValue, targetValue, status (traffic light), percentChange, dataSourceType (evidenced/estimated/manual)
- `raw_data_inputs` — Raw operational data inputs (electricity, gas, waste, headcount, etc.), dataSourceType
- `evidence_files` — Evidence management with linkedModule (metric_value/raw_data/policy/questionnaire_answer/report), linkedEntityId, linkedPeriod, evidenceStatus (uploaded/reviewed/approved/expired), description, expiryDate, reviewDate, reviewedBy/At
- `action_plans` — ESG improvement actions
- `report_runs` — Report generation history
- `audit_logs` — Activity history
- `policy_generation_inputs` — Policy generator questionnaire inputs
- `emission_factors` — Carbon emission factors (UK DEFRA 2024)
- `carbon_calculations` — Carbon calculation history
- `questionnaires` / `questionnaire_questions` — ESG questionnaires (with workflow status, rationale, sourceData for AI transparency)
- `policy_templates` / `generated_policies` — Policy template system (with workflow status)
- `ai_generation_logs` — AI generation audit trail (featureType, modelName, promptVersion, generatedAt, generatedBy, sourceDataSummary, promptText, outputSummary, entityId, entityType)

## API Routes

### Metrics & Data
- `GET /api/metrics` — List all metrics
- `POST /api/metrics` — Add custom metric
- `PUT /api/metrics/:id` — Update metric
- `PUT /api/metrics/:id/admin` — Admin metric configuration
- `GET /api/metrics/:id/history` — Metric history with traffic lights
- `GET /api/data-entry/:period` — Get metric values for period
- `POST /api/data-entry` — Submit metric value
- `POST /api/data-entry/:period/lock` — Lock period
- `GET /api/raw-data/:period` — Get raw data inputs
- `POST /api/raw-data` — Save raw data inputs
- `POST /api/data-entry/bulk-upload` — Bulk upload from Excel (raw + manual data, with lock checks and auto-recalculation)
- `GET /api/data-entry/template` — Get template structure (row names and periods) for Excel download
- `POST /api/metrics/recalculate/:period` — Trigger recalculation
- `GET /api/dashboard/enhanced` — Enhanced dashboard with traffic lights

### Evidence
- `GET /api/evidence` — List all evidence files for company
- `GET /api/evidence/coverage` — Evidence coverage stats (metric coverage, period coverage, status breakdown)
- `GET /api/evidence/entity/:module/:entityId` — Get evidence for a specific entity
- `POST /api/evidence` — Upload evidence file (with linkedModule, linkedEntityId, linkedPeriod, expiryDate)
- `PUT /api/evidence/:id` — Update evidence (description, status, expiry)
- `DELETE /api/evidence/:id` — Delete evidence file

## Onboarding System

Two-path onboarding for new users, with database persistence and autosave/resume:

### Guided Setup (8-step wizard)
1. **Company Profile** — Name, industry, country, employee count, operational profile
2. **ESG Maturity** — Just Starting / Some Policies / Formal Programme
3. **Module Selection** — Toggle: Metrics, Carbon Calculator, Policy Generator, Supplier Questionnaire, Reporting, Traffic Light Scoring
4. **Metric Selection** — Grouped by E/S/G, pre-selected based on maturity + profile, with descriptions
5. **Carbon Calculator Setup** — Track electricity/gas/vehicles, auto Scope 1/2
6. **Policy Generation Setup** — Enable/disable policy drafting tools
7. **Supplier Assessment Setup** — Enable/disable supplier questionnaire
8. **Completion Summary** — Metrics count, module status, company details, "Go to Dashboard"

### Manual Setup
- Immediately marks onboarding complete, seeds full demo data
- Shows a setup checklist card on the dashboard with real progress tracking (profile, metrics, carbon calculator, policies, supplier, data entry)

### Onboarding API
- `PUT /api/onboarding/step` — Autosave step data (validated, bounds-checked 1-8)
- `POST /api/onboarding/complete` — Finalize onboarding, create metrics from selections (guided) or seed full data (manual)

### Onboarding DB Columns (companies table)
- `onboarding_complete` (boolean), `onboarding_path` (guided/manual), `onboarding_step` (1-8), `onboarding_progress_percent` (0-100)
- `onboarding_started_at`, `onboarding_completed_at` (timestamps)
- `esg_maturity`, `selected_modules`, `selected_metrics`, `onboarding_answers` (jsonb), `operational_profile`, `reporting_year_start`

### Flow
- New registrations: `onboardingComplete = false` → redirected to /onboarding
- Demo account: `onboardingComplete = true` → goes straight to dashboard
- `seedDatabase()` (for demo/manual) sets `onboardingComplete = true` automatically
- `seedMetricsFromSelection()` creates only the metrics selected during guided wizard via METRIC_KEY_MAP

## Demo Account

- **Email**: demo@example.com
- **Password**: password123
- Pre-loaded with 28 metrics, 6 months of sample data (2025-01 to 2025-06), raw data inputs for all periods (including travel data), action plans, ESG policy, and carbon calculation
- Data Entry period selector covers 24 months to ensure seed data periods are accessible
- Has `onboardingComplete = true` (bypasses onboarding)

## Architecture

- All routes prefixed with `/api`
- Session stored in PostgreSQL via `connect-pg-simple`
- Frontend served by Vite in development
- New registrations go through onboarding wizard; demo account auto-seeds on login
- RBAC: 4 roles (admin/contributor/approver/viewer), 7 permission modules (metrics_data_entry, policy_editing, report_generation, questionnaire_access, settings_admin, template_admin, user_management)
- Permissions defined in shared/schema.ts (ROLE_PERMISSIONS map), enforced server-side via requirePermission() middleware and client-side via usePermissions() hook
- User management: GET /api/users, PUT /api/users/:id/role (admin only)
- Legacy "editor" role maps to "contributor" permissions
- Password hashing: bcrypt (12 rounds) with SHA-256 legacy fallback and auto-migration on login
- Rate limiting: 10 login attempts/15min (keyed by normalized email), 5 register attempts/hr, 5 password changes/15min
- Session security: SameSite=lax, httpOnly, secure cookies; session regeneration on login/register; SESSION_SECRET required (no fallback)
- Password change: POST /api/auth/change-password (requireAuth, validates current password, bcrypt new hash, audit logged)
- **Workflow States**: All key entities (metric values, raw data, reports, generated policies, questionnaire questions) have workflowStatus (draft/submitted/approved/rejected/archived) with reviewedBy/reviewedAt/reviewComment. State transitions enforced: draft→submitted→approved|rejected, rejected→draft|submitted. Company ownership verified on all workflow actions.
- **AI Safety/Governance**: All AI outputs marked as "draft" requiring human review. AI generation metadata logged to ai_generation_logs (model, prompt version, timestamp, user, source data). Questionnaire autofill returns structured rationale, confidence (high/medium/low), and source data references. Prompt sanitization strips injection patterns from user-provided question text.
- Workflow API: POST /api/workflow/submit, POST /api/workflow/review, GET /api/workflow/pending, GET /api/ai-logs/:entityType/:entityId
- Frontend: WorkflowBadge (color-coded status), AiDraftBadge ("Draft - Review Required"), ConfidenceBadge (high/medium/low) components
- Design: green primary color (`hsl(158, 64%, 32%)`), Open Sans font, supports light/dark mode
- Sidebar width: 14rem via CSS vars on SidebarProvider
- `apiRequest` used as `apiRequest(method, url, data)` not fetch-style

## Running

The app runs via the "Start application" workflow which executes `npm run dev`.
