import assert from "node:assert/strict";
import {
  combineWorkflowSubmitResponses,
  normalizeDataEntryWorkflowStatus,
  selectDataEntryWorkflowItems,
  summarizeDataEntryWorkflow,
  workflowReviewNotice,
  workflowSubmitNotice,
} from "../../client/src/lib/workflow-outcomes";

const metricValues = [
  { id: "metric-draft", workflowStatus: "draft" },
  { id: "metric-submitted", workflowStatus: "submitted" },
  { id: "metric-approved", workflowStatus: "approved" },
  { id: "metric-rejected", workflowStatus: "rejected" },
  { id: "metric-draft", workflowStatus: "draft" },
];
const rawData = [
  { id: "raw-legacy", workflowStatus: null },
  { id: "raw-submitted", workflowStatus: "submitted" },
  { id: "raw-archived", workflowStatus: "archived" },
  { id: "", workflowStatus: "draft" },
];

assert.equal(normalizeDataEntryWorkflowStatus(undefined), "draft", "legacy null statuses are editable drafts");

assert.deepEqual(
  selectDataEntryWorkflowItems(metricValues, rawData, ["draft"]),
  [
    { entityType: "metric_value", entityId: "metric-draft" },
    { entityType: "raw_data", entityId: "raw-legacy" },
  ],
  "Data Entry submits only unique draft rows from the current view",
);

assert.deepEqual(
  selectDataEntryWorkflowItems(metricValues, rawData, ["submitted"]),
  [
    { entityType: "metric_value", entityId: "metric-submitted" },
    { entityType: "raw_data", entityId: "raw-submitted" },
  ],
  "Data Entry reviews only rows that are actually submitted",
);

assert.deepEqual(
  summarizeDataEntryWorkflow(metricValues, rawData),
  { total: 8, draft: 3, submitted: 2, approved: 1, rejected: 1, archived: 1 },
  "status counts reflect every row instead of inferring the period from its first row",
);

const partialSubmit = combineWorkflowSubmitResponses(5, [
    {
      requested: 3,
      submitted: 2,
      alreadySubmitted: 1,
      alreadyApproved: 0,
      ineligible: 0,
      notFound: 0,
      duplicates: 0,
    },
  ], 1, 2);

assert.deepEqual(
  partialSubmit,
  {
    requested: 5,
    requestFailures: 1,
    unconfirmed: 2,
    submitted: 2,
    alreadySubmitted: 1,
    alreadyApproved: 0,
    ineligible: 0,
    notFound: 0,
    duplicates: 0,
  },
  "partial server outcomes and failed request groups stay explicit for truthful UI messaging",
);

assert.deepEqual(
  workflowSubmitNotice(partialSubmit),
  {
    title: "Submitted 2 of 5 items",
    description: "1 item was skipped because its status changed or it was no longer available. 2 item outcomes could not be confirmed across 1 failed request. Refresh before retrying.",
    isPartial: true,
  },
  "the submit toast must never describe a partial multi-type request as fully submitted",
);

assert.deepEqual(
  workflowReviewNotice({ requested: 5, reviewed: 3, notSubmitted: 1, notFound: 1 }, "approve"),
  {
    title: "Approved 3 of 5 items",
    description: "2 items were skipped because their status changed or they were no longer available.",
    isPartial: true,
  },
  "the review toast must show exact reviewed and skipped counts",
);

console.log("workflow outcome tests passed");
