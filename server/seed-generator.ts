import { db } from "./storage";
import { sql } from "drizzle-orm";
import {
  users, companies, companySettings, metrics, metricValues,
  rawDataInputs, evidenceFiles, actionPlans, reportRuns,
  notifications, auditLogs, esgPolicies, policyVersions,
  questionnaires, questionnaireQuestions, reportingPeriods,
  backgroundJobs, platformHealthEvents, userActivity,
  procurementAnswers, carbonCalculations, generatedPolicies,
  materialTopics,
} from "@shared/schema";
import bcrypt from "bcryptjs";

const VOLUME_PRESETS = {
  small: { companies: 5, usersPerCompany: 3, periods: 3 },
  medium: { companies: 20, usersPerCompany: 10, periods: 6 },
  large: { companies: 50, usersPerCompany: 15, periods: 12 },
};

class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T { return arr[this.int(0, arr.length - 1)]; }
  chance(p: number): boolean { return this.next() < p; }
  uuid(): string {
    const hex = () => this.int(0, 15).toString(16);
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = this.int(0, 15);
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  date(start: Date, end: Date): Date {
    return new Date(start.getTime() + this.next() * (end.getTime() - start.getTime()));
  }
}

const INDUSTRIES = ["Technology", "Manufacturing", "Financial Services", "Healthcare", "Retail", "Construction", "Energy", "Transportation", "Agriculture", "Professional Services"];
const COUNTRIES = ["United Kingdom", "United States", "Germany", "France", "Australia", "Canada", "Netherlands", "Ireland", "Sweden", "Japan"];
const ROLES: Array<"admin" | "contributor" | "approver" | "viewer"> = ["admin", "contributor", "approver", "viewer"];
const WORKFLOW_STATUSES: Array<"draft" | "submitted" | "approved" | "rejected"> = ["draft", "submitted", "approved", "rejected"];
const ACTION_STATUSES: Array<"not_started" | "in_progress" | "complete" | "overdue"> = ["not_started", "in_progress", "complete", "overdue"];
const EVIDENCE_STATUSES: Array<"uploaded" | "reviewed" | "approved" | "expired"> = ["uploaded", "reviewed", "approved", "expired"];
const METRIC_CATEGORIES: Array<"environmental" | "social" | "governance"> = ["environmental", "social", "governance"];

const DEFAULT_METRICS = [
  { name: "Electricity Consumption", category: "environmental" as const, unit: "kWh", metricType: "calculated", calculationType: "from_raw_data" },
  { name: "Gas Consumption", category: "environmental" as const, unit: "kWh", metricType: "calculated", calculationType: "from_raw_data" },
  { name: "Total Carbon Emissions", category: "environmental" as const, unit: "tCO2e", metricType: "calculated", calculationType: "sum" },
  { name: "Waste Generated", category: "environmental" as const, unit: "tonnes", metricType: "manual", calculationType: null },
  { name: "Water Usage", category: "environmental" as const, unit: "m3", metricType: "manual", calculationType: null },
  { name: "Waste Recycling Rate", category: "environmental" as const, unit: "%", metricType: "calculated", calculationType: "percentage" },
  { name: "Energy Intensity", category: "environmental" as const, unit: "kWh/employee", metricType: "calculated", calculationType: "ratio" },
  { name: "Carbon Intensity", category: "environmental" as const, unit: "tCO2e/employee", metricType: "calculated", calculationType: "ratio" },
  { name: "Total Headcount", category: "social" as const, unit: "employees", metricType: "manual", calculationType: null },
  { name: "Gender Diversity", category: "social" as const, unit: "%", metricType: "manual", calculationType: null },
  { name: "Employee Turnover Rate", category: "social" as const, unit: "%", metricType: "calculated", calculationType: "percentage" },
  { name: "Training Hours Per Employee", category: "social" as const, unit: "hours", metricType: "manual", calculationType: null },
  { name: "Absence Rate", category: "social" as const, unit: "%", metricType: "manual", calculationType: null },
  { name: "Living Wage Compliance", category: "social" as const, unit: "%", metricType: "manual", calculationType: null },
  { name: "Health & Safety Incidents", category: "social" as const, unit: "incidents", metricType: "manual", calculationType: null },
  { name: "Board Meeting Attendance", category: "governance" as const, unit: "%", metricType: "manual", calculationType: null },
  { name: "Anti-Bribery Training", category: "governance" as const, unit: "%", metricType: "manual", calculationType: null },
  { name: "Data Breach Incidents", category: "governance" as const, unit: "incidents", metricType: "manual", calculationType: null },
  { name: "Supplier ESG Assessment Rate", category: "governance" as const, unit: "%", metricType: "manual", calculationType: null },
  { name: "Gender Diversity in Management", category: "social" as const, unit: "%", metricType: "manual", calculationType: null },
];

