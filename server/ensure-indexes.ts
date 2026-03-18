import { db } from "./storage";
import { sql } from "drizzle-orm";

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_metrics_company_id ON metrics(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_metrics_company_category ON metrics(company_id, category)",
  "CREATE INDEX IF NOT EXISTS idx_metric_values_metric_id ON metric_values(metric_id)",
  "CREATE INDEX IF NOT EXISTS idx_metric_values_period ON metric_values(metric_id, period)",
  "CREATE INDEX IF NOT EXISTS idx_metric_values_reporting_period ON metric_values(reporting_period_id)",
  "CREATE INDEX IF NOT EXISTS idx_raw_data_company_id ON raw_data_inputs(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_raw_data_company_period ON raw_data_inputs(company_id, period)",
  "CREATE INDEX IF NOT EXISTS idx_raw_data_reporting_period ON raw_data_inputs(reporting_period_id)",
  "CREATE INDEX IF NOT EXISTS idx_evidence_company_id ON evidence_files(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_evidence_company_status ON evidence_files(company_id, evidence_status)",
  "CREATE INDEX IF NOT EXISTS idx_action_plans_company_id ON action_plans(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_report_runs_company_id ON report_runs(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_company_user ON notifications(company_id, user_id)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_dismissed ON notifications(company_id, dismissed)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_questionnaires_company_id ON questionnaires(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_qid ON questionnaire_questions(questionnaire_id)",
  "CREATE INDEX IF NOT EXISTS idx_reporting_periods_company ON reporting_periods(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status)",
  "CREATE INDEX IF NOT EXISTS idx_background_jobs_scheduled ON background_jobs(status, scheduled_at)",
  "CREATE INDEX IF NOT EXISTS idx_background_jobs_idem ON background_jobs(idempotency_key)",
  "CREATE INDEX IF NOT EXISTS idx_health_events_created ON platform_health_events(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_health_events_type ON platform_health_events(event_type)",
  "CREATE INDEX IF NOT EXISTS idx_user_activity_company ON user_activity(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_user_activity_created ON user_activity(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_user_activity_action ON user_activity(action, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_generated_files_company ON generated_files(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_generated_files_report ON generated_files(report_run_id)",
  "CREATE INDEX IF NOT EXISTS idx_esg_policies_company ON esg_policies(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON policy_versions(policy_id)",
  "CREATE INDEX IF NOT EXISTS idx_carbon_calcs_company ON carbon_calculations(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_material_topics_company ON material_topics(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_procurement_company ON procurement_answers(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_procurement_status ON procurement_answers(company_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_generated_policies_company ON generated_policies(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_company_settings_company ON company_settings(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_evidence_requests_company ON evidence_requests(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_compliance_req_framework ON compliance_requirements(framework_id)",
  // Organisation sites
  "CREATE INDEX IF NOT EXISTS idx_org_sites_company_id ON organisation_sites(company_id)",
  "CREATE INDEX IF NOT EXISTS idx_org_sites_company_status ON organisation_sites(company_id, status)",
  // site_id indexes on ESG data tables
  "CREATE INDEX IF NOT EXISTS idx_metric_values_site_id ON metric_values(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_raw_data_site_id ON raw_data_inputs(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_evidence_files_site_id ON evidence_files(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_questionnaires_site_id ON questionnaires(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_generated_policies_site_id ON generated_policies(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_carbon_calcs_site_id ON carbon_calculations(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_report_runs_site_id ON report_runs(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_agent_runs_site_id ON agent_runs(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_chat_sessions_site_id ON chat_sessions(site_id)",
  "CREATE INDEX IF NOT EXISTS idx_user_activity_site_id ON user_activity(site_id)",
];

export async function ensureIndexes() {
  let created = 0;
  for (const idx of INDEXES) {
    try {
      await db.execute(sql.raw(idx));
      created++;
    } catch {
    }
  }
  console.log(`[Indexes] Ensured ${created}/${INDEXES.length} indexes`);
}
