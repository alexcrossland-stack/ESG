import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { SmeDashboardOverview } from "../../client/src/components/sme-dashboard-overview";

// tsx honours the repository's jsx:preserve as classic JSX in this Node-only
// harness. The browser build supplies the JSX runtime through Vite instead.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

function render(props: React.ComponentProps<typeof SmeDashboardOverview>) {
  return renderToStaticMarkup(React.createElement(Router, { ssrPath: "/" }, React.createElement(SmeDashboardOverview, props)));
}

const props = {
  month: "2025-12",
  showNextAction: false,
  readiness: { filledMetrics: 2, totalMetrics: 7, reportingReadiness: false, esgStatus: { state: "DRAFT" } },
  enhanced: { overdueActions: [{ id: "a" }], upcomingPolicyReviews: [{ status: "overdue" }, { status: "urgent" }, { status: "upcoming" }] },
  children: React.createElement("div", { "data-testid": "test-next-tasks" }, "Next action"),
};
const html = render(props);
assert.match(html, /2 of 7/);
assert.match(html, /29%/);
assert.match(html, /December 2025/);
assert.match(html, /1 overdue · 2 due soon/);
assert.match(html, /Next 90 days \(1 within 30 days\)/);
assert.match(html, /href="\/reports\?period=2025-12"/);
assert.match(html, /href="\/data-entry\?period=2025-12"/);
assert.ok(html.indexOf("test-next-tasks") > html.indexOf("sme-status-strip"));
assert.ok(html.indexOf("test-next-tasks") < html.indexOf("disclosure-sme-confidence"));
assert.match(html, /<details[^>]*data-testid="disclosure-sme-confidence"[^>]*>/);
assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
assert.match(html, /Data completion by ESG area/);
assert.match(html, /not an ESG rating or compliance assessment/);
console.log("PASS overview renders exact counts, scoped links, policy windows and tasks before optional details");

const noDue = render({ ...props, readiness: { filledMetrics: 0, totalMetrics: 0, reportingReadiness: true } });
assert.match(noDue, /No figures due/);
assert.doesNotMatch(noDue, /Baseline threshold met/);
assert.doesNotMatch(noDue, /100%/);
const unavailable = render({ month: "2025-12", showNextAction: false });
assert.match(unavailable, /Figures unavailable/);
assert.doesNotMatch(unavailable, /0 overdue|0%|0 of/);
const failed = render({ ...props, hasError: true });
assert.match(failed, /role="alert"/);
assert.match(failed, /unavailable, not zero/);
assert.match(failed, /test-next-tasks/);
assert.doesNotMatch(failed, /29%|2 of 7/);
const loading = render({ ...props, isLoading: true });
assert.match(loading, /aria-busy="true"/);
assert.match(loading, /test-next-tasks/);
console.log("PASS no-due, unavailable, loading and failed states never present invented scores and preserve task slot");

const milestone = render({ ...props, readiness: { ...props.readiness, hasGeneratedReport: true } });
assert.match(milestone, /Your first report has been created/);
assert.match(milestone, /across all reporting periods/);
assert.match(milestone, /does not mean a report exists for December 2025 or is approved/);
assert.doesNotMatch(milestone, /tab=library/);
console.log("PASS lifetime report milestone does not claim a selected-month or approved report");
