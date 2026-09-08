import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPolicyDocumentSections, getOrderedPolicySections, normalizePolicySectionContent } from "../../shared/policy-document";
import { parseGeneratedMarkdownBlocks, renderGeneratedMarkdownToHtml } from "../../shared/generated-document-markdown";

const sections = [
  { key: "purpose", label: "Purpose" },
  { key: "scope", label: "Scope" },
  { key: "commitments", label: "Policy Commitments" },
  { key: "roles", label: "Roles & Responsibilities" },
  { key: "controls", label: "Operating Rules & Controls" },
];

test("policy editor and document use template order, not JSON storage key order", () => {
  const content = { roles: "Assigned roles.", scope: "All employees.", purpose: "Protect our business.", appendix: "Historic custom clause." };
  const original = structuredClone(content);
  const ordered = getOrderedPolicySections(content, sections);
  assert.deepEqual(ordered.map((section) => section.key), ["purpose", "scope", "commitments", "roles", "controls", "appendix"]);
  const markdown = buildPolicyDocumentSections(content, sections);
  assert.ok(markdown.indexOf("## Purpose") < markdown.indexOf("## Scope"));
  assert.ok(markdown.indexOf("## Scope") < markdown.indexOf("## Roles"));
  assert.ok(markdown.includes("Historic custom clause."));
  assert.deepEqual(content, original, "presentation must not rewrite saved policy content");
});

test("legacy Markdown, bold, plain-text, numbered and setext leading headings normalize", () => {
  for (const heading of ["## Purpose", "### **Purpose**", "Purpose", "**Purpose**", "## 1. Purpose:", "Purpose\n-------", "PURPOSE\n======="]) {
    assert.equal(normalizePolicySectionContent(`\r\n${heading}\r\n\r\nKeep this clause.`, sections[0]), "Keep this clause.", heading);
  }
  assert.equal(normalizePolicySectionContent("## Purpose\n\n**Purpose**\n\nKeep this clause.", sections[0]), "Keep this clause.");
});

test("known historical section labels use the canonical heading once", () => {
  const markdown = buildPolicyDocumentSections({
    purpose: "## Purpose\n\nProtect our business.",
    scope: "## Scope\n\nAll employees.",
    roles: "## Roles and responsibilities\n\nManagement is accountable.",
    commitments: "## Commitments\n\nWe commit to training.",
    controls: "## Operational controls\n\nCheck access monthly.",
  }, sections);
  const blocks = parseGeneratedMarkdownBlocks(markdown);
  const headings = blocks.filter((block) => block.type === "heading");
  assert.equal(headings.length, sections.length);
  for (const section of sections) assert.ok(markdown.includes(`## ${section.label}\n`));
  assert.doesNotMatch(markdown, /## (?:Commitments|Operational controls|Roles and responsibilities)\n/);
  assert.match(markdown, /Check access monthly/);
});

test("legitimate nested headings, body content, lists and quotations are preserved", () => {
  for (const body of [
    "## Scope of supplier assessments\n\nKeep all requirements.",
    "### Local exceptions\n\nKeep local requirements.",
    "This paragraph comes first.\n\n## Scope\n\nA meaningful later heading.",
    "- Scope\n- Purpose",
    "* Scope\n* Purpose",
    "> Scope\n\nQuoted text.",
    "| Scope |\n| --- |",
    "```\nScope\n```",
  ]) assert.equal(normalizePolicySectionContent(body, sections[1]), body);
  assert.equal(normalizePolicySectionContent("## Scope\n\n### Local exceptions\n\nKeep local requirements.", sections[1]), "### Local exceptions\n\nKeep local requirements.");
});

test("unknown/custom sections and missing template metadata retain every saved clause", () => {
  const content = { firstCustom: "Original clause.", purpose: "## Purpose\n\nPurpose clause." };
  assert.deepEqual(getOrderedPolicySections(content, []).map((section) => section.key), Object.keys(content));
  const markdown = buildPolicyDocumentSections(content, []);
  assert.match(markdown, /Original clause/);
  assert.match(markdown, /Purpose clause/);
  assert.equal(getOrderedPolicySections({}, [sections[0], sections[0]]).length, 1);
});

test("new heading-free sections render unchanged, with equivalent HTML and export block headings", () => {
  const content = { scope: "All colleagues.\n\n### Contractors\n\nInclude contractors.", purpose: "**Protect people.**" };
  const markdown = buildPolicyDocumentSections(content, sections.slice(0, 2));
  const html = renderGeneratedMarkdownToHtml(markdown);
  assert.ok(html.indexOf("<h2>Purpose</h2>") < html.indexOf("<h2>Scope</h2>"));
  assert.match(html, /<h3>Contractors<\/h3>/);
  assert.match(html, /<strong>Protect people\.<\/strong>/);
  assert.equal(parseGeneratedMarkdownBlocks(markdown).filter((block) => block.type === "heading").length, 3);
});
