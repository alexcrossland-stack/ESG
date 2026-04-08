import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { ensureIndexes } from "./ensure-indexes";
import { storage, db } from "./storage";
import { sql } from "drizzle-orm";
import { seedFrameworks } from "./seed-frameworks";

const isProd = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) {
  console.error("[Startup] FATAL: DATABASE_URL environment variable is required");
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("[Startup] FATAL: SESSION_SECRET must be set and at least 32 characters");
  process.exit(1);
}
if (!process.env.RESEND_API_KEY) {
  console.warn("[Startup] WARN: RESEND_API_KEY not set — email features will be disabled");
}
if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  console.warn("[Startup] WARN: AI_INTEGRATIONS_OPENAI_API_KEY not set — AI features will degrade gracefully");
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[Startup] WARN: STRIPE_SECRET_KEY not set — billing features will be disabled");
}

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https:", "wss:"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xContentTypeOptions: true,
    xFrameOptions: { action: "deny" },
  })
);

if (isProd) {
  const allowedOrigins = (process.env.REPLIT_DOMAINS || "")
    .split(",")
    .map(d => d.trim())
    .filter(Boolean)
    .map(d => `https://${d}`);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.some(o => origin.startsWith(o))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

app.use(
  express.json({
    limit: "2mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "2mb" }));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (!isProd) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (!isProd && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (duration > 2000) {
        log(`[SLOW ROUTE] ${logLine}`, "perf");
        try {
          storage.createPlatformHealthEvent({
            eventType: "slow_route",
            severity: "warning",
            message: `Slow route: ${req.method} ${path} took ${duration}ms`,
            details: { method: req.method, path, durationMs: duration, statusCode: res.statusCode },
            companyId: null,
          }).catch(() => {});
        } catch {}
      }
      log(logLine);

      const statusCode = res.statusCode;
      if (statusCode >= 400) {
        const isPortfolioRoute = path.startsWith("/api/portfolio") || path.startsWith("/api/groups");
        const sessionData = (req as any).session as any;
        const auth = (req as any)._auth as { userId?: string; companyId?: string; role?: string } | undefined;
        const userId = auth?.userId ?? sessionData?.userId ?? null;
        const companyId = auth?.companyId ?? sessionData?.companyId ?? null;
        const role = auth?.role ?? sessionData?.role ?? null;
        const groupId = (req.params as any)?.groupId ?? null;

        const errorContext: Record<string, unknown> = {
          method: req.method,
          path,
          statusCode,
          userId,
          companyId,
          role,
          durationMs: duration,
          isPortfolioRoute,
        };
        if (groupId) errorContext.groupId = groupId;
        if (isPortfolioRoute) errorContext.portfolioTag = true;

        if (statusCode >= 500) {
          console.error(`[api-error] ${statusCode} ${req.method} ${path}`, JSON.stringify(errorContext));
          storage.createPlatformHealthEvent({
            eventType: isPortfolioRoute ? "portfolio_5xx_error" : "api_5xx_error",
            severity: "error",
            message: `API ${statusCode}: ${req.method} ${path}`,
            details: errorContext,
            companyId: companyId ?? null,
          }).catch(() => {});
        } else {
          console.warn(`[api-error] ${statusCode} ${req.method} ${path}`, JSON.stringify(errorContext));
          if (isPortfolioRoute) {
            storage.createPlatformHealthEvent({
              eventType: "portfolio_4xx_error",
              severity: "warning",
              message: `Portfolio API ${statusCode}: ${req.method} ${path}`,
              details: errorContext,
              companyId: companyId ?? null,
            }).catch(() => {});
          }
        }
      }
    }
  });

  next();
});

