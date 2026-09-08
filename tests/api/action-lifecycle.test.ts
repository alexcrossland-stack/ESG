/** Persisted action edit/ownership regression. Run only against an isolated acceptance server/database. */
import assert from "node:assert/strict";
import { apiRequest, seedTestTenants } from "../fixtures/seed.js";
import { buildActionPayload, getActionFormValues, type ActionPlan } from "../../client/src/lib/action-form";

function json<T>(response: { status: number; body: string }, expectedStatus = 200): T {
  assert.equal(response.status, expectedStatus, `expected ${expectedStatus}, got ${response.status}: ${response.body.slice(0, 400)}`);
  return JSON.parse(response.body) as T;
}

async function main() {
  const { tenantA, tenantB } = await seedTestTenants();
  const createdIds: string[] = [];
  const actions = async () => json<ActionPlan[]>(await apiRequest("GET", "/api/actions", undefined, tenantA.adminToken));
  const reload = async (id: string) => {
    const action = (await actions()).find(item => item.id === id);
    assert.ok(action, "persisted action missing on reload");
    return action;
  };
  const userId = async (token: string) => json<{ user: { id: string } }>(await apiRequest("GET", "/api/auth/me", undefined, token)).user.id;
  const taskIds = async (token: string) => json<Array<{ entityId: string }>>(await apiRequest("GET", "/api/my-tasks", undefined, token)).map(task => task.entityId);

  try {
    const initial = {
      title: "Action lifecycle audit", description: "Description must survive", owner: "External facilities manager",
      dueDate: "2099-10-01T00:00:00.000Z", status: "in_progress" as const, notes: "Notes must survive",
    };
    const first = json<ActionPlan>(await apiRequest("POST", "/api/actions", initial, tenantA.adminToken));
    createdIds.push(first.id);
    const second = json<ActionPlan>(await apiRequest("POST", "/api/actions", {
      title: "Second complete action", description: null, owner: null, dueDate: null, status: "complete", notes: null,
    }, tenantA.adminToken));
    createdIds.push(second.id);

    json(await apiRequest("PUT", `/api/actions/${first.id}`, buildActionPayload({
      ...getActionFormValues(first), title: "Action lifecycle renamed",
    }, { title: true }), tenantA.adminToken));
    const renamed = await reload(first.id);
    for (const key of ["description", "owner", "dueDate", "status", "notes"] as const) {
      assert.equal(renamed[key], initial[key], `title-only edit must preserve ${key}`);
    }
    assert.equal(renamed.title, "Action lifecycle renamed");
    assert.equal(renamed.assignedUserId, null, "free-text owner does not assign a real account");
    assert.ok(!(await taskIds(tenantA.adminToken)).includes(first.id), "free-text owner alone must not create My Tasks assignment");
    console.log("PASS title-only edit preserves all other stored fields and free-text ownership");

    json(await apiRequest("PUT", `/api/actions/${second.id}`, buildActionPayload({
      ...getActionFormValues(second), title: "Second action renamed",
    }, { title: true }), tenantA.adminToken));
    const secondReloaded = await reload(second.id);
    assert.equal(secondReloaded.status, "complete");
    for (const key of ["description", "owner", "dueDate", "notes"] as const) assert.equal(secondReloaded[key], null);
    assert.equal((await reload(first.id)).description, initial.description, "switching records must leave first action intact");
    console.log("PASS different/complete action edits preserve nulls, status and the other record");

    const contributorId = await userId(tenantA.contributorToken);
    json(await apiRequest("PUT", `/api/assign/action_plans/${first.id}`, { assignedUserId: contributorId }, tenantA.adminToken));
    const assigned = await reload(first.id);
    assert.equal(assigned.assignedUserId, contributorId);
    assert.equal(assigned.owner, initial.owner, "assigning a team member must retain the legacy responsible person/role");
    assert.ok((await taskIds(tenantA.contributorToken)).includes(first.id));

    json(await apiRequest("PUT", `/api/actions/${first.id}`, buildActionPayload({
      ...getActionFormValues(assigned), owner: "Updated external contact",
    }, { owner: true }), tenantA.adminToken));
    assert.equal((await reload(first.id)).assignedUserId, contributorId, "editing contact text must not replace real assignment");
    console.log("PASS real assignment appears in My Tasks and remains distinct from contact text");

    const foreignId = await userId(tenantB.adminToken);
    json(await apiRequest("PUT", `/api/assign/action_plans/${first.id}`, { assignedUserId: foreignId }, tenantA.adminToken), 404);
    json(await apiRequest("PUT", `/api/assign/action_plans/${first.id}`, { assignedUserId: contributorId }, tenantA.contributorToken), 403);
    json(await apiRequest("PUT", `/api/actions/${first.id}`, { title: "Unauthorized edit" }, tenantA.viewerToken), 403);
    json(await apiRequest("PUT", `/api/actions/${first.id}`, { title: "Foreign edit" }, tenantB.adminToken), 404);
    assert.equal((await reload(first.id)).assignedUserId, contributorId);
    console.log("PASS assignment/admin and write/tenant permissions remain enforced");

    json(await apiRequest("PUT", `/api/actions/${first.id}`, buildActionPayload({
      ...getActionFormValues(await reload(first.id)), status: "complete",
    }, { status: true }), tenantA.adminToken));
    assert.ok(!(await taskIds(tenantA.contributorToken)).includes(first.id), "completed actions leave My Tasks");
    json(await apiRequest("PUT", `/api/actions/${first.id}`, { status: "in_progress" }, tenantA.adminToken));
    assert.ok((await taskIds(tenantA.contributorToken)).includes(first.id), "reopened actions return to My Tasks");
    json(await apiRequest("PUT", `/api/assign/action_plans/${first.id}`, { assignedUserId: "" }, tenantA.adminToken));
    assert.ok(!(await taskIds(tenantA.contributorToken)).includes(first.id), "unassigning clears My Tasks");
    assert.equal((await reload(first.id)).owner, "Updated external contact");
    console.log("PASS complete/reopen/unassign lifecycle preserves legacy responsibility");

    json(await apiRequest("PUT", `/api/actions/${first.id}`, buildActionPayload({
      ...getActionFormValues(await reload(first.id)), description: "", owner: "", notes: "", dueDate: "",
    }, { description: true, owner: true, notes: true, dueDate: true }), tenantA.adminToken));
    const cleared = await reload(first.id);
    assert.equal(cleared.description, "");
    assert.equal(cleared.owner, "");
    assert.equal(cleared.notes, "");
    assert.equal(cleared.dueDate, null);
    console.log("PASS explicit field clearing remains supported");
  } finally {
    for (const id of createdIds) json(await apiRequest("DELETE", `/api/actions/${id}`, undefined, tenantA.adminToken));
    assert.ok(!(await actions()).some(item => createdIds.includes(item.id)), "deleted fixtures must not reappear");
  }
  console.log("Action lifecycle API regression passed (including deletion)");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