const RAW_INPUT_DEFS = [
  { name: "electricity_kwh", category: "energy", unit: "kWh" },
  { name: "gas_kwh", category: "energy", unit: "kWh" },
  { name: "vehicle_miles", category: "transport", unit: "miles" },
  { name: "water_m3", category: "water", unit: "m3" },
  { name: "waste_tonnes", category: "waste", unit: "tonnes" },
  { name: "waste_recycled_tonnes", category: "waste", unit: "tonnes" },
  { name: "total_headcount", category: "social", unit: "employees" },
  { name: "female_headcount", category: "social", unit: "employees" },
  { name: "new_starters", category: "social", unit: "employees" },
  { name: "leavers", category: "social", unit: "employees" },
  { name: "training_hours", category: "social", unit: "hours" },
  { name: "absence_days", category: "social", unit: "days" },
];

const NOTIFICATION_TYPES = ["reminder", "alert", "info", "overdue", "approval_required"];
const PAGES = ["/dashboard", "/data-entry", "/reports", "/policies", "/questionnaire", "/evidence", "/control-centre", "/compliance", "/benchmarks", "/esg-profile"];
const ACTIVITY_ACTIONS = ["page_view", "data_entry_save", "report_generated", "import_completed", "questionnaire_autofill", "carbon_calculation", "login"];

async function batchInsert(table: any, rows: any[], batchSize = 200) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    if (batch.length > 0) {
      await db.insert(table).values(batch);
      inserted += batch.length;
    }
  }
  return inserted;
}