(async () => {
  await ensureIndexes();

  // Schema validation — catch missing columns before they cause silent runtime failures
  try {
    const colResult = await db.execute(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'
    `);
    const existing = new Set(((colResult as any).rows ?? []).map((r: any) => r.column_name as string));
    const required: string[] = [
      // Identity & core
      "id", "name", "status", "created_at",
      // Onboarding
      "onboarding_complete", "onboarding_step", "onboarding_path", "onboarding_progress_percent",
      "onboarding_version",
      // Billing
      "plan_tier", "plan_status", "current_period_end",
      "stripe_customer_id", "stripe_subscription_id",
      // Beta access
      "is_beta_company", "beta_expires_at", "beta_access_level", "beta_granted_by", "beta_reason",
      // Features
      "demo_mode", "profile_share_enabled", "esg_action_plan", "esg_roadmap",
    ];
    const missing = required.filter(col => !existing.has(col));
    if (missing.length > 0) {
      console.error(`[Startup] FATAL: Database schema out of sync — run db:push`);
      console.error(`[Startup] FATAL: Missing columns in 'companies' table: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`[Startup] Schema check passed (${existing.size} columns in 'companies')`);
  } catch (e: any) {
    console.error("[Startup] FATAL: Could not validate database schema:", e.message ?? e);
    process.exit(1);
  }

  try {
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS esg_roadmap jsonb`);
  } catch {}
  try {
    await db.execute(sql`ALTER TYPE role ADD VALUE IF NOT EXISTS 'super_admin'`);
  } catch {}
  // Lifecycle state migration: ensure enum and column exist, then backfill existing companies to 'active'
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE company_lifecycle_state AS ENUM ('created', 'onboarding_started', 'onboarding_completed', 'active', 'archived');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  } catch {}
  try {
    await db.execute(sql`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS lifecycle_state company_lifecycle_state DEFAULT 'created'
    `);
    // One-time backfill: set all legacy companies to 'active'.
    // When ADD COLUMN ... DEFAULT 'created' runs (first migration), Postgres sets ALL existing rows
    // to 'created'. We must back-fill them to 'active' since they predate lifecycle state management.
    // We use a migration_completed_at marker column to run this backfill only once — on the first
    // startup after the column is added. On subsequent startups the column already exists and
    // the DEFAULT won't overwrite existing non-null values, so the marker prevents double-runs.
    const markerResult = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'companies' AND column_name = 'lifecycle_state_backfilled'
    `);
    const markerRows = (markerResult as any).rows ?? [];
    if (markerRows.length === 0) {
      // First time: backfill all existing companies to 'active'
      await db.execute(sql`
        UPDATE companies SET lifecycle_state = 'active'
        WHERE lifecycle_state = 'created'
      `);
      // Add a marker column so this backfill only runs once
      await db.execute(sql`
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS lifecycle_state_backfilled boolean DEFAULT true
      `);
      console.log("[Startup] lifecycle_state backfill completed — all existing companies set to 'active'");
    }
  } catch (e: any) {
    console.warn("[Startup] lifecycle_state migration warning:", e.message);
  }
  try {
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'`);
  } catch {}
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS super_admin_actions (
        id serial PRIMARY KEY,
        admin_user_id integer,
        action text NOT NULL,
        target_company_id integer,
        target_user_id integer,
        metadata jsonb,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
  } catch {}
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_sessions_ext (
        id serial PRIMARY KEY,
        user_id varchar NOT NULL,
        company_id varchar,
        session_id text NOT NULL UNIQUE,
        ip_address text,
        user_agent text,
        device_summary text,
        created_at timestamp DEFAULT now() NOT NULL,
        last_seen_at timestamp DEFAULT now() NOT NULL,
        expires_at timestamp NOT NULL,
        revoked_at timestamp,
        step_up_at timestamp
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_ext_user_id ON user_sessions_ext (user_id)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_ext_session_id ON user_sessions_ext (session_id)`);
  } catch (e: any) {
    console.error("[Startup] FATAL: Could not create or validate user_sessions_ext — run db:push or apply schema manually");
    console.error("[Startup] FATAL:", e.message ?? e);
    process.exit(1);
  }
  try {
    await db.execute(sql`ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS metadata jsonb`);
  } catch (e: any) {
    console.error("[Startup] FATAL: Could not ensure auth_tokens.metadata exists");
    console.error("[Startup] FATAL:", e.message ?? e);
    process.exit(1);
  }
  try {
    const result = await db.execute(sql`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
    const rows = (result as any).rows ?? [];
    if (rows.length === 0) {
      console.warn("[Startup] WARN: No super_admin user found in the database — create one via direct SQL or promote an existing user");
    }
  } catch (e) {
    console.warn("[Startup] WARN: Could not check for super_admin user:", e);
  }

  // Validate organisation_sites table and site_id columns exist
  try {
    const orgSitesResult = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'organisation_sites' AND table_schema = 'public'
    `);
    const orgSitesRows = (orgSitesResult as any).rows ?? [];
    if (orgSitesRows.length === 0) {
      console.error("[Startup] FATAL: organisation_sites table is missing — run db:push or apply schema manually");
      process.exit(1);
    }
    const siteIdResult = await db.execute(sql`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'site_id' AND table_schema = 'public'
    `);
    const siteIdTables = ((siteIdResult as any).rows ?? []).map((r: any) => r.table_name as string);
    const required = ["metric_values", "evidence_files", "questionnaires", "report_runs", "carbon_calculations", "raw_data_inputs", "generated_policies", "user_activity", "agent_runs", "chat_sessions"];
    const missingSiteId = required.filter(t => !siteIdTables.includes(t));
    if (missingSiteId.length > 0) {
      console.error(`[Startup] FATAL: site_id column missing from tables: ${missingSiteId.join(", ")}`);
      process.exit(1);
    }
    console.log("[Startup] Multi-site schema check passed");
  } catch (e: any) {
    console.error("[Startup] FATAL: Could not validate multi-site schema:", e.message ?? e);
    process.exit(1);
  }
  try {
    const sessionTableResult = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'user_sessions_ext' AND table_schema = 'public'
    `);
    const sessionRows = (sessionTableResult as any).rows ?? [];
    if (sessionRows.length === 0) {
      console.error("[Startup] FATAL: user_sessions_ext table is missing — run db:push or apply schema manually");
      process.exit(1);
    }
    const sessionColumnResult = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_sessions_ext' AND table_schema = 'public'
    `);
    const sessionColumns = new Set(((sessionColumnResult as any).rows ?? []).map((r: any) => r.column_name as string));
    const requiredSessionColumns = [
      "id",
      "user_id",
      "company_id",
      "session_id",
      "ip_address",
      "user_agent",
      "device_summary",
      "created_at",
      "last_seen_at",
      "expires_at",
      "revoked_at",
      "step_up_at",
    ];
    const missingSessionColumns = requiredSessionColumns.filter(col => !sessionColumns.has(col));
    if (missingSessionColumns.length > 0) {
      console.error(`[Startup] FATAL: user_sessions_ext is missing columns: ${missingSessionColumns.join(", ")}`);
      console.error("[Startup] FATAL: Run db:push or apply the session schema manually");
      process.exit(1);
    }
    console.log("[Startup] Extended session schema check passed");
  } catch (e: any) {
    console.error("[Startup] FATAL: Could not validate user_sessions_ext schema:", e.message ?? e);
    process.exit(1);
  }
  try {
    await seedFrameworks();
  } catch (e: any) {
    console.warn("[Startup] WARN: Framework seeding failed:", e.message ?? e);
  }

  // MFA & GDPR schema migrations
  const mfaMigrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes_hash text[]`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamp`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_provider_id varchar`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymised_at timestamp`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS mfa_policy text DEFAULT 'optional'`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS deletion_pending_at timestamp`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamp`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS deletion_requested_by varchar`,
    `CREATE TABLE IF NOT EXISTS identity_providers (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id varchar NOT NULL,
      provider_type text NOT NULL DEFAULT 'saml',
      name text NOT NULL,
      domain text,
      config jsonb,
      is_enabled boolean DEFAULT false,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      created_by varchar
    )`,
    `CREATE TABLE IF NOT EXISTS data_export_jobs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id varchar NOT NULL,
      requested_by varchar NOT NULL,
      export_scope text NOT NULL DEFAULT 'personal',
      status text NOT NULL DEFAULT 'pending',
      download_token varchar,
      download_token_used boolean DEFAULT false,
      file_data text,
      file_size integer,
      expires_at timestamp,
      completed_at timestamp,
      error text,
      attempts integer DEFAULT 0,
      created_at timestamp DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS data_deletion_requests (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id varchar NOT NULL,
      requested_by varchar NOT NULL,
      deletion_scope text NOT NULL DEFAULT 'user',
      target_user_id varchar,
      status text NOT NULL DEFAULT 'pending',
      confirmation_text text,
      processed_at timestamp,
      scheduled_at timestamp,
      error text,
      created_at timestamp DEFAULT now()
    )`,
  ];
  for (const migration of mfaMigrations) {
    try {
      await db.execute(sql.raw(migration));
    } catch (e: any) {
      console.warn(`[Startup] Migration warning: ${e.message?.substring(0, 100)}`);
    }
  }
  console.log("[Startup] MFA & GDPR schema migrations applied");

  // Portfolio Groups schema migrations (Task #54)
  // drizzle-kit push cannot be used on this codebase (pre-existing super_admin_actions conflict),
  // so DDL is applied inline here, idempotently, following the platform's established pattern.
  const portfolioMigrations = [
    // Extend role enum with portfolio roles
    `ALTER TYPE role ADD VALUE IF NOT EXISTS 'portfolio_owner'`,
    `ALTER TYPE role ADD VALUE IF NOT EXISTS 'portfolio_viewer'`,
    // Create portfolio-specific enums if not already present (with all required values)
    `DO $$ BEGIN
       CREATE TYPE group_type AS ENUM ('portfolio', 'holding_company', 'advisor_group', 'other');
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$`,
    // Add any enum values that may have been added since initial creation
    `DO $$ BEGIN ALTER TYPE group_type ADD VALUE IF NOT EXISTS 'holding_company'; EXCEPTION WHEN others THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TYPE group_type ADD VALUE IF NOT EXISTS 'advisor_group'; EXCEPTION WHEN others THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TYPE group_type ADD VALUE IF NOT EXISTS 'other'; EXCEPTION WHEN others THEN NULL; END $$`,
    `DO $$ BEGIN
       CREATE TYPE portfolio_role AS ENUM ('portfolio_owner', 'portfolio_viewer');
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$`,
    `DO $$ BEGIN ALTER TYPE portfolio_role ADD VALUE IF NOT EXISTS 'portfolio_owner'; EXCEPTION WHEN others THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TYPE portfolio_role ADD VALUE IF NOT EXISTS 'portfolio_viewer'; EXCEPTION WHEN others THEN NULL; END $$`,
    // groups table: portfolio group definitions (type column uses group_type enum)
    `CREATE TABLE IF NOT EXISTS groups (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      slug text NOT NULL,
      type group_type NOT NULL DEFAULT 'portfolio',
      description text,
      created_by_user_id varchar,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )`,
    // Unique slug index
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_slug ON groups(slug)`,
    // group_companies table: many-to-many between groups and companies
    `CREATE TABLE IF NOT EXISTS group_companies (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id varchar NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_at timestamp DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_group_companies_unique ON group_companies(group_id, company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_companies_group_id ON group_companies(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_group_companies_company_id ON group_companies(company_id)`,
    // user_group_roles table: per-user role within a group
    `CREATE TABLE IF NOT EXISTS user_group_roles (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL,
      group_id varchar NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      role portfolio_role NOT NULL DEFAULT 'portfolio_viewer',
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_group_roles_unique ON user_group_roles(user_id, group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_group_roles_user_id ON user_group_roles(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_group_roles_group_id ON user_group_roles(group_id)`,
  ];
  for (const migration of portfolioMigrations) {
    try {
      await db.execute(sql.raw(migration));
    } catch (e: any) {
      // Idempotent — ignore "already exists" and enum duplicate value errors
      if (!e.message?.includes("already exists") && !e.message?.includes("duplicate")) {
        console.warn(`[Startup] Portfolio migration warning: ${e.message?.substring(0, 120)}`);
      }
    }
  }
  console.log("[Startup] Portfolio Groups schema migrations applied");

  // Company Onboarding Checklist schema migration (Task #63)
  try {
    await db.execute(sql.raw(`
      DO $$ BEGIN
        CREATE TYPE onboarding_checklist_status AS ENUM ('pending', 'in_progress', 'complete', 'skipped');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS company_onboarding_checklist (
        id serial PRIMARY KEY,
        company_id varchar NOT NULL,
        task_key varchar NOT NULL,
        label varchar NOT NULL DEFAULT '',
        description text DEFAULT '',
        status onboarding_checklist_status NOT NULL DEFAULT 'pending',
        completed_at timestamp,
        skipped_at timestamp,
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS company_onboarding_checklist_company_task_key
      ON company_onboarding_checklist(company_id, task_key)
    `));
    console.log("[Startup] Company onboarding checklist schema migration applied");
  } catch (e: any) {
    console.warn("[Startup] Onboarding checklist migration warning:", e.message?.substring(0, 100));
  }

  // Telemetry Events schema migration (Task #59)
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        event_name text NOT NULL,
        user_id varchar,
        company_id varchar,
        group_id varchar,
        properties jsonb,
        recorded_at timestamp DEFAULT now() NOT NULL
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON telemetry_events(event_name)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_telemetry_company_id ON telemetry_events(company_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at ON telemetry_events(recorded_at)`));
    console.log("[Startup] Telemetry events schema migration applied");
  } catch (e: any) {
    console.warn("[Startup] Telemetry migration warning:", e.message?.substring(0, 100));
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (status >= 500) {
      console.error("Internal Server Error:", err);
      try {
        storage.createPlatformHealthEvent({
          eventType: "server_error",
          severity: "error",
          message: `Unhandled ${status}: ${message}`,
          details: { method: req.method, path: req.path, statusCode: status },
          companyId: null,
        }).catch(() => {});
      } catch {}
    }

    if (res.headersSent) {
      return next(err);
    }

    const safeMessage = isProd && status >= 500
      ? "An unexpected error occurred. Please try again later."
      : message;

    return res.status(status).json({ message: safeMessage });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
