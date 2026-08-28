import assert from "node:assert/strict";
import {
  ACTION_PLAN_MUTABLE_FIELDS,
  COMPANY_SETTINGS_MUTABLE_FIELDS,
  ESG_TARGET_MUTABLE_FIELDS,
  GENERATED_POLICY_MUTABLE_FIELDS,
  IDENTITY_PROVIDER_MUTABLE_FIELDS,
  METRIC_MUTABLE_FIELDS,
  QUESTIONNAIRE_QUESTION_MUTABLE_FIELDS,
  pickMutableFields,
} from "../../server/mutation-field-allowlists";

const forbidden = {
  id: "attacker-id",
  companyId: "foreign-company",
  businessId: "foreign-business",
  siteId: "foreign-site",
  assignedUserId: "foreign-user",
  ownerUserId: "foreign-owner",
  createdBy: "foreign-creator",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  approvedAt: new Date(0),
  completedAt: new Date(0),
  completedBy: "foreign-completer",
  workflowStatus: "approved",
};

const cases = [
  [COMPANY_SETTINGS_MUTABLE_FIELDS, { trackEnergy: false }],
  [METRIC_MUTABLE_FIELDS, { enabled: false }],
  [ACTION_PLAN_MUTABLE_FIELDS, { title: "Legitimate action" }],
  [QUESTIONNAIRE_QUESTION_MUTABLE_FIELDS, { editedAnswer: "Legitimate answer" }],
  [GENERATED_POLICY_MUTABLE_FIELDS, { title: "Legitimate policy" }],
  [ESG_TARGET_MUTABLE_FIELDS, { title: "Legitimate target" }],
  [IDENTITY_PROVIDER_MUTABLE_FIELDS, { name: "Legitimate provider" }],
] as const;

for (const [allowlist, legitimate] of cases) {
  const picked = pickMutableFields({ ...forbidden, ...legitimate }, allowlist);
  assert.deepEqual(picked, legitimate);
  for (const field of Object.keys(forbidden)) {
    assert.equal(Object.hasOwn(picked, field), false, `${field} crossed an immutable mutation boundary`);
  }
}

assert.deepEqual(pickMutableFields(null, METRIC_MUTABLE_FIELDS), {});
assert.deepEqual(pickMutableFields([], METRIC_MUTABLE_FIELDS), {});

console.log("mutation field allowlist invariants passed");
