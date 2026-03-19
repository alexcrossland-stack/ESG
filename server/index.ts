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
    await seedFrameworks();
  } catch (e: any) {
    console.warn("[Startup] WARN: Framework seeding failed:", e.message ?? e);
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

    return res.status(status).json({ message });
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
