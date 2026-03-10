# ESG Manager — SME ESG Platform

## Overview

The ESG Manager is a SaaS web application designed for Small and Medium-sized Enterprises (SMEs) to streamline their Environmental, Social, and Governance (ESG) policy management, data tracking, and reporting. It aims to replace manual processes with a guided, AI-assisted platform, making ESG accessible to business owners, CFOs, HR, and operations managers without requiring prior ESG expertise. The platform provides tools for policy generation, questionnaire autofill, and carbon emissions calculation, ultimately helping businesses improve their ESG performance and reporting capabilities.

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
    - **Reports:** Generates configurable ESG reports for export.
    - **Evidence Management:** Tracks evidence files linked to various modules, with statuses and review workflows.
- **Workflow Management:** Key entities (metric values, raw data, reports, policies, questionnaire answers) have `workflowStatus` (draft/submitted/approved/rejected/archived) with enforced state transitions and audit trails.
- **AI Safety/Governance:** All AI-generated outputs are explicitly marked as "draft" requiring human review. AI generation metadata, including model, prompt version, user, and source data, is logged. Prompt sanitization is applied to user inputs.

**Feature Specifications:**
- **AI-Assisted Tools:**
    - **Policy Generator:** Guides users through a questionnaire to generate tailored ESG policies.
    - **Supplier Questionnaire Autofill:** Auto-suggests answers for ESG questionnaires using existing company data, providing rationale and confidence levels.
    - **Carbon Estimator:** SME-focused carbon module with versioned emission factor sets (UK DEFRA 2024), data quality tracking (actual/estimated/proxy), fuel-type-specific factors (diesel/petrol/hybrid/electric/LPG), proxy calculations from floor area, per-line-item methodology notes, assumptions tracking, and detailed text export. Rules-based calculations only (no AI).
    - **Policy Templates:** Offers 28 structured templates with guided drafting, compliance mapping, and multi-format export.
- **Calculation Engine:** Centralized service (`server/calculations.ts`) handles complex ESG metric calculations (e.g., Scope 1/2 emissions, recycling rate, carbon intensity, employee turnover).

## External Dependencies

- **AI Services:** OpenAI (via Replit AI Integrations, specifically `gpt-5.2`) for AI-assisted features like policy generation and questionnaire autofill.
- **Database:** PostgreSQL.
- **Session Store:** `connect-pg-simple` for storing session data in PostgreSQL.
- **Password Hashing:** `bcrypt` library.
- **UI Frameworks:** React, Tailwind CSS, Shadcn UI.
- **Data Visualization:** Recharts.
- **Data Fetching:** TanStack Query.