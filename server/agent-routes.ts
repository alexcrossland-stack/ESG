import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage, db } from "./storage";
import { sql } from "drizzle-orm";
import { generateAgentApiKey, requireAgentAuth, requireAgentScope } from "./agent-auth";
import { getSchedulerStatus } from "./scheduler";
import { POLICY_TEMPLATES } from "./policy-templates";
import { SME_BENCHMARKS } from "./benchmarks";
import { getUserPermissions } from "@shared/schema";

// ---------------------------------------------------------------------------
// Admin user session auth (for key management routes)
// ---------------------------------------------------------------------------

async function requireAdminUser(req: Request, res: Response, next: Function) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin role required" });
  }
  (req as any)._adminUser = user;
  return next();
}

// ---------------------------------------------------------------------------
// In-memory knowledge corpus (built once, searched per request)
// ---------------------------------------------------------------------------

const DEFAULT_METRICS = [
  { key: "electricity", name: "Electricity Consumption", category: "environmental", unit: "kWh", description: "Total electricity consumed from the grid and renewable sources." },
  { key: "gas_fuel", name: "Gas / Fuel Consumption", category: "environmental", unit: "kWh", description: "Natural gas and other fuel energy consumed on-site." },
  { key: "scope1", name: "Scope 1 Emissions", category: "environmental", unit: "tCO2e", description: "Direct GHG emissions from sources owned or controlled by the company." },
  { key: "scope2", name: "Scope 2 Emissions", category: "environmental", unit: "tCO2e", description: "Indirect GHG emissions from purchased electricity, heat, or steam." },
  { key: "scope3", name: "Scope 3 Emissions", category: "environmental", unit: "tCO2e", description: "All other indirect GHG emissions in the company's value chain." },
  { key: "waste", name: "Waste Generated", category: "environmental", unit: "tonnes", description: "Total waste produced including landfill, recycled, and composted." },
  { key: "recycling", name: "Recycling Rate", category: "environmental", unit: "%", description: "Percentage of total waste diverted from landfill through recycling or composting." },
  { key: "water", name: "Water Consumption", category: "environmental", unit: "m³", description: "Total fresh water withdrawn for operations." },
  { key: "renewable_energy", name: "Renewable Energy Usage", category: "environmental", unit: "%", description: "Share of total energy consumption from renewable sources." },
  { key: "employee_count", name: "Employee Count", category: "social", unit: "headcount", description: "Total number of full-time equivalent employees at period end." },
  { key: "turnover_rate", name: "Staff Turnover Rate", category: "social", unit: "%", description: "Percentage of employees who left the company during the reporting period." },
  { key: "absence_rate", name: "Staff Absence Rate", category: "social", unit: "%", description: "Percentage of working days lost to unplanned absence." },
  { key: "training_hours", name: "Training Hours per Employee", category: "social", unit: "hours", description: "Average training and development hours per employee per year." },
  { key: "female_management", name: "Women in Management", category: "social", unit: "%", description: "Percentage of management positions held by women." },
  { key: "gender_pay_gap", name: "Gender Pay Gap", category: "social", unit: "%", description: "Mean difference in pay between male and female employees." },
  { key: "living_wage", name: "Living Wage Compliance", category: "social", unit: "%", description: "Percentage of employees paid at least the real Living Wage." },
  { key: "health_safety_incidents", name: "Health & Safety Incidents", category: "social", unit: "count", description: "Number of reportable workplace accidents or near-misses." },
  { key: "lost_time_injury", name: "Lost Time Injury Rate", category: "social", unit: "per 1000 employees", description: "Number of injuries causing lost working time per 1000 employees." },
  { key: "community_investment", name: "Community Investment", category: "social", unit: "£", description: "Total value of charitable donations, volunteering time, and community contributions." },
  { key: "board_independence", name: "Board Independence", category: "governance", unit: "%", description: "Percentage of board members who are independent non-executive directors." },
  { key: "board_gender_diversity", name: "Board Gender Diversity", category: "governance", unit: "%", description: "Percentage of board seats held by women." },
  { key: "ethics_training", name: "Ethics & Compliance Training", category: "governance", unit: "%", description: "Percentage of employees completing ethics and compliance training." },
  { key: "policy_coverage", name: "Policy Coverage", category: "governance", unit: "% of required policies", description: "Percentage of required ESG policies that are in place and published." },
  { key: "supplier_code_coverage", name: "Supplier Code of Conduct Coverage", category: "governance", unit: "%", description: "Percentage of key suppliers who have signed the company's code of conduct." },
  { key: "data_breaches", name: "Data Breaches", category: "governance", unit: "count", description: "Number of confirmed personal data breaches during the period." },
  { key: "customer_complaints", name: "Customer Complaints", category: "governance", unit: "count", description: "Total number of formal customer complaints received." },
  { key: "audit_findings", name: "Internal Audit Findings", category: "governance", unit: "count", description: "Number of material findings raised in internal audits." },
  { key: "whistleblower_reports", name: "Whistleblower Reports", category: "governance", unit: "count", description: "Number of concerns raised through whistleblowing channels." },
];

