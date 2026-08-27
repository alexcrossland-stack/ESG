import assert from "node:assert/strict";
import {
  FRAMEWORK_SEEDS,
  METRIC_MAPPINGS,
  REQUIREMENT_SEEDS,
} from "../../server/seed-frameworks";

const vsme = FRAMEWORK_SEEDS.find((framework) => framework.code === "VSME");
const ppn006 = FRAMEWORK_SEEDS.find((framework) => framework.code === "PPN006");
assert.ok(vsme?.version?.includes("2026"));
assert.ok(ppn006?.version?.includes("2025"));

const requirementCodes = REQUIREMENT_SEEDS.map((requirement) => requirement.code);
assert.equal(new Set(requirementCodes).size, requirementCodes.length, "requirement codes must be unique");

for (const disclosure of ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11"]) {
  assert.ok(
    requirementCodes.some((code) => code === `VSME-${disclosure}` || code.startsWith(`VSME-${disclosure}-`)),
    `missing VSME ${disclosure}`,
  );
}
for (const disclosure of ["C1", "C2", "C3", "C4", "C5-C7", "C8", "C9"]) {
  assert.ok(requirementCodes.includes(`VSME-${disclosure}`), `missing VSME ${disclosure}`);
}

for (const code of [
  "PPN006-ENTITY",
  "PPN006-NETZERO",
  "PPN006-BASELINE",
  "PPN006-CURRENT-S1",
  "PPN006-CURRENT-S2",
  "PPN006-CURRENT-S3",
  "PPN006-CURRENT-TOTAL",
  "PPN006-SCOPE3",
  "PPN006-MEASURES",
  "PPN006-PUBLICATION",
  "PPN006-SIGNOFF",
]) {
  assert.ok(requirementCodes.includes(code), `missing ${code}`);
}

for (const code of ["PPN006-BASELINE", "PPN006-SCOPE3", "PPN006-PUBLICATION", "PPN006-SIGNOFF"]) {
  assert.equal(
    REQUIREMENT_SEEDS.find((requirement) => requirement.code === code)?.requirementType,
    "evidence",
    `${code} must require explicit evidence rather than catalogue coverage`,
  );
}

for (const code of ["PPN006-CURRENT-S1", "PPN006-CURRENT-S2", "PPN006-CURRENT-S3", "PPN006-CURRENT-TOTAL"]) {
  assert.ok(
    METRIC_MAPPINGS.some((mapping) => mapping.requirementCode === code && mapping.strength === "direct"),
    `${code} must have an explicit current-footprint metric`,
  );
}

for (const code of ["VSME-B3-ENERGY", "VSME-B7", "VSME-B8", "VSME-B9", "VSME-B10", "VSME-B11", "VSME-C9"]) {
  const mappings = METRIC_MAPPINGS.filter((mapping) => mapping.requirementCode === code);
  assert.ok(mappings.length > 0, `${code} should expose useful mapped inputs`);
  assert.ok(mappings.every((mapping) => mapping.strength !== "direct"), `${code} must not overstate partial data as ready`);
}

const mappingKeys = METRIC_MAPPINGS.map((mapping) => `${mapping.metricCode}:${mapping.requirementCode}`);
assert.equal(new Set(mappingKeys).size, mappingKeys.length, "metric mappings must be unique");

console.log("SME framework catalogue tests passed");
