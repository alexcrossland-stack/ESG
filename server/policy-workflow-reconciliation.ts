import { pool } from "./storage";

/**
 * Older direct-approval flows set the business status and approved timestamp
 * without synchronising workflow_status. Reconcile only rows that carry that
 * unambiguous approval evidence, and audit every repair in the same transaction.
 * The status predicate makes this safe and idempotent across multiple starts.
 */
export async function reconcileLegacyGeneratedPolicyWorkflowStates(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ reconciled_count: string; audited_count: string }>(`
      WITH reconciled AS (
        UPDATE generated_policies
        SET workflow_status = 'approved',
            reviewed_at = COALESCE(reviewed_at, approved_at),
            review_comment = NULL,
            updated_at = NOW()
        WHERE (workflow_status = 'draft' OR workflow_status IS NULL)
          AND status IN ('approved', 'published')
          AND approved_at IS NOT NULL
        RETURNING id, company_id, status
      ), audited AS (
        INSERT INTO audit_logs (
          company_id,
          user_id,
          actor_type,
          action,
          entity_type,
          entity_id,
          details
        )
        SELECT
          company_id,
          NULL,
          'system',
          'Generated policy workflow reconciled',
          'generated_policy',
          id,
          jsonb_build_object(
            'reason', 'legacy_direct_approval_reconciliation',
            'businessStatus', status,
            'fromWorkflowStatus', 'draft',
            'toWorkflowStatus', 'approved'
          )
        FROM reconciled
        RETURNING entity_id
      )
      SELECT
        (SELECT COUNT(*)::text FROM reconciled) AS reconciled_count,
        (SELECT COUNT(*)::text FROM audited) AS audited_count
    `);
    const reconciledCount = Number(result.rows[0]?.reconciled_count ?? 0);
    const auditedCount = Number(result.rows[0]?.audited_count ?? 0);
    if (reconciledCount !== auditedCount) {
      throw new Error(`Policy workflow reconciliation audit mismatch (${reconciledCount}/${auditedCount})`);
    }
    await client.query("COMMIT");
    return reconciledCount;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