const COMPLIANCE_FRAMEWORKS = [
  { name: "GRI Standards", category: "reporting_framework", description: "Global Reporting Initiative standards — the world's most widely used framework for sustainability reporting by all types of organisations.", url: "https://www.globalreporting.org" },
  { name: "ISO 14001", category: "management_standard", description: "International standard for environmental management systems (EMS). Provides a framework for organisations to enhance environmental performance.", url: "https://www.iso.org/iso-14001-environmental-management.html" },
  { name: "UN Sustainable Development Goals (SDGs)", category: "global_goals", description: "17 goals adopted by the UN in 2015 as a universal call to action to end poverty, protect the planet, and ensure all people enjoy peace and prosperity by 2030.", url: "https://sdgs.un.org" },
  { name: "CDP (Carbon Disclosure Project)", category: "disclosure_framework", description: "Global non-profit that runs the world's environmental disclosure system for companies and cities. Focuses on climate change, water security, and deforestation.", url: "https://www.cdp.net" },
  { name: "TCFD (Task Force on Climate-related Financial Disclosures)", category: "disclosure_framework", description: "Recommendations for disclosing climate-related financial risks and opportunities, widely adopted by financial institutions and corporates.", url: "https://www.fsb-tcfd.org" },
  { name: "CSRD (Corporate Sustainability Reporting Directive)", category: "eu_regulation", description: "EU directive requiring large companies and listed SMEs to report on sustainability matters from 2024 onwards, replacing NFRD.", url: "https://finance.ec.europa.eu/capital-markets-union-and-financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en" },
  { name: "ESRS (European Sustainability Reporting Standards)", category: "eu_regulation", description: "Mandatory sustainability reporting standards for companies under CSRD, developed by EFRAG.", url: "https://www.efrag.org" },
  { name: "Streamlined Energy and Carbon Reporting (SECR)", category: "uk_regulation", description: "UK mandatory framework requiring large companies to report on energy and carbon emissions in their annual report.", url: "https://www.gov.uk/government/publications/academy-trust-financial-management-good-practice-guides" },
  { name: "ISO 26000", category: "guidance_standard", description: "International guidance on social responsibility, covering human rights, labour practices, environment, fair operating practices, consumer issues, and community involvement.", url: "https://www.iso.org/iso-26000-social-responsibility.html" },
  { name: "B Corp Certification", category: "certification", description: "Certification for businesses that meet high standards of social and environmental performance, accountability, and transparency.", url: "https://www.bcorporation.net" },
];

