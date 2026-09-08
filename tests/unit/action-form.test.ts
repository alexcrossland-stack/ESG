import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTION_INVALIDATION_KEYS, actionFormSchema, buildActionPayload, getActionFormValues, type ActionPlan } from "../../client/src/lib/action-form";

const first: ActionPlan = {
  id: "first-action", title: "Switch to LED lighting", description: "Keep this description",
  owner: "External facilities manager", assignedUserId: "team-user-1",
  dueDate: "2026-10-01T00:00:00.000Z", status: "complete", notes: "Keep these notes", createdAt: "2026-09-08T08:00:00.000Z",
};
const second: ActionPlan = {
  ...first, id: "second-action", title: "Review supplier policy", description: null,
  owner: null, dueDate: null, status: "in_progress", notes: null,
};

assert.deepEqual(getActionFormValues(), { title: "", description: "", owner: "", dueDate: "", status: "not_started", notes: "" });
assert.deepEqual(getActionFormValues(first), {
  title: first.title, description: first.description, owner: first.owner,
  dueDate: "2026-10-01", status: "complete", notes: first.notes,
});
const unsavedFirst = getActionFormValues(first);
unsavedFirst.title = "Unsaved draft";
assert.equal(getActionFormValues(first).title, first.title, "cancel/reopen must start from persisted data");
assert.deepEqual(getActionFormValues(second), {
  title: second.title, description: "", owner: "", dueDate: "", status: "in_progress", notes: "",
}, "switching records must not inherit another action's values");

const titleOnly = buildActionPayload({ ...getActionFormValues(first), title: "Updated title" }, { title: true });
assert.deepEqual(titleOnly, { title: "Updated title" }, "single-field edits must not overwrite owner, status, date, notes, assignment or description");
assert.deepEqual(buildActionPayload(getActionFormValues(first), {}), {}, "unchanged edits must not normalize saved values");
assert.deepEqual(buildActionPayload({ ...getActionFormValues(first), description: "", owner: "", notes: "", dueDate: "" }, {
  description: true, owner: true, notes: true, dueDate: true,
}), { description: "", owner: "", notes: "", dueDate: null }, "explicit clearing remains supported");
assert.deepEqual(buildActionPayload({ ...getActionFormValues(second), status: "complete" }, { status: true }), { status: "complete" });
assert.equal(buildActionPayload(getActionFormValues(first)).dueDate, first.dueDate);
assert.ok(!("assignedUserId" in buildActionPayload(getActionFormValues(first))), "free-text ownership must never become a user assignment");
assert.equal(actionFormSchema.safeParse({ ...getActionFormValues(), title: "   " }).success, false);
assert.equal(actionFormSchema.safeParse({ ...getActionFormValues(first), owner: "x".repeat(301) }).success, false);

const previousTimezone = process.env.TZ;
try {
  for (const timezone of ["America/Los_Angeles", "Europe/London", "Pacific/Auckland"]) {
    process.env.TZ = timezone;
    assert.equal(getActionFormValues(first).dueDate, "2026-10-01", `${timezone} must retain the date entered`);
    assert.equal(buildActionPayload(getActionFormValues(first)).dueDate, first.dueDate);
  }
} finally {
  if (previousTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = previousTimezone;
}

const source = readFileSync(new URL("../../client/src/pages/actions.tsx", import.meta.url), "utf8");
assert.match(source, /showCreate && <ActionDialog/, "new action form must remount for a fresh opening");
assert.match(source, /editAction\?\.id === action.id && \(\s*<ActionDialog key=\{editAction.id\} action=\{editAction\}/, "only the selected edit form may initialize");
assert.match(source, /defaultValues: getActionFormValues\(action\)/);
assert.match(source, /buildActionPayload\(data, isEditing \? form.formState.dirtyFields : undefined\)/);
assert.match(source, /Responsible person or role: \{action.owner\}/, "saved free-text ownership must be visible");
assert.match(source, /Assigned team member:/, "actual account assignment is a separate, clearly labelled concept");
assert.ok(ACTION_INVALIDATION_KEYS.some(key => key[0] === "/api/my-tasks"));

console.log("Action form preservation, ownership, reset wiring and time-zone tests passed");