export async function generateSeedData(preset: "small" | "medium" | "large" = "medium", seed = 42) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed data generator cannot run in production");
  }

  const config = VOLUME_PRESETS[preset];
  const rng = new SeededRandom(seed);
  const counts: Record<string, number> = {};
  const hashedPassword = await bcrypt.hash("testpass123", 10);
  const now = new Date();

  console.log(`\n=== Seed Data Generator ===`);
  console.log(`Preset: ${preset} | Seed: ${seed}`);
  console.log(`Companies: ${config.companies} | Users/company: ${config.usersPerCompany} | Periods: ${config.periods}\n`);

  const companyRows: any[] = [];
  const userRows: any[] = [];
  const settingsRows: any[] = [];
  const periodRows: any[] = [];
  const metricRows: any[] = [];
  const metricValueRows: any[] = [];
  const rawDataRows: any[] = [];
  const evidenceRows: any[] = [];
  const actionRows: any[] = [];
  const reportRows: any[] = [];
  const notifRows: any[] = [];
  const auditRows: any[] = [];
  const policyRows: any[] = [];
  const policyVersionRows: any[] = [];
  const questionnaireRows: any[] = [];
  const questionRows: any[] = [];
  const bgJobRows: any[] = [];
  const healthRows: any[] = [];
  const activityRows: any[] = [];
  const procurementRows: any[] = [];
  const materialRows: any[] = [];
  const genPolicyRows: any[] = [];

  for (let c = 0; c < config.companies; c++) {
    const companyId = rng.uuid();
    const industry = rng.pick(INDUSTRIES);
    const country = rng.pick(COUNTRIES);
    const empCount = rng.int(10, 500);

    companyRows.push({
      id: companyId,
      name: `${industry} Solutions ${c + 1}`,
      industry,
      country,
      employeeCount: empCount,
      revenueBand: rng.pick(["<1M", "1M-10M", "10M-50M", "50M+"]),
      locations: rng.int(1, 5),
      businessType: rng.pick(["SME", "Startup", "Mid-Market"]),
      hasVehicles: rng.chance(0.6),
      operationalProfile: rng.pick(["office", "manufacturing", "mixed", "retail"]),
      reportingYearStart: rng.pick(["January", "April", "July"]),
      onboardingComplete: true,
      onboardingPath: "guided",
      onboardingStep: 8,
      demoMode: false,
      isSuperAdmin: c === 0,
      esgMaturity: rng.pick(["just_starting", "some_activity", "formal_programme"]),
      selectedModules: ["carbon_calculator", "policy_generator", "questionnaire"],
      selectedMetrics: DEFAULT_METRICS.map(m => m.name),
    });

    settingsRows.push({
      id: rng.uuid(),
      companyId,
      trackEnergy: true,
      trackWaste: rng.chance(0.8),
      trackWater: rng.chance(0.7),
      trackDiversity: true,
      trackTraining: rng.chance(0.6),
      trackHealthSafety: rng.chance(0.7),
      trackGovernance: true,
      requireApprovalMetrics: rng.chance(0.5),
      requireApprovalReports: rng.chance(0.5),
      requireApprovalPolicies: rng.chance(0.4),
      autoLockApproved: rng.chance(0.3),
      reminderEnabled: true,
      reminderFrequency: rng.pick(["weekly", "fortnightly", "monthly"]),
    });

    const companyUserIds: string[] = [];
    const numUsers = rng.int(Math.max(3, config.usersPerCompany - 5), config.usersPerCompany + 5);
    for (let u = 0; u < numUsers; u++) {
      const userId = rng.uuid();
      companyUserIds.push(userId);
      const role = u === 0 ? "admin" : rng.pick(ROLES);
      userRows.push({
        id: userId,
        username: `user_c${c}_u${u}_${seed}`,
        email: `user_c${c}_u${u}_${seed}@test.local`,
        password: hashedPassword,
        role,
        companyId,
      });
    }

    const companyPeriodIds: string[] = [];
    for (let p = 0; p < config.periods; p++) {
      const periodId = rng.uuid();
      companyPeriodIds.push(periodId);
      const startDate = new Date(now.getFullYear() - Math.floor(p / 12), (now.getMonth() - (p % 12) + 12) % 12, 1);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      periodRows.push({
        id: periodId,
        companyId,
        name: `${startDate.toLocaleString("en", { month: "short" })} ${startDate.getFullYear()}`,
        periodType: "monthly" as const,
        startDate,
        endDate,
        status: p < 2 ? "open" as const : "closed" as const,
        previousPeriodId: p > 0 ? companyPeriodIds[p - 1] : null,
      });
    }

    const companyMetricIds: string[] = [];
    for (const def of DEFAULT_METRICS) {
      const metricId = rng.uuid();
      companyMetricIds.push(metricId);
      metricRows.push({
        id: metricId,
        companyId,
        name: def.name,
        description: `Track ${def.name.toLowerCase()}`,
        category: def.category,
        unit: def.unit,
        frequency: "monthly" as const,
        enabled: true,
        isDefault: true,
        metricType: def.metricType,
        calculationType: def.calculationType,
        direction: rng.pick(["lower_is_better", "higher_is_better"]),
        weight: rng.pick(["1", "2", "3"]),
        importance: rng.pick(["high", "medium", "low"]),
        assignedUserId: rng.pick(companyUserIds),
      });
    }

    for (let p = 0; p < config.periods; p++) {
      const periodLabel = `${new Date(now.getFullYear(), now.getMonth() - p, 1).toLocaleString("en", { month: "short" })} ${new Date(now.getFullYear(), now.getMonth() - p, 1).getFullYear()}`;
      for (let m = 0; m < companyMetricIds.length; m++) {
        if (rng.chance(0.85)) {
          metricValueRows.push({
            metricId: companyMetricIds[m],
            period: periodLabel,
            value: String(rng.int(10, 10000) / 10),
            previousValue: p > 0 ? String(rng.int(10, 10000) / 10) : null,
            status: rng.pick(["green", "amber", "red"]),
            submittedBy: rng.pick(companyUserIds),
            notes: rng.chance(0.3) ? "Auto-calculated from raw data" : null,
            locked: p > 2,
            dataSourceType: rng.pick(["evidenced", "estimated", "manual"] as const),
            workflowStatus: rng.pick(WORKFLOW_STATUSES),
            reportingPeriodId: companyPeriodIds[p],
          });
        }
      }

      for (const inp of RAW_INPUT_DEFS) {
        if (rng.chance(0.7)) {
          rawDataRows.push({
            companyId,
            inputName: inp.name,
            inputCategory: inp.category,
            value: String(rng.int(1, 50000)),
            unit: inp.unit,
            periodType: "monthly",
            period: periodLabel,
            source: rng.pick(["invoice", "meter_reading", "estimate", "utility_bill"]),
            enteredBy: rng.pick(companyUserIds),
            dataSourceType: rng.pick(["evidenced", "estimated", "manual"] as const),
            workflowStatus: rng.pick(WORKFLOW_STATUSES),
            reportingPeriodId: companyPeriodIds[p],
          });
        }
      }
    }

    const numEvidence = rng.int(3, config.periods * 2);
    for (let e = 0; e < numEvidence; e++) {
      evidenceRows.push({
        companyId,
        filename: `evidence_${rng.pick(["invoice", "report", "certificate", "photo", "policy"])}_${e}.${rng.pick(["pdf", "xlsx", "docx", "png"])}`,
        fileUrl: `/uploads/${companyId}/evidence_${e}.pdf`,
        fileType: rng.pick(["pdf", "xlsx", "docx", "png"]),
        description: rng.pick(["Utility invoice", "Annual report", "ISO certificate", "Site photo", "Policy document"]),
        linkedModule: rng.pick(["metrics", "policies", "questionnaires", null]),
        linkedEntityId: rng.chance(0.7) ? rng.pick(companyMetricIds) : null,
        linkedPeriod: rng.chance(0.5) ? periodRows[rng.int(0, companyPeriodIds.length - 1)]?.name : null,
        evidenceStatus: rng.pick(EVIDENCE_STATUSES),
        uploadedBy: rng.pick(companyUserIds),
        expiryDate: rng.chance(0.4) ? rng.date(now, new Date(now.getTime() + 365 * 86400000)) : null,
        assignedUserId: rng.pick(companyUserIds),
      });
    }

    const numActions = rng.int(2, 8);
    for (let a = 0; a < numActions; a++) {
      actionRows.push({
        companyId,
        title: `Action ${a + 1}: ${rng.pick(["Reduce energy use", "Improve recycling", "Update policy", "Staff training", "Board review", "Supplier audit"])}`,
        description: "Improvement action for ESG performance",
        owner: rng.pick(companyUserIds),
        assignedUserId: rng.pick(companyUserIds),
        dueDate: rng.date(new Date(now.getTime() - 90 * 86400000), new Date(now.getTime() + 180 * 86400000)),
        status: rng.pick(ACTION_STATUSES),
        relatedMetricId: rng.pick(companyMetricIds),
        notes: rng.chance(0.4) ? "Follow-up required" : null,
      });
    }

    const numReports = rng.int(1, Math.min(config.periods, 4));
    for (let r = 0; r < numReports; r++) {
      reportRows.push({
        companyId,
        period: periodRows[r]?.name || "2025",
        reportType: rng.pick(["pdf", "csv", "word"] as const),
        reportTemplate: rng.pick(["board_pack", "customer_pack", "compliance_summary", "assurance_pack"]),
        generatedBy: rng.pick(companyUserIds),
        includePolicy: true,
        includeTopics: true,
        includeMetrics: true,
        includeActions: rng.chance(0.8),
        includeSummary: true,
        includeCarbon: rng.chance(0.7),
        includeEvidence: rng.chance(0.6),
        includeMethodology: rng.chance(0.4),
        includeSignoff: rng.chance(0.5),
        reportData: { sections: [], generatedAt: now.toISOString() },
        workflowStatus: rng.pick(WORKFLOW_STATUSES),
      });
    }

    const policyId = rng.uuid();
    policyRows.push({
      id: policyId,
      companyId,
      status: rng.pick(["draft", "published"] as const),
      reviewDate: rng.date(now, new Date(now.getTime() + 365 * 86400000)),
      assignedUserId: rng.pick(companyUserIds),
    });
    policyVersionRows.push({
      policyId,
      versionNumber: 1,
      content: { sections: [{ title: "Introduction", body: "ESG policy for the organization." }] },
      createdBy: companyUserIds[0],
    });

    const numGenPolicies = rng.int(1, 3);
    for (let gp = 0; gp < numGenPolicies; gp++) {
      genPolicyRows.push({
        companyId,
        templateId: rng.uuid(),
        templateSlug: rng.pick(["environmental-policy", "health-safety-policy", "diversity-policy", "governance-policy", "anti-bribery-policy"]),
        title: `${rng.pick(["Environmental", "Health & Safety", "Diversity", "Governance"])} Policy`,
        status: rng.pick(["draft", "approved", "published"] as const),
        content: { sections: [{ title: "Scope", text: "This policy applies to all operations." }] },
        versionNumber: 1,
        tone: rng.pick(["simple_sme", "audit_ready"] as const),
        workflowStatus: rng.pick(WORKFLOW_STATUSES),
      });
    }

    const numQuestionnaires = rng.int(1, 3);
    for (let q = 0; q < numQuestionnaires; q++) {
      const qId = rng.uuid();
      questionnaireRows.push({
        id: qId,
        companyId,
        title: `${rng.pick(["CDP", "EcoVadis", "Customer", "Supplier"])} Questionnaire ${q + 1}`,
        source: rng.pick(["customer", "internal", "framework"]),
        status: rng.pick(["draft", "in_progress", "completed"] as const),
        assignedUserId: rng.pick(companyUserIds),
      });
      const numQuestions = rng.int(5, 15);
      for (let qi = 0; qi < numQuestions; qi++) {
        questionRows.push({
          questionnaireId: qId,
          questionText: rng.pick([
            "What is your carbon reduction target?",
            "Do you have an environmental management system?",
            "What percentage of waste is recycled?",
            "How do you measure employee satisfaction?",
            "What governance structures oversee ESG?",
            "Do you conduct human rights assessments?",
            "What is your renewable energy percentage?",
            "How do you manage supply chain ESG risks?",
          ]),
          category: rng.pick(METRIC_CATEGORIES),
          orderIndex: qi,
          suggestedAnswer: rng.chance(0.6) ? "We have implemented comprehensive measures." : null,
          editedAnswer: rng.chance(0.3) ? "Updated response with specific details." : null,
          confidence: rng.pick(["high", "medium", "low"] as const),
          approved: rng.chance(0.4),
          workflowStatus: rng.pick(WORKFLOW_STATUSES),
        });
      }
    }

    for (const cat of METRIC_CATEGORIES) {
      const topics = cat === "environmental"
        ? ["Climate Change", "Energy Efficiency", "Waste Management", "Water Conservation", "Biodiversity"]
        : cat === "social"
        ? ["Employee Wellbeing", "Diversity & Inclusion", "Health & Safety", "Training & Development", "Community Impact"]
        : ["Board Governance", "Anti-Corruption", "Data Privacy", "Risk Management", "Stakeholder Engagement"];
      for (const t of topics) {
        materialRows.push({
          companyId,
          topic: t,
          category: cat,
          selected: rng.chance(0.7),
        });
      }
    }

    const numProcurement = rng.int(3, 8);
    for (let pa = 0; pa < numProcurement; pa++) {
      procurementRows.push({
        companyId,
        question: rng.pick([
          "What is your environmental policy?",
          "Do you measure carbon emissions?",
          "What diversity initiatives do you have?",
          "How do you ensure supply chain compliance?",
          "What health and safety measures are in place?",
        ]),
        answer: "We have comprehensive policies and procedures in place.",
        category: rng.pick(METRIC_CATEGORIES),
        status: rng.pick(["draft", "approved", "flagged"] as const),
        usageCount: rng.int(0, 10),
      });
    }

    const numNotifs = rng.int(5, 15);
    for (let n = 0; n < numNotifs; n++) {
      notifRows.push({
        companyId,
        userId: rng.pick(companyUserIds),
        type: rng.pick(NOTIFICATION_TYPES),
        title: rng.pick(["Data entry reminder", "Overdue action", "Evidence expiring", "Report review needed", "Policy review due"]),
        message: "Please complete the required action.",
        severity: rng.pick(["info", "warning", "critical"]),
        dismissed: rng.chance(0.5),
        autoGenerated: true,
        createdAt: rng.date(new Date(now.getTime() - 30 * 86400000), now),
      });
    }

    const numAudit = rng.int(10, 30);
    for (let al = 0; al < numAudit; al++) {
      auditRows.push({
        companyId,
        userId: rng.pick(companyUserIds),
        action: rng.pick(["create", "update", "approve", "reject", "submit", "delete", "login", "export"]),
        entityType: rng.pick(["metric_value", "raw_data", "evidence", "report", "policy", "questionnaire", "action_plan"]),
        entityId: rng.uuid(),
        details: { source: "seed_data" },
        createdAt: rng.date(new Date(now.getTime() - 90 * 86400000), now),
      });
    }

    const numJobs = rng.int(3, 10);
    for (let j = 0; j < numJobs; j++) {
      const status = rng.pick(["completed", "failed", "pending"]);
      bgJobRows.push({
        companyId,
        jobType: rng.pick(["reminder_check", "evidence_expiry", "procurement_revalidation", "compliance_recalculation", "activity_cleanup"]),
        status,
        payload: {},
        result: status === "completed" ? { success: true } : null,
        error: status === "failed" ? "Simulated failure for testing" : null,
        attempts: status === "failed" ? 3 : 1,
        maxAttempts: 3,
        scheduledAt: rng.date(new Date(now.getTime() - 7 * 86400000), now),
        startedAt: status !== "pending" ? rng.date(new Date(now.getTime() - 7 * 86400000), now) : null,
        completedAt: status === "completed" ? now : null,
      });
    }

    if (rng.chance(0.3)) {
      healthRows.push({
        eventType: rng.pick(["job_failure", "api_error", "report_failure"]),
        severity: rng.pick(["warning", "error"]),
        message: "Simulated health event for testing",
        details: { source: "seed_data" },
        companyId,
        createdAt: rng.date(new Date(now.getTime() - 7 * 86400000), now),
      });
    }

    const numActivity = rng.int(20, 50);
    for (let ac = 0; ac < numActivity; ac++) {
      activityRows.push({
        userId: rng.pick(companyUserIds),
        companyId,
        action: rng.pick(ACTIVITY_ACTIONS),
        page: rng.pick(PAGES),
        details: {},
        createdAt: rng.date(new Date(now.getTime() - 30 * 86400000), now),
      });
    }
  }

  console.log("Inserting data...");

  counts.companies = await batchInsert(companies, companyRows);
  console.log(`  companies: ${counts.companies}`);

  counts.companySettings = await batchInsert(companySettings, settingsRows);
  counts.users = await batchInsert(users, userRows);
  console.log(`  users: ${counts.users}`);

  counts.reportingPeriods = await batchInsert(reportingPeriods, periodRows);
  counts.metrics = await batchInsert(metrics, metricRows);
  console.log(`  metrics: ${counts.metrics}`);

  counts.metricValues = await batchInsert(metricValues, metricValueRows);
  console.log(`  metricValues: ${counts.metricValues}`);

  counts.rawDataInputs = await batchInsert(rawDataInputs, rawDataRows);
  console.log(`  rawDataInputs: ${counts.rawDataInputs}`);

  counts.evidenceFiles = await batchInsert(evidenceFiles, evidenceRows);
  counts.actionPlans = await batchInsert(actionPlans, actionRows);
  counts.reportRuns = await batchInsert(reportRuns, reportRows);
  counts.esgPolicies = await batchInsert(esgPolicies, policyRows);
  counts.policyVersions = await batchInsert(policyVersions, policyVersionRows);
  counts.generatedPolicies = await batchInsert(generatedPolicies, genPolicyRows);
  counts.questionnaires = await batchInsert(questionnaires, questionnaireRows);
  counts.questionnaireQuestions = await batchInsert(questionnaireQuestions, questionRows);
  counts.materialTopics = await batchInsert(materialTopics, materialRows);
  counts.procurementAnswers = await batchInsert(procurementAnswers, procurementRows);
  counts.notifications = await batchInsert(notifications, notifRows);
  counts.auditLogs = await batchInsert(auditLogs, auditRows);
  counts.backgroundJobs = await batchInsert(backgroundJobs, bgJobRows);
  counts.platformHealthEvents = await batchInsert(platformHealthEvents, healthRows);
  counts.userActivity = await batchInsert(userActivity, activityRows);

  console.log(`\n=== Seed Complete ===`);
  console.log(`Total records created:`);
  let totalRecords = 0;
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
    totalRecords += count;
  }
  console.log(`  TOTAL: ${totalRecords}`);
  console.log(`\nFirst seeded company ID: ${companyRows[0]?.id}`);
  console.log(`First admin user: user_c0_u0_${seed}@test.local / testpass123`);

  return { counts, firstCompanyId: companyRows[0]?.id, preset, seed };
}

const isDirectRun = process.argv[1]?.includes("seed-generator");
if (isDirectRun) {
  const args = process.argv.slice(2);
  const preset = (args.find(a => ["small", "medium", "large"].includes(a)) || "medium") as "small" | "medium" | "large";
  const seedArg = args.find(a => a.startsWith("--seed="));
  const seed = seedArg ? parseInt(seedArg.split("=")[1]) : 42;

  generateSeedData(preset, seed)
    .then(() => process.exit(0))
    .catch(e => { console.error("Seed failed:", e); process.exit(1); });
}