function buildKnowledgeCorpus() {
  const items: { source: string; category: string; title: string; text: string; metadata?: any }[] = [];

  for (const tpl of POLICY_TEMPLATES) {
    items.push({
      source: "policy_templates",
      category: tpl.category,
      title: tpl.name,
      text: tpl.description,
      metadata: {
        slug: tpl.slug,
        isoStandards: tpl.complianceMapping?.isoStandards,
        legalDrivers: tpl.complianceMapping?.legalDrivers,
        defaultReviewCycle: tpl.defaultReviewCycle,
      },
    });
    for (const section of tpl.sections || []) {
      if (section.aiPromptHint) {
        items.push({
          source: "policy_templates",
          category: tpl.category,
          title: `${tpl.name} — ${section.label}`,
          text: section.aiPromptHint,
          metadata: { slug: tpl.slug, sectionKey: section.key },
        });
      }
    }
  }

  for (const metric of DEFAULT_METRICS) {
    items.push({
      source: "default_metrics",
      category: metric.category,
      title: metric.name,
      text: metric.description,
      metadata: { key: metric.key, unit: metric.unit },
    });
  }

  for (const benchmark of SME_BENCHMARKS) {
    items.push({
      source: "benchmarks",
      category: "benchmarks",
      title: benchmark.label,
      text: `${benchmark.label}: SME range ${benchmark.rangeLow}–${benchmark.rangeHigh} ${benchmark.unit} (median ${benchmark.rangeMedian}). ${benchmark.notes || ""} Source: ${benchmark.source}`,
      metadata: {
        metricKey: benchmark.metricKey,
        unit: benchmark.unit,
        rangeLow: benchmark.rangeLow,
        rangeMedian: benchmark.rangeMedian,
        rangeHigh: benchmark.rangeHigh,
        direction: benchmark.direction,
      },
    });
  }

  for (const fw of COMPLIANCE_FRAMEWORKS) {
    items.push({
      source: "compliance_frameworks",
      category: fw.category,
      title: fw.name,
      text: fw.description,
      metadata: { url: fw.url },
    });
  }

  return items;
}

