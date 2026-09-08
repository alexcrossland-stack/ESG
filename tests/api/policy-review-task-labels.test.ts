/** Run against the isolated acceptance server/database, never production. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";

async function run() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const { tenantA, tenantB } = await seedTestTenants();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const ids = Array.from({ length: 4 }, () => randomUUID());
  try {
    const { rows: [template] } = await client.query("SELECT id, slug, name FROM policy_templates ORDER BY name LIMIT 1");
    assert.ok(template, "Seeded template required for display-name fallback");
    for (const [index, title] of ["Audit policy display title", "", randomUUID(), "Approved policy"].entries()) {
      await client.query(`INSERT INTO generated_policies (id, company_id, template_id, template_slug, title, content, status, workflow_status)
        VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, 'draft', $6)`,
      [ids[index], tenantA.companyId, index === 2 ? randomUUID() : template.id,
        index === 2 ? "missing-historical-template" : template.slug, title, index === 3 ? "approved" : "draft"]);
    }
    for (const token of [tenantA.adminToken, tenantA.viewerToken]) {
      const response = await apiRequest("GET", "/api/control-centre?period=2025-12", undefined, token);
      assert.equal(response.status, 200, response.body.slice(0, 300));
      const tasks = JSON.parse(response.body).unapprovedPolicies;
      const expectedNames = ["Audit policy display title", template.name, "Policy"];
      for (let index = 0; index < 3; index++) {
        const task = tasks.find((item: { id: string }) => item.id === ids[index]);
        assert.equal(task?.name, expectedNames[index]);
        assert.equal(task.linkUrl, `/policies?tab=register&policy=${ids[index]}`);
      }
      assert.ok(!tasks.some((item: { id: string }) => item.id === ids[3]), "Approved policies must remain excluded");
    }
    console.log("PASS policy review labels use title, template and friendly fallback for admin and viewer; links and approval filtering preserved");
    const otherTenant = await apiRequest("GET", "/api/control-centre?period=2025-12", undefined, tenantB.adminToken);
    assert.equal(otherTenant.status, 200);
    assert.ok(!JSON.parse(otherTenant.body).unapprovedPolicies.some((item: { id: string }) => ids.includes(item.id)));
    const anonymous = await apiRequest("GET", "/api/control-centre?period=2025-12");
    assert.equal(anonymous.status, 401);
    console.log("PASS policy review summaries remain tenant-scoped and authenticated");
  } finally {
    await client.query("DELETE FROM generated_policies WHERE company_id = $1 AND id = ANY($2::varchar[])", [tenantA.companyId, ids]);
    await client.end();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
