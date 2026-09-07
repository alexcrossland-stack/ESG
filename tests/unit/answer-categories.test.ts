import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAnswerCategoryForSave,
  getAnswerCategoryOptions,
  groupAnswersByCategory,
  matchesAnswerCategory,
} from "../../client/src/lib/answer-categories";

test("Answer Library combines spelling variants without dropping or modifying answers", () => {
  const answers = [
    { id: "a", category: "Supply Chain", answer: "First answer" },
    { id: "b", category: " supply_chain ", answer: "Second answer" },
    { id: "c", category: "SUPPLY-CHAIN", answer: "Third answer" },
    { id: "d", category: "Health & Safety", answer: "Fourth answer" },
    { id: "e", category: "health_safety", answer: "Fifth answer" },
    { id: "f", category: "Data & Privacy", answer: "Sixth answer" },
    { id: "g", category: "data_privacy", answer: "Seventh answer" },
  ];
  const original = structuredClone(answers);
  const grouped = groupAnswersByCategory(answers);

  assert.equal(grouped.size, 3);
  assert.deepEqual(grouped.get("supply_chain")?.map((answer) => answer.id), ["a", "b", "c"]);
  assert.deepEqual(grouped.get("health_safety")?.map((answer) => answer.id), ["d", "e"]);
  assert.deepEqual(grouped.get("data_privacy")?.map((answer) => answer.id), ["f", "g"]);
  assert.equal(Array.from(grouped.values()).flat().length, answers.length);
  assert.equal(grouped.get("supply_chain")?.[0], answers[0]);
  assert.deepEqual(answers, original);
});

test("Category filters match every variant, including custom and uncategorised values", () => {
  assert.equal(matchesAnswerCategory("Supply Chain", "supply_chain"), true);
  assert.equal(matchesAnswerCategory("health_safety", "Health & Safety"), true);
  assert.equal(matchesAnswerCategory("Data & Privacy", "data_privacy"), true);
  assert.equal(matchesAnswerCategory(" Local Partners ", "local_partners"), true);
  assert.equal(matchesAnswerCategory(null, "uncategorised"), true);
  assert.equal(matchesAnswerCategory("  ", "uncategorised"), true);
  assert.equal(matchesAnswerCategory("Social", "uncategorised"), false);
  assert.equal(matchesAnswerCategory("Governance", "social"), false);
  assert.equal(matchesAnswerCategory("anything", null), true);
  assert.equal(matchesAnswerCategory("All", "all"), true);
  assert.equal(matchesAnswerCategory("Social", "all"), false);
});

test("Category selectors retain known, custom, selected and uncategorised categories exactly once", () => {
  const options = getAnswerCategoryOptions([
    { category: "Supply Chain" },
    { category: "supply_chain" },
    { category: "Health & Safety" },
    { category: "Data & Privacy" },
    { category: "Local Partners" },
    { category: "local_partners" },
    { category: "All" },
    { category: null },
  ], "Legacy Category", "Filtered Category");
  const keys = options.map((option) => option.key);

  assert.equal(new Set(keys).size, keys.length);
  for (const key of ["environmental", "social", "governance", "general", "supply_chain", "health_safety", "data_privacy", "local_partners", "legacy_category", "filtered_category", "all", "uncategorised"]) {
    assert.equal(keys.includes(key), true, `${key} must remain selectable`);
  }
  assert.equal(options.find((option) => option.key === "health_safety")?.label, "Health & Safety");
  assert.equal(options.find((option) => option.key === "data_privacy")?.label, "Data Privacy");
});

test("Editing an answer preserves its unchanged category, including null, blank and custom categories", () => {
  assert.equal(getAnswerCategoryForSave("uncategorised", null), null);
  assert.equal(getAnswerCategoryForSave("uncategorised", ""), "");
  assert.equal(getAnswerCategoryForSave("uncategorised", "  "), "  ");
  assert.equal(getAnswerCategoryForSave("health_safety", "Health & Safety"), "Health & Safety");
  assert.equal(getAnswerCategoryForSave("local_partners", "Local Partners"), "Local Partners");
});

test("New or explicitly changed categories are canonical, including an intentional uncategorised selection", () => {
  assert.equal(getAnswerCategoryForSave("General"), "general");
  assert.equal(getAnswerCategoryForSave("Health & Safety", "General"), "health_safety");
  assert.equal(getAnswerCategoryForSave("Local Partners", null), "local_partners");
  assert.equal(getAnswerCategoryForSave("uncategorised", "Social"), "uncategorised");
});

test("Blank categories share one group while object-property-like custom categories remain safe", () => {
  const grouped = groupAnswersByCategory([
    { id: "a", category: null },
    { id: "b", category: "" },
    { id: "c", category: " " },
    { id: "d", category: "Uncategorised" },
    { id: "e", category: "constructor" },
    { id: "f", category: "__proto__" },
  ]);
  assert.deepEqual(grouped.get("uncategorised")?.map((answer) => answer.id), ["a", "b", "c", "d"]);
  assert.equal(Array.from(grouped.values()).flat().length, 6);
  assert.equal(grouped.get("constructor")?.[0].id, "e");
});