const KNOWLEDGE_CORPUS = buildKnowledgeCorpus();

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAgentRoutes(app: Express) {

  // ── Public health check ─────────────────────────────────────────────────

  app.get("/health", async (_req: Request, res: Response) => {
    let dbStatus: "connected" | "error" = "error";
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
    } catch {}

    const schedulerInfo = getSchedulerStatus();
    const schedulerRunning = !!schedulerInfo.workerId && schedulerInfo.uptime >= 0;
    const schedulerStatus = schedulerRunning ? "running" : "stopped";
    const ok = dbStatus === "connected" && schedulerRunning;

    return res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      db: dbStatus,
      scheduler: schedulerStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Agent API key management (admin session auth) ───────────────────────

  const createKeySchema = z.object({
    agentType: z.enum(["technical_agent", "customer_success_agent", "esg_specialist_agent", "marketing_agent", "master_orchestrator"]),
    label: z.string().min(1),
    scopes: z.array(z.string()).min(1),
    expiresAt: z.string().datetime().optional(),
    companyId: z.string().optional(),
  });

  app.post("/api/internal/agent/keys", requireAdminUser, async (req: Request, res: Response) => {
    try {
      const body = createKeySchema.parse(req.body);
      const { plaintext, hash, prefix } = generateAgentApiKey();
      const key = await storage.createAgentApiKey({
        agentType: body.agentType,
        label: body.label,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: body.scopes,
        companyId: body.companyId || null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      } as any);
      return res.status(201).json({
        id: key.id,
        agentType: key.agentType,
        label: key.label,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        companyId: key.companyId,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        key: plaintext,
      });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/internal/agent/keys", requireAdminUser, async (_req: Request, res: Response) => {
    try {
      const keys = await storage.listAgentApiKeys();
      const safe = keys.map(k => ({
        id: k.id,
        agentType: k.agentType,
        label: k.label,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        companyId: k.companyId,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      }));
      return res.json(safe);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/internal/agent/keys/:id", requireAdminUser, async (req: Request, res: Response) => {
    try {
      await storage.revokeAgentApiKey(req.params.id);
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Company context ─────────────────────────────────────────────────────

  app.get("/api/internal/agent/company/:companyId", requireAgentAuth, requireAgentScope("internal:company"), async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(req.params.companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });
      const settings = await storage.getCompanySettings(req.params.companyId);
      return res.json({
        company: {
          id: company.id,
          name: company.name,
          industry: company.industry,
          country: company.country,
          employeeCount: company.employeeCount,
          revenueBand: company.revenueBand,
          businessType: company.businessType,
          esgMaturity: company.esgMaturity,
          selectedModules: company.selectedModules,
          selectedMetrics: company.selectedMetrics,
          demoMode: company.demoMode,
        },
        plan: {
          tier: company.planTier,
          status: company.planStatus,
          currentPeriodEnd: company.currentPeriodEnd,
        },
        onboarding: {
          complete: company.onboardingComplete,
          step: company.onboardingStep,
          progressPercent: company.onboardingProgressPercent,
          path: company.onboardingPath,
          version: company.onboardingVersion,
        },
        settings: settings ?? null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── User context ────────────────────────────────────────────────────────

  app.get("/api/internal/agent/user/:userId", requireAgentAuth, requireAgentScope("internal:user"), async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const company = user.companyId ? await storage.getCompany(user.companyId) : null;
      const permissions = getUserPermissions(user.role);
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          createdAt: user.createdAt,
        },
        permissions,
        company: company ? {
          id: company.id,
          name: company.name,
          planTier: company.planTier,
          planStatus: company.planStatus,
        } : null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Platform health summary ─────────────────────────────────────────────

  app.get("/api/internal/agent/health", requireAgentAuth, requireAgentScope("internal:health"), async (_req: Request, res: Response) => {
    try {
      const schedulerInfo = getSchedulerStatus();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const counts = await storage.getHealthEventCounts(since24h);
      const recentErrors = await storage.getPlatformHealthEvents(20, 0, "error");
      return res.json({
        scheduler: schedulerInfo,
        last24h: counts,
        recentErrors,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Knowledge retrieval ─────────────────────────────────────────────────

  app.get("/api/internal/agent/knowledge", requireAgentAuth, requireAgentScope("internal:knowledge"), (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.toLowerCase().trim() : "";
      const category = typeof req.query.category === "string" ? req.query.category.toLowerCase().trim() : "";
      const limitParam = parseInt(req.query.limit as string) || 50;

      let results = KNOWLEDGE_CORPUS;

      if (category) {
        results = results.filter(item => item.category.toLowerCase() === category || item.source.toLowerCase() === category);
      }

      if (q) {
        results = results.filter(item =>
          item.title.toLowerCase().includes(q) ||
          item.text.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q)
        );
      }

      return res.json(results.slice(0, limitParam));
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Events, support tickets, audit logs ────────────────────────────────

  app.get("/api/internal/agent/events", requireAgentAuth, requireAgentScope("internal:events"), async (req: Request, res: Response) => {
    try {
      const severity = typeof req.query.severity === "string" ? req.query.severity : undefined;
      const eventType = typeof req.query.type === "string" ? req.query.type : undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getPlatformHealthEvents(limit, 0, severity, eventType);
      return res.json(events);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/internal/agent/support-tickets", requireAgentAuth, requireAgentScope("internal:events"), async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const tickets = await storage.getSupportRequests(limit);
      return res.json(tickets);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/internal/agent/audit-logs/:companyId", requireAgentAuth, requireAgentScope("internal:events"), async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAuditLogs(req.params.companyId);
      const limit = parseInt(req.query.limit as string) || 100;
      return res.json(logs.slice(0, limit));
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Escalations ─────────────────────────────────────────────────────────

  const createEscalationSchema = z.object({
    runId: z.string().optional(),
    agentName: z.string().min(1),
    escalationType: z.string().min(1),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    summary: z.string().min(1),
    companyId: z.string().optional(),
    userId: z.string().optional(),
    relatedEntityType: z.string().optional(),
    relatedEntityId: z.string().optional(),
    createSupportTicket: z.boolean().optional(),
  });

  app.post("/api/internal/agent/escalations", requireAgentAuth, requireAgentScope("internal:escalations"), async (req: Request, res: Response) => {
    try {
      const body = createEscalationSchema.parse(req.body);
      const escalation = await storage.createAgentEscalation({
        runId: body.runId || null,
        agentName: body.agentName,
        escalationType: body.escalationType,
        priority: body.priority,
        summary: body.summary,
        companyId: body.companyId || null,
        userId: body.userId || null,
        relatedEntityType: body.relatedEntityType || null,
        relatedEntityId: body.relatedEntityId || null,
        status: "open",
      } as any);

      let supportTicket = null;
      if (body.createSupportTicket) {
        try {
          const company = body.companyId ? await storage.getCompany(body.companyId) : null;
          const user = body.userId ? await storage.getUser(body.userId) : null;
          supportTicket = await storage.createSupportRequest({
            companyId: body.companyId || null,
            userId: body.userId || null,
            refNumber: `AGT-${Date.now()}`,
            category: "general",
            subject: `[Agent Escalation] ${body.escalationType}: ${body.summary.slice(0, 100)}`,
            message: `Agent escalation created by ${body.agentName}.\n\nPriority: ${body.priority}\nType: ${body.escalationType}\nSummary: ${body.summary}\n\nEscalation ID: ${escalation.id}`,
            companyName: company?.name || null,
            userEmail: user?.email || null,
            userName: user?.username || null,
            status: "new",
            priority: body.priority === "urgent" ? "urgent" : body.priority === "high" ? "high" : "normal",
          });
        } catch (ticketErr: any) {
          console.warn("[AgentRoutes] Failed to create support ticket for escalation:", ticketErr.message);
        }
      }

      return res.status(201).json({ escalation, supportTicket });
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/internal/agent/escalations", requireAgentAuth, requireAgentScope("internal:escalations"), async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const escalations = await storage.listAgentEscalations({ status, companyId, limit });
      return res.json(escalations);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── Agent runs & actions ────────────────────────────────────────────────

  const createRunSchema = z.object({
    agentName: z.string().min(1),
    agentType: z.enum(["technical_agent", "customer_success_agent", "esg_specialist_agent", "marketing_agent", "master_orchestrator"]),
    triggerType: z.string().min(1),
    inputSummary: z.string().optional(),
    status: z.string().default("running"),
    companyId: z.string().optional(),
    userId: z.string().optional(),
    siteId: z.string().optional(),
  });

  const updateRunSchema = z.object({
    outputSummary: z.string().optional(),
    status: z.string().optional(),
    durationMs: z.number().int().optional(),
  });

  const createActionSchema = z.object({
    actionType: z.string().min(1),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    inputSummary: z.string().optional(),
    outputSummary: z.string().optional(),
    status: z.string().min(1),
    error: z.string().optional(),
  });

  app.get("/api/internal/agent/runs", requireAgentAuth, requireAgentScope("internal:runs"), async (req: Request, res: Response) => {
    try {
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const siteId = typeof req.query.siteId === "string" ? req.query.siteId : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const runs = await storage.getAgentRuns({ companyId, siteId, limit });
      return res.json(runs);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/internal/agent/runs", requireAgentAuth, requireAgentScope("internal:runs"), async (req: Request, res: Response) => {
    try {
      const body = createRunSchema.parse(req.body);
      const run = await storage.createAgentRun({
        agentName: body.agentName,
        agentType: body.agentType,
        triggerType: body.triggerType,
        inputSummary: body.inputSummary || null,
        status: body.status,
        companyId: body.companyId || null,
        userId: body.userId || null,
        siteId: body.siteId || null,
      } as any);
      return res.status(201).json(run);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/internal/agent/runs/:id", requireAgentAuth, requireAgentScope("internal:runs"), async (req: Request, res: Response) => {
    try {
      const body = updateRunSchema.parse(req.body);
      const run = await storage.updateAgentRun(req.params.id, body as any);
      if (!run) return res.status(404).json({ error: "Run not found" });
      return res.json(run);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/internal/agent/runs/:runId/actions", requireAgentAuth, requireAgentScope("internal:runs"), async (req: Request, res: Response) => {
    try {
      const body = createActionSchema.parse(req.body);
      const action = await storage.createAgentAction({
        runId: req.params.runId,
        actionType: body.actionType,
        entityType: body.entityType || null,
        entityId: body.entityId || null,
        inputSummary: body.inputSummary || null,
        outputSummary: body.outputSummary || null,
        status: body.status,
        error: body.error || null,
      } as any);
      return res.status(201).json(action);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  // ── Chat sessions & messages ────────────────────────────────────────────

  const createSessionSchema = z.object({
    companyId: z.string().optional(),
    userId: z.string().optional(),
    agentType: z.enum(["technical_agent", "customer_success_agent", "esg_specialist_agent", "marketing_agent", "master_orchestrator"]).optional(),
    title: z.string().optional(),
    siteId: z.string().optional(),
  });

  app.post("/api/internal/chat/sessions", requireAgentAuth, requireAgentScope("internal:chat"), async (req: Request, res: Response) => {
    try {
      const body = createSessionSchema.parse(req.body);
      const session = await storage.createChatSession({
        companyId: body.companyId || null,
        userId: body.userId || null,
        agentType: body.agentType || null,
        title: body.title || null,
        status: "open",
        siteId: body.siteId || null,
      } as any);
      return res.status(201).json(session);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/internal/chat/sessions", requireAgentAuth, requireAgentScope("internal:chat"), async (req: Request, res: Response) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
      const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
      const siteId = typeof req.query.siteId === "string" ? req.query.siteId : undefined;
      const sessions = await storage.listChatSessions({ userId, companyId });
      const filtered = siteId ? sessions.filter((s: any) => s.siteId === siteId) : sessions;
      return res.json(filtered);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/internal/chat/sessions/:id/messages", requireAgentAuth, requireAgentScope("internal:chat"), async (req: Request, res: Response) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      const messages = await storage.getChatMessages(req.params.id);
      return res.json(messages);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  const sendMessageSchema = z.object({
    content: z.string().min(1),
    metadata: z.any().optional(),
  });

  app.post("/api/internal/chat/sessions/:id/messages", requireAgentAuth, requireAgentScope("internal:chat"), async (req: Request, res: Response) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });

      const body = sendMessageSchema.parse(req.body);

      await storage.createChatMessage({
        sessionId: session.id,
        role: "user",
        content: body.content,
        metadata: body.metadata || null,
      } as any);

      const history = await storage.getChatMessages(session.id);

      const agentServiceUrl = process.env.AGENT_SERVICE_URL;
      let agentContent = "Agent service not configured yet.";
      let agentMetadata: any = null;

      if (agentServiceUrl) {
        try {
          const agentRes = await fetch(`${agentServiceUrl}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session: {
                id: session.id,
                companyId: session.companyId,
                userId: session.userId,
                agentType: session.agentType,
                title: session.title,
              },
              messages: history.map(m => ({ role: m.role, content: m.content, metadata: m.metadata })),
              latestMessage: body.content,
            }),
            signal: AbortSignal.timeout(30000),
          });

          if (agentRes.ok) {
            const data = await agentRes.json() as any;
            agentContent = data.content || data.message || JSON.stringify(data);
            agentMetadata = data.metadata || null;
          } else {
            agentContent = "Agent service returned an error. Please try again.";
          }
        } catch (fetchErr: any) {
          console.warn("[AgentRoutes] Agent service call failed:", fetchErr.message);
          agentContent = "Agent service is temporarily unavailable.";
        }
      }

      const agentMessage = await storage.createChatMessage({
        sessionId: session.id,
        role: "agent",
        content: agentContent,
        metadata: agentMetadata,
      } as any);

      return res.json(agentMessage);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
  });
}
