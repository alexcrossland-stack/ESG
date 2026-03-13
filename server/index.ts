import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { ensureIndexes } from "./ensure-indexes";
import { storage, db } from "./storage";
import { sql } from "drizzle-orm";

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
    contentSecurityPolicy: isProd ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
      },
    } : false,
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
  try {
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS esg_roadmap jsonb`);
  } catch {}
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
