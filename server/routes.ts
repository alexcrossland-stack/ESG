import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { db } from "./storage";
import {
  insertUserSchema, insertCompanySchema, insertMetricSchema,
  insertMetricValueSchema, insertActionPlanSchema, insertPolicyVersionSchema,
} from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import crypto from "crypto";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import OpenAI from "openai";

const { Pool } = pg;

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "esg_salt_2024").digest("hex");
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!(req.session as any).userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

async function seedDatabase(companyId: string, userId: string) {
  const existingMetrics = await storage.getMetrics(companyId);
  if (existingMetrics.length > 0) return;

  const defaultMetrics = [
    // Environmental
    { name: "Electricity Consumption", description: "Total electricity used across all sites", category: "environmental" as const, unit: "kWh", frequency: "monthly" as const, dataOwner: "Operations Manager" },
    { name: "Gas / Fuel Consumption", description: "Natural gas and fuel oil consumption", category: "environmental" as const, unit: "kWh", frequency: "monthly" as const, dataOwner: "Operations Manager" },
    { name: "Scope 1 Emissions", description: "Direct greenhouse gas emissions from owned sources", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager" },
    { name: "Scope 2 Emissions", description: "Indirect emissions from purchased electricity", category: "environmental" as const, unit: "tCO2e", frequency: "quarterly" as const, dataOwner: "Operations Manager" },
    { name: "Waste Generated", description: "Total waste produced by the business", category: "environmental" as const, unit: "tonnes", frequency: "monthly" as const, dataOwner: "Facilities Manager" },
    { name: "Recycling Rate", description: "Percentage of waste that is recycled", category: "environmental" as const, unit: "%", frequency: "monthly" as const, dataOwner: "Facilities Manager" },
    { name: "Water Consumption", description: "Total water used across all sites", category: "environmental" as const, unit: "m³", frequency: "monthly" as const, dataOwner: "Facilities Manager" },
    // Social
    { name: "Total Employees", description: "Total number of employees (headcount)", category: "social" as const, unit: "people", frequency: "monthly" as const, dataOwner: "HR Manager" },
    { name: "Gender Split (% Female)", description: "Percentage of workforce identifying as female", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager" },
    { name: "Employee Turnover Rate", description: "Annual employee turnover as a percentage", category: "social" as const, unit: "%", frequency: "quarterly" as const, dataOwner: "HR Manager" },
    { name: "Absence Rate", description: "Employee absence as a percentage of total working days", category: "social" as const, unit: "%", frequency: "monthly" as const, dataOwner: "HR Manager" },
    { name: "Training Hours per Employee", description: "Average training hours per employee per year", category: "social" as const, unit: "hours", frequency: "quarterly" as const, dataOwner: "HR Manager" },
    { name: "Lost Time Incidents", description: "Number of workplace incidents resulting in lost time", category: "social" as const, unit: "incidents", frequency: "monthly" as const, dataOwner: "H&S Manager" },
    { name: "Employee Engagement Score", description: "Average employee engagement survey score", category: "social" as const, unit: "score /10", frequency: "annual" as const, dataOwner: "HR Manager" },
    // Governance
    { name: "Board Meetings Held", description: "Number of board or senior management meetings held", category: "governance" as const, unit: "meetings", frequency: "quarterly" as const, dataOwner: "Company Secretary" },
    { name: "Anti-Bribery Policy in Place", description: "Whether a formal anti-bribery policy exists (1=Yes, 0=No)", category: "governance" as const, unit: "1/0", frequency: "annual" as const, dataOwner: "Compliance Manager" },
    { name: "Whistleblowing Policy in Place", description: "Whether a formal whistleblowing policy exists (1=Yes, 0=No)", category: "governance" as const, unit: "1/0", frequency: "annual" as const, dataOwner: "Compliance Manager" },
    { name: "Data Privacy Training Completion", description: "Percentage of staff who completed data privacy training", category: "governance" as const, unit: "%", frequency: "annual" as const, dataOwner: "Data Protection Officer" },
    { name: "Supplier Code of Conduct Adoption", description: "Percentage of suppliers who signed the code of conduct", category: "governance" as const, unit: "%", frequency: "annual" as const, dataOwner: "Procurement Manager" },
  ];

  for (const m of defaultMetrics) {
    await storage.createMetric({ ...m, companyId, enabled: true, isDefault: true });
  }

  // Seed material topics
  const topicsList = [
    { topic: "Energy Use", category: "environmental" as const, selected: true },
    { topic: "Carbon Emissions", category: "environmental" as const, selected: true },
    { topic: "Waste Management", category: "environmental" as const, selected: true },
    { topic: "Water Consumption", category: "environmental" as const, selected: false },
    { topic: "Employee Wellbeing", category: "social" as const, selected: true },
    { topic: "Diversity & Inclusion", category: "social" as const, selected: true },
    { topic: "Training & Development", category: "social" as const, selected: true },
    { topic: "Health & Safety", category: "social" as const, selected: true },
    { topic: "Anti-Bribery & Corruption", category: "governance" as const, selected: true },
    { topic: "Supplier Standards", category: "governance" as const, selected: false },
    { topic: "Data Privacy", category: "governance" as const, selected: true },
    { topic: "Board Oversight", category: "governance" as const, selected: false },
  ];
  await storage.upsertMaterialTopics(companyId, topicsList as any);

  // Seed sample metric values
  const allMetrics = await storage.getMetrics(companyId);
  const periods = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
  const sampleData: Record<string, number[]> = {
    "Electricity Consumption": [45200, 43800, 41500, 39200, 37800, 36100],
    "Gas / Fuel Consumption": [12400, 11800, 9600, 7200, 5800, 5100],
    "Waste Generated": [8.4, 8.1, 7.9, 7.6, 7.3, 7.0],
    "Recycling Rate": [62, 64, 66, 68, 70, 72],
    "Total Employees": [48, 48, 50, 51, 51, 52],
    "Gender Split (% Female)": [42, 42, 43, 43, 44, 44],
    "Absence Rate": [2.1, 2.3, 1.9, 1.8, 2.0, 1.7],
    "Lost Time Incidents": [1, 0, 0, 1, 0, 0],
    "Board Meetings Held": [1, 1, 1, 1, 1, 1],
  };

  for (const metric of allMetrics) {
    const values = sampleData[metric.name];
    if (values) {
      for (let i = 0; i < periods.length; i++) {
        await storage.createMetricValue({
          metricId: metric.id,
          period: periods[i],
          value: values[i].toString(),
          submittedBy: userId,
          notes: "",
          locked: i < 3,
        });
      }
    }
  }

  // Seed action plans
  await storage.createActionPlan({
    companyId,
    title: "Switch to LED lighting across all offices",
    description: "Replace all fluorescent and halogen lights with energy-efficient LED alternatives to reduce electricity consumption by approximately 20%.",
    owner: "Facilities Manager",
    dueDate: new Date("2025-09-30"),
    status: "in_progress",
    notes: "Phase 1 complete - main office done. Phase 2 (warehouse) scheduled for August.",
  });
  await storage.createActionPlan({
    companyId,
    title: "Introduce supplier code of conduct",
    description: "Draft and roll out a supplier code of conduct covering environmental standards, labour rights, and anti-corruption requirements.",
    owner: "Procurement Manager",
    dueDate: new Date("2025-12-31"),
    status: "not_started",
    notes: "",
  });
  await storage.createActionPlan({
    companyId,
    title: "Improve gender diversity in senior roles",
    description: "Target 40% female representation in management positions by end of next year through targeted recruitment and mentoring.",
    owner: "HR Manager",
    dueDate: new Date("2026-03-31"),
    status: "in_progress",
    notes: "Mentoring programme launched. Two senior roles being actively recruited.",
  });
  await storage.createActionPlan({
    companyId,
    title: "Roll out data privacy training for all staff",
    description: "Ensure 100% of employees complete annual GDPR and data privacy training.",
    owner: "Data Protection Officer",
    dueDate: new Date("2025-07-31"),
    status: "complete",
    notes: "Training completed June 2025. Certificates filed.",
  });

  // Seed policy
  const policy = await storage.createPolicy(companyId);
  const policyContent = {
    purpose: "This ESG Policy sets out [Company Name]'s commitment to managing our environmental, social and governance responsibilities. We recognise that sustainable business practices are essential for long-term value creation and maintaining trust with our customers, employees, investors and wider communities.",
    environmental: "We are committed to reducing our environmental footprint through energy efficiency improvements, waste reduction, and responsible resource management. We will measure and report our carbon emissions, set science-based reduction targets, and work towards net zero by 2040.",
    social: "We are committed to providing a safe, inclusive and rewarding workplace for all our people. We will promote diversity and equal opportunities, invest in training and development, and maintain the highest standards of health and safety.",
    governance: "We are committed to high standards of corporate governance, including transparency, accountability and ethical conduct. We operate a zero-tolerance approach to bribery and corruption, and we expect the same from our suppliers and partners.",
    roles: "The Board of Directors has overall responsibility for ESG strategy and performance. Day-to-day responsibility is delegated to the Operations Director, supported by departmental managers who own specific ESG metrics.",
    dataCollection: "ESG data is collected monthly or quarterly by nominated data owners using this ESG management system. Data is reviewed by the Operations Director before being locked and included in external reports.",
    reviewCycle: "This policy will be reviewed annually by the Board of Directors, or sooner if there are material changes to the business or regulatory environment. The next scheduled review is in January 2026.",
  };
  await storage.createPolicyVersion({
    policyId: policy.id,
    versionNumber: 1,
    content: policyContent,
    createdBy: userId,
  });

  // Seed carbon calculation
  const carbonInputs = {
    electricity: "180000",
    gas: "45000",
    diesel: "2500",
    petrol: "1800",
    vehicleMileage: "35000",
    domesticFlights: "5000",
    shortHaulFlights: "15000",
    longHaulFlights: "8000",
    railTravel: "12000",
    hotelNights: "40",
    country: "UK",
  };
  const factors = await storage.getEmissionFactors("UK");
  if (factors.length > 0) {
    const results = calculateEmissions(carbonInputs, factors);
    await storage.createCarbonCalculation({
      companyId,
      reportingPeriod: "2024",
      periodType: "annual",
      inputs: carbonInputs,
      results,
      scope1Total: results.scope1Total.toFixed(4),
      scope2Total: results.scope2Total.toFixed(4),
      scope3Total: results.scope3Total.toFixed(4),
      totalEmissions: results.totalEmissions.toFixed(4),
      employeeCount: 48,
    });
  }

  // Seed audit log
  await storage.createAuditLog({
    companyId,
    userId,
    action: "Company setup completed",
    entityType: "company",
    entityId: companyId,
    details: { note: "Initial onboarding wizard completed" },
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const PgSession = connectPgSimple(session);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  app.use(session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "esg-platform-secret-2024",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: "lax" },
    proxy: true,
  }));

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password, companyName } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: "Missing required fields" });

      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(409).json({ error: "Email already registered" });

      const company = await storage.createCompany({ name: companyName || "My Company" });
      const user = await storage.createUser({
        username,
        email,
        password: hashPassword(password),
        role: "admin",
        companyId: company.id,
      });

      (req.session as any).userId = user.id;
      (req.session as any).companyId = company.id;

      // Seed database with defaults
      await seedDatabase(company.id, user.id);

      res.json({ user: { ...user, password: undefined }, company });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await storage.getUserByEmail(email);
      if (!user || user.password !== hashPassword(password)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      (req.session as any).userId = user.id;
      (req.session as any).companyId = user.companyId;
      const company = user.companyId ? await storage.getCompany(user.companyId) : null;
      res.json({ user: { ...user, password: undefined }, company });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;
    res.json({ user: { ...user, password: undefined }, company });
  });

  // Company routes
  app.get("/api/company", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const company = await storage.getCompany(companyId);
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(company);
  });

  app.put("/api/company", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const company = await storage.updateCompany(companyId, req.body);
      res.json(company);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/company/settings", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const settings = await storage.getCompanySettings(companyId);
    res.json(settings || {});
  });

  app.put("/api/company/settings", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const settings = await storage.upsertCompanySettings(companyId, req.body);
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Policy routes
  app.get("/api/policy", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    let policy = await storage.getPolicy(companyId);
    if (!policy) {
      policy = await storage.createPolicy(companyId);
    }
    const latestVersion = await storage.getLatestPolicyVersion(policy.id);
    const versions = await storage.getPolicyVersions(policy.id);
    res.json({ policy, latestVersion, versions });
  });

  app.put("/api/policy", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      let policy = await storage.getPolicy(companyId);
      if (!policy) policy = await storage.createPolicy(companyId);

      const { content, status, reviewDate, action } = req.body;

      if (content) {
        const versions = await storage.getPolicyVersions(policy.id);
        const nextVersion = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
        await storage.createPolicyVersion({
          policyId: policy.id,
          versionNumber: nextVersion,
          content,
          createdBy: userId,
        });
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (reviewDate) updateData.reviewDate = new Date(reviewDate);
      if (status === "published") updateData.publishedAt = new Date();

      const updated = await storage.updatePolicy(policy.id, updateData);

      await storage.createAuditLog({
        companyId,
        userId,
        action: action || "Policy updated",
        entityType: "policy",
        entityId: policy.id,
        details: { status },
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Material Topics routes
  app.get("/api/topics", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const topics = await storage.getMaterialTopics(companyId);
    res.json(topics);
  });

  app.put("/api/topics/:id", requireAuth, async (req, res) => {
    try {
      const { selected } = req.body;
      await storage.updateMaterialTopic(req.params.id, selected);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Metrics routes
  app.get("/api/metrics", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const metricsList = await storage.getMetrics(companyId);
    const targets = await Promise.all(metricsList.map(m => storage.getMetricTarget(m.id)));
    const withTargets = metricsList.map((m, i) => ({ ...m, target: targets[i] || null }));
    res.json(withTargets);
  });

  app.post("/api/metrics", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const parsed = insertMetricSchema.parse({ ...req.body, companyId });
      const metric = await storage.createMetric(parsed);
      res.json(metric);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/metrics/:id", requireAuth, async (req, res) => {
    try {
      const metric = await storage.updateMetric(req.params.id, req.body);
      res.json(metric);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/metrics/:id/target", requireAuth, async (req, res) => {
    try {
      const { targetValue, targetYear } = req.body;
      const target = await storage.upsertMetricTarget(req.params.id, targetValue, targetYear);
      res.json(target);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/metrics/:id/values", requireAuth, async (req, res) => {
    const values = await storage.getMetricValues(req.params.id);
    res.json(values);
  });

  // Metric Values (data entry)
  app.get("/api/data-entry/:period", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const values = await storage.getMetricValuesByPeriod(companyId, req.params.period);
    const allMetrics = await storage.getMetrics(companyId);
    res.json({ values, metrics: allMetrics.filter(m => m.enabled) });
  });

  app.post("/api/data-entry", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const companyId = (req.session as any).companyId;
      const { metricId, period, value, notes } = req.body;

      // Check if value already exists for this metric/period
      const existing = await storage.getMetricValues(metricId);
      const existingForPeriod = existing.find(v => v.period === period);

      let result;
      if (existingForPeriod) {
        if (existingForPeriod.locked) {
          return res.status(400).json({ error: "This period is locked and cannot be edited" });
        }
        result = await storage.updateMetricValue(existingForPeriod.id, { value, notes, submittedBy: userId });
      } else {
        result = await storage.createMetricValue({ metricId, period, value, notes, submittedBy: userId, locked: false });
      }

      await storage.createAuditLog({
        companyId,
        userId,
        action: "Metric value submitted",
        entityType: "metric_value",
        entityId: result.id,
        details: { period, value },
      });

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/data-entry/:period/lock", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      await storage.lockPeriod(companyId, req.params.period);
      await storage.createAuditLog({
        companyId, userId,
        action: `Period ${req.params.period} locked`,
        entityType: "period",
        entityId: req.params.period,
        details: {},
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Action Plans routes
  app.get("/api/actions", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const actions = await storage.getActionPlans(companyId);
    res.json(actions);
  });

  app.post("/api/actions", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const plan = await storage.createActionPlan({ ...req.body, companyId });
      await storage.createAuditLog({
        companyId, userId,
        action: "Action created",
        entityType: "action",
        entityId: plan.id,
        details: { title: plan.title },
      });
      res.json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/actions/:id", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const plan = await storage.updateActionPlan(req.params.id, req.body);
      await storage.createAuditLog({
        companyId, userId,
        action: "Action updated",
        entityType: "action",
        entityId: req.params.id,
        details: { status: req.body.status },
      });
      res.json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/actions/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteActionPlan(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Dashboard
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const data = await storage.getDashboardData(companyId);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reports
  app.get("/api/reports", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const reports = await storage.getReportRuns(companyId);
    res.json(reports);
  });

  app.post("/api/reports/generate", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { period, reportType, includePolicy, includeTopics, includeMetrics, includeActions } = req.body;

      const report = await storage.createReportRun({
        companyId,
        period,
        reportType: reportType || "pdf",
        generatedBy: userId,
        includePolicy,
        includeTopics,
        includeMetrics,
        includeActions,
      });

      // Build report data
      const company = await storage.getCompany(companyId);
      const policy = await storage.getPolicy(companyId);
      const latestVersion = policy ? await storage.getLatestPolicyVersion(policy.id) : null;
      const topics = await storage.getMaterialTopics(companyId);
      const allMetrics = await storage.getMetrics(companyId);
      const values = period ? await storage.getMetricValuesByPeriod(companyId, period) : [];
      const actions = await storage.getActionPlans(companyId);

      await storage.createAuditLog({
        companyId, userId,
        action: "Report generated",
        entityType: "report",
        entityId: report.id,
        details: { period, reportType },
      });

      res.json({
        report,
        data: {
          company,
          policy: latestVersion?.content,
          selectedTopics: topics.filter(t => t.selected),
          metrics: allMetrics.filter(m => m.enabled),
          values,
          actions,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Audit logs
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const logs = await storage.getAuditLogs(companyId);
    res.json(logs);
  });

  // ===== AI POLICY GENERATOR =====
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  app.post("/api/policy-generator/generate", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { inputs } = req.body;

      const saved = await storage.createPolicyGenerationInput({ companyId, inputs });

      const prompt = buildPolicyPrompt(inputs);
      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: "You are an ESG policy expert specialising in SME businesses. Write professional but accessible ESG policies in plain English. Do not give legal advice. Always include a note that the policy should be reviewed by management before formal adoption." },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
      });

      const generatedText = completion.choices[0]?.message?.content || "{}";
      let generatedContent;
      try {
        generatedContent = JSON.parse(generatedText);
      } catch {
        generatedContent = { rawText: generatedText };
      }

      await storage.updatePolicyGenerationInput(saved.id, { generatedContent });

      await storage.createAuditLog({
        companyId, userId,
        action: "ESG policy generated via AI",
        entityType: "policy_generation",
        entityId: saved.id,
        details: { sectorsUsed: inputs.sector },
      });

      res.json({ id: saved.id, generatedContent });
    } catch (e: any) {
      console.error("Policy generation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/policy-generator/history", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const history = await storage.getPolicyGenerationInputs(companyId);
    res.json(history);
  });

  app.post("/api/policy-generator/save-to-policy", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { content } = req.body;

      let policy = await storage.getPolicy(companyId);
      if (!policy) policy = await storage.createPolicy(companyId);

      const versions = await storage.getPolicyVersions(policy.id);
      const nextVersion = versions.length > 0 ? versions[0].versionNumber + 1 : 1;
      await storage.createPolicyVersion({
        policyId: policy.id,
        versionNumber: nextVersion,
        content,
        createdBy: userId,
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "AI-generated policy saved as new version",
        entityType: "policy",
        entityId: policy.id,
        details: { versionNumber: nextVersion },
      });

      res.json({ ok: true, versionNumber: nextVersion });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== CARBON CALCULATOR =====
  app.get("/api/carbon/factors", requireAuth, async (req, res) => {
    const country = (req.query.country as string) || "UK";
    const factors = await storage.getEmissionFactors(country);
    res.json(factors);
  });

  app.get("/api/carbon/calculations", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const calcs = await storage.getCarbonCalculations(companyId);
    res.json(calcs);
  });

  app.post("/api/carbon/calculate", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { inputs, reportingPeriod, periodType, employeeCount } = req.body;

      const country = inputs.country || "UK";
      const factors = await storage.getEmissionFactors(country);

      const results = calculateEmissions(inputs, factors);

      const calc = await storage.createCarbonCalculation({
        companyId,
        reportingPeriod,
        periodType: periodType || "annual",
        inputs,
        results,
        scope1Total: results.scope1Total.toFixed(4),
        scope2Total: results.scope2Total.toFixed(4),
        scope3Total: results.scope3Total.toFixed(4),
        totalEmissions: results.totalEmissions.toFixed(4),
        employeeCount: employeeCount || null,
      });

      await storage.createAuditLog({
        companyId, userId,
        action: "Carbon calculation completed",
        entityType: "carbon_calculation",
        entityId: calc.id,
        details: { reportingPeriod, totalEmissions: results.totalEmissions },
      });

      res.json(calc);
    } catch (e: any) {
      console.error("Carbon calculation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/carbon/calculations/:id", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const calc = await storage.getCarbonCalculation(req.params.id);
      if (!calc || calc.companyId !== companyId) return res.status(404).json({ error: "Not found" });
      await storage.deleteCarbonCalculation(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== QUESTIONNAIRE AUTOFILL =====
  app.get("/api/questionnaires", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const qs = await storage.getQuestionnaires(companyId);
    res.json(qs);
  });

  app.get("/api/questionnaires/:id", requireAuth, async (req, res) => {
    const companyId = (req.session as any).companyId;
    const q = await storage.getQuestionnaire(req.params.id);
    if (!q || q.companyId !== companyId) return res.status(404).json({ error: "Questionnaire not found" });
    const questions = await storage.getQuestionnaireQuestions(q.id);
    res.json({ ...q, questions });
  });

  app.post("/api/questionnaires", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const { title, source, questions } = req.body;

      const q = await storage.createQuestionnaire({ companyId, title, source, status: "draft" });

      if (questions && Array.isArray(questions)) {
        for (let i = 0; i < questions.length; i++) {
          await storage.createQuestionnaireQuestion({
            questionnaireId: q.id,
            questionText: questions[i],
            orderIndex: i,
          });
        }
      }

      await storage.createAuditLog({
        companyId, userId,
        action: "Questionnaire created",
        entityType: "questionnaire",
        entityId: q.id,
        details: { title, questionCount: questions?.length || 0 },
      });

      const savedQuestions = await storage.getQuestionnaireQuestions(q.id);
      res.json({ ...q, questions: savedQuestions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/questionnaires/:id/autofill", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const userId = (req.session as any).userId;
      const questionnaireId = req.params.id;

      const qRecord = await storage.getQuestionnaire(questionnaireId);
      if (!qRecord || qRecord.companyId !== companyId) return res.status(404).json({ error: "Not found" });

      const questions = await storage.getQuestionnaireQuestions(questionnaireId);
      if (!questions.length) return res.status(400).json({ error: "No questions found" });

      // Gather company context
      const company = await storage.getCompany(companyId);
      const policy = await storage.getPolicy(companyId);
      const latestVersion = policy ? await storage.getLatestPolicyVersion(policy.id) : null;
      const topics = await storage.getMaterialTopics(companyId);
      const allMetrics = await storage.getMetrics(companyId);
      const actions = await storage.getActionPlans(companyId);
      const carbonCalcs = await storage.getCarbonCalculations(companyId);

      // Get recent metric values
      const metricData: Record<string, any> = {};
      for (const m of allMetrics.filter(m => m.enabled)) {
        const vals = await storage.getMetricValues(m.id);
        if (vals.length > 0) {
          metricData[m.name] = { latestValue: vals[0].value, unit: m.unit, period: vals[0].period };
        }
      }

      const context = buildCompanyContext(company, latestVersion?.content, topics, metricData, actions, carbonCalcs);

      // Process questions - use rules-based matching first, then AI for gaps
      const updatedQuestions = [];
      for (const q of questions) {
        const ruleResult = matchQuestionByRules(q.questionText, context);
        let suggestedAnswer = ruleResult.answer;
        let confidence = ruleResult.confidence;
        let sourceRef = ruleResult.source;
        let category = categorizeQuestion(q.questionText);

        if (confidence === "low" || !suggestedAnswer) {
          try {
            const aiResult = await generateAIAnswer(openai, q.questionText, context);
            suggestedAnswer = aiResult.answer;
            confidence = aiResult.confidence || "medium";
            sourceRef = aiResult.source || sourceRef;
          } catch {
            suggestedAnswer = "No formal data is currently recorded in the system for this area. A draft response can be prepared for management review.";
            confidence = "low";
            sourceRef = "No source found";
          }
        }

        const updated = await storage.updateQuestionnaireQuestion(q.id, {
          category,
          suggestedAnswer,
          confidence: confidence as any,
          sourceRef,
        });
        updatedQuestions.push(updated);
      }

      await storage.updateQuestionnaire(questionnaireId, { status: "in_progress" });

      await storage.createAuditLog({
        companyId, userId,
        action: "Questionnaire autofill completed",
        entityType: "questionnaire",
        entityId: questionnaireId,
        details: { questionCount: questions.length },
      });

      res.json({ questions: updatedQuestions });
    } catch (e: any) {
      console.error("Autofill error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/questionnaires/:qId/questions/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateQuestionnaireQuestion(req.params.id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/questionnaires/:id", requireAuth, async (req, res) => {
    try {
      const companyId = (req.session as any).companyId;
      const q = await storage.getQuestionnaire(req.params.id);
      if (!q || q.companyId !== companyId) return res.status(404).json({ error: "Not found" });
      await storage.deleteQuestionnaire(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}

// ===== HELPER FUNCTIONS =====

function buildPolicyPrompt(inputs: any): string {
  return `Generate a professional ESG policy for the following SME business. Return as a JSON object with these keys: titlePage, purposeAndScope, commitmentStatement, environmentalCommitments, socialCommitments, governanceCommitments, responsibilities, implementationAndMonitoring, reviewCycle, approvalSection.

Company Profile:
- Company Name: ${inputs.companyName || "[Company Name]"}
- Sector: ${inputs.sector || "General"}
- Country: ${inputs.country || "United Kingdom"}
- Number of Employees: ${inputs.employeeCount || "Not specified"}
- Number of Sites: ${inputs.numberOfSites || 1}
- Business Type: ${inputs.businessType || "Service business"}
- Has Vehicles: ${inputs.hasVehicles ? "Yes" : "No"}
- Has International Suppliers: ${inputs.hasInternationalSuppliers ? "Yes" : "No"}

Environmental:
- Tracks Electricity: ${inputs.trackElectricity ? "Yes" : "No"}
- Tracks Fuel/Gas: ${inputs.trackFuel ? "Yes" : "No"}
- Tracks Water: ${inputs.trackWater ? "Yes" : "No"}
- Tracks Waste/Recycling: ${inputs.trackWaste ? "Yes" : "No"}
- Carbon Reduction Commitment: ${inputs.carbonCommitment ? "Yes" : "No"}
- Environmental Certifications: ${inputs.envCertifications || "None"}

Social:
- Has Employee Handbook: ${inputs.hasHandbook ? "Yes" : "No"}
- Tracks Diversity Data: ${inputs.trackDiversity ? "Yes" : "No"}
- Provides Employee Training: ${inputs.providesTraining ? "Yes" : "No"}
- Tracks H&S Incidents: ${inputs.trackHealthSafety ? "Yes" : "No"}
- Wellbeing Initiatives: ${inputs.hasWellbeing ? "Yes" : "No"}
- Pays Living Wage: ${inputs.paysLivingWage ? "Yes" : "No"}

Governance:
- Anti-Bribery Rules: ${inputs.hasAntiBribery ? "Yes" : "No"}
- Whistleblowing Process: ${inputs.hasWhistleblowing ? "Yes" : "No"}
- Data Privacy Policy: ${inputs.hasDataPrivacy ? "Yes" : "No"}
- ESG Responsible Person: ${inputs.esgResponsible || "Not specified"}
- Review Frequency: ${inputs.reviewFrequency || "Annual"}

Write in plain English. Make it sound professional but not overly legal. Where data is missing use sensible defaults. Include "[Insert review month]" only where truly necessary. Add a footer note that the policy should be reviewed by management before formal adoption.`;
}

function calculateEmissions(inputs: any, factors: any[]): any {
  const findFactor = (category: string) => {
    const f = factors.find((f: any) => f.category === category);
    return f ? parseFloat(f.factor) : 0;
  };

  const electricity = (parseFloat(inputs.electricity) || 0) * findFactor("electricity");
  const gas = (parseFloat(inputs.gas) || 0) * findFactor("gas");
  const diesel = (parseFloat(inputs.diesel) || 0) * findFactor("fuel");
  const petrol = (parseFloat(inputs.petrol) || 0) * findFactor("fuel");
  const vehicles = (parseFloat(inputs.vehicleMileage) || 0) * findFactor("vehicles");

  const scope1Total = gas + diesel + petrol + vehicles;
  const scope2Total = electricity;

  const domesticFlights = (parseFloat(inputs.domesticFlights) || 0) * (factors.find((f: any) => f.name === "Domestic Flight")?.factor || 0.24587);
  const shortHaulFlights = (parseFloat(inputs.shortHaulFlights) || 0) * (factors.find((f: any) => f.name === "Short-haul Flight")?.factor || 0.15353);
  const longHaulFlights = (parseFloat(inputs.longHaulFlights) || 0) * (factors.find((f: any) => f.name === "Long-haul Flight")?.factor || 0.19309);
  const rail = (parseFloat(inputs.railTravel) || 0) * findFactor("travel");
  const hotelNights = (parseFloat(inputs.hotelNights) || 0) * (factors.find((f: any) => f.name === "Hotel Nights")?.factor || 10.24);

  const scope3Total = domesticFlights + shortHaulFlights + longHaulFlights + rail + hotelNights;
  const totalEmissions = scope1Total + scope2Total + scope3Total;

  return {
    scope1Total: Math.round(scope1Total * 10000) / 10000,
    scope2Total: Math.round(scope2Total * 10000) / 10000,
    scope3Total: Math.round(scope3Total * 10000) / 10000,
    totalEmissions: Math.round(totalEmissions * 10000) / 10000,
    breakdown: {
      electricity: Math.round(electricity * 100) / 100,
      gas: Math.round(gas * 100) / 100,
      diesel: Math.round(diesel * 100) / 100,
      petrol: Math.round(petrol * 100) / 100,
      vehicles: Math.round(vehicles * 100) / 100,
      domesticFlights: Math.round(domesticFlights * 100) / 100,
      shortHaulFlights: Math.round(shortHaulFlights * 100) / 100,
      longHaulFlights: Math.round(longHaulFlights * 100) / 100,
      rail: Math.round(rail * 100) / 100,
      hotelNights: Math.round(hotelNights * 100) / 100,
    },
    unit: "kgCO2e",
  };
}

function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("carbon") || q.includes("emission") || q.includes("ghg") || q.includes("co2")) return "Carbon";
  if (q.includes("energy") || q.includes("electricity") || q.includes("fuel")) return "Environmental";
  if (q.includes("waste") || q.includes("recycl")) return "Environmental";
  if (q.includes("water")) return "Environmental";
  if (q.includes("environmental") || q.includes("pollution")) return "Environmental";
  if (q.includes("policy") || q.includes("esg policy") || q.includes("sustainability policy")) return "Policy";
  if (q.includes("training") || q.includes("development")) return "Training";
  if (q.includes("diversity") || q.includes("inclusion") || q.includes("equal")) return "Social";
  if (q.includes("health") || q.includes("safety") || q.includes("wellbeing")) return "Social";
  if (q.includes("employee") || q.includes("staff") || q.includes("workforce")) return "Social";
  if (q.includes("supplier") || q.includes("supply chain") || q.includes("procurement")) return "Supply Chain";
  if (q.includes("brib") || q.includes("corruption") || q.includes("whistleblow")) return "Governance";
  if (q.includes("privacy") || q.includes("data protection") || q.includes("gdpr")) return "Data Privacy";
  if (q.includes("governance") || q.includes("board") || q.includes("oversight")) return "Governance";
  return "General";
}

function buildCompanyContext(company: any, policyContent: any, topics: any[], metricData: Record<string, any>, actions: any[], carbonCalcs: any[]): string {
  let ctx = `Company: ${company?.name || "Unknown"}\nSector: ${company?.industry || "General"}\nCountry: ${company?.country || "UK"}\nEmployees: ${company?.employeeCount || "Unknown"}\n`;

  if (policyContent) {
    ctx += `\nESG Policy Content:\n`;
    if (typeof policyContent === "object") {
      for (const [key, val] of Object.entries(policyContent)) {
        ctx += `- ${key}: ${val}\n`;
      }
    }
  }

  const selectedTopics = topics.filter(t => t.selected);
  if (selectedTopics.length > 0) {
    ctx += `\nPriority ESG Topics: ${selectedTopics.map(t => t.topic).join(", ")}\n`;
  }

  if (Object.keys(metricData).length > 0) {
    ctx += `\nCurrent Metrics:\n`;
    for (const [name, data] of Object.entries(metricData)) {
      ctx += `- ${name}: ${data.latestValue} ${data.unit} (${data.period})\n`;
    }
  }

  if (actions.length > 0) {
    ctx += `\nAction Plans:\n`;
    for (const a of actions) {
      ctx += `- ${a.title} (Status: ${a.status})\n`;
    }
  }

  if (carbonCalcs.length > 0) {
    const latest = carbonCalcs[0];
    ctx += `\nLatest Carbon Calculation (${latest.reportingPeriod}): Total ${latest.totalEmissions} kgCO2e, Scope 1: ${latest.scope1Total}, Scope 2: ${latest.scope2Total}\n`;
  }

  return ctx;
}

function matchQuestionByRules(question: string, context: string): { answer: string; confidence: string; source: string } {
  const q = question.toLowerCase();

  if (q.includes("esg policy") || (q.includes("do you have") && q.includes("policy"))) {
    if (context.includes("ESG Policy Content")) {
      return { answer: "Yes, we have a formal ESG policy in place that covers environmental, social and governance commitments. The policy is reviewed regularly and available upon request.", confidence: "high", source: "ESG Policy" };
    }
    return { answer: "We are currently developing a formal ESG policy.", confidence: "medium", source: "System data" };
  }

  if (q.includes("carbon") || q.includes("emission") || q.includes("ghg")) {
    if (context.includes("Carbon Calculation")) {
      const match = context.match(/Total ([\d.]+) kgCO2e/);
      const total = match ? match[1] : "measured";
      return { answer: `Yes, we measure our carbon emissions. Our most recent calculation shows total emissions of ${total} kgCO2e. We track Scope 1 and Scope 2 emissions and are working to reduce them year on year.`, confidence: "high", source: "Carbon Calculator" };
    }
    if (context.includes("Scope 1") || context.includes("Scope 2")) {
      return { answer: "Yes, we track our carbon emissions through our ESG management system.", confidence: "medium", source: "Metric data" };
    }
  }

  if (q.includes("diversity") || q.includes("inclusion")) {
    if (context.includes("Gender Split") || context.includes("Diversity")) {
      const match = context.match(/Gender Split.*?: ([\d.]+)/);
      const pct = match ? match[1] : null;
      return { answer: `We are committed to diversity and inclusion. ${pct ? `Our current gender split shows ${pct}% female representation. ` : ""}We track diversity data and have active improvement plans in place.`, confidence: "high", source: "Metric data & Policy" };
    }
  }

  if (q.includes("training")) {
    if (context.includes("Training")) {
      return { answer: "Yes, we provide regular employee training including ESG awareness, health and safety, and role-specific development. Training hours are tracked through our ESG management system.", confidence: "high", source: "Metric data & Policy" };
    }
  }

  if (q.includes("waste") || q.includes("recycl")) {
    if (context.includes("Waste") || context.includes("Recycling")) {
      const wasteMatch = context.match(/Waste Generated.*?: ([\d.]+)/);
      const recycleMatch = context.match(/Recycling Rate.*?: ([\d.]+)/);
      let answer = "We track waste generation and recycling rates.";
      if (wasteMatch) answer += ` Current waste generated: ${wasteMatch[1]} tonnes.`;
      if (recycleMatch) answer += ` Current recycling rate: ${recycleMatch[1]}%.`;
      return { answer, confidence: "high", source: "Metric data" };
    }
  }

  if (q.includes("anti-bribery") || q.includes("corruption")) {
    if (context.includes("Anti-Bribery") || context.includes("governance")) {
      return { answer: "Yes, we have a formal anti-bribery and anti-corruption policy in place. All employees are made aware of their obligations and we operate a zero-tolerance approach.", confidence: "high", source: "ESG Policy" };
    }
  }

  if (q.includes("whistleblow")) {
    if (context.includes("Whistleblowing") || context.includes("governance")) {
      return { answer: "Yes, we have a whistleblowing policy and procedure in place that allows employees and stakeholders to raise concerns confidentially.", confidence: "high", source: "ESG Policy" };
    }
  }

  if (q.includes("privacy") || q.includes("data protection") || q.includes("gdpr")) {
    if (context.includes("Data Privacy")) {
      return { answer: "Yes, we have a data privacy policy in place and provide regular data protection training to all staff. We comply with applicable data protection regulations.", confidence: "high", source: "ESG Policy & Training data" };
    }
  }

  if (q.includes("supplier") || q.includes("supply chain")) {
    if (context.includes("Supplier")) {
      return { answer: "We are developing supplier standards and a code of conduct to ensure our supply chain meets our ESG requirements.", confidence: "medium", source: "Action Plans" };
    }
  }

  if (q.includes("health") && q.includes("safety")) {
    if (context.includes("Lost Time") || context.includes("Health & Safety")) {
      const match = context.match(/Lost Time Incidents.*?: ([\d.]+)/);
      let answer = "Yes, we track health and safety performance including incident rates.";
      if (match) answer += ` Our latest lost time incident count is ${match[1]}.`;
      return { answer, confidence: "high", source: "Metric data" };
    }
  }

  return { answer: "", confidence: "low", source: "No source found" };
}

async function generateAIAnswer(openai: OpenAI, question: string, context: string): Promise<{ answer: string; confidence: string; source: string }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content: `You are an ESG questionnaire assistant for SME businesses. Generate concise, professional answers based ONLY on the company data provided. Never invent facts. If no data is available, clearly state that. Return JSON with keys: answer, confidence (high/medium/low), source (the data source used).`,
      },
      {
        role: "user",
        content: `Company context:\n${context}\n\nQuestion: ${question}\n\nGenerate a suggested answer as JSON.`,
      },
    ],
    max_completion_tokens: 512,
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { answer: text, confidence: "low", source: "AI generated" };
  }
}
