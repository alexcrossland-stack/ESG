import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportingMonthPicker } from "../../client/src/components/reporting-month-picker";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
for (const month of ["2025-12", "2026-01", "2000-02", "2099-11"]) {
  const html = renderToStaticMarkup(React.createElement(ReportingMonthPicker, { month, onChange: () => {} }));
  assert.match(html, /aria-label="Overview reporting month"/);
  assert.match(html, /aria-label="Overview reporting year"/);
  assert.match(html, new RegExp(`value="${month}" selected=""`));
  assert.match(html, new RegExp(`value="${month.slice(0, 4)}" selected=""`));
  assert.equal((html.match(/<option /g) || []).length, 112);
  assert.doesNotMatch(html, /type="month"/);
}
const disabled = renderToStaticMarkup(React.createElement(ReportingMonthPicker, { month: "2026-10", onChange: () => {}, disabled: true }));
assert.match(disabled, /<fieldset[^>]*disabled=""/);
console.log("PASS accessible month/year selectors support every valid reporting year and disable selection before company context is loaded");
