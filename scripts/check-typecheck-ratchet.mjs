import { spawnSync } from "node:child_process";

// This repository has inherited TypeScript debt. The release gate fails if a
// diagnostic appears in a new file or if any file exceeds its recorded
// origin/main count. As debt is fixed, lower counts remain valid and the
// baseline should be ratcheted down in the same change.
const baselineByFile = new Map(Object.entries({
  "client/src/lib/metric-activation.ts": 2,
  "client/src/pages/admin-esg.tsx": 4,
  "client/src/pages/compliance.tsx": 1,
  "client/src/pages/materiality.tsx": 3,
  "client/src/pages/metrics-library.tsx": 9,
  "client/src/pages/metrics.tsx": 1,
  "client/src/pages/policy-templates.tsx": 2,
  "client/src/pages/policy.tsx": 1,
  "client/src/pages/settings.tsx": 1,
  "server/agent-auth.ts": 1,
  "server/agent-routes.ts": 12,
  "server/company-defaults.ts": 1,
  "server/company-provisioning.ts": 2,
  "server/mfa.ts": 1,
  "server/replit_integrations/audio/routes.ts": 3,
  "server/replit_integrations/batch/utils.ts": 2,
  "server/replit_integrations/chat/routes.ts": 3,
  "server/replit_integrations/chat/storage.ts": 3,
  "server/replit_integrations/image/client.ts": 2,
  "server/replit_integrations/image/routes.ts": 1,
  "server/report-engine.ts": 1,
  "server/routes.ts": 325,
  "server/scheduler.ts": 5,
  "server/seed-metric-definitions.ts": 1,
  "server/storage.ts": 7,
  "shared/generated-document-markdown.ts": 1,
}));

const result = spawnSync("npx", ["tsc", "--pretty", "false"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error) {
  console.error(`TypeScript ratchet could not start: ${result.error.message}`);
  process.exit(1);
}

const output = `${result.stdout || ""}\n${result.stderr || ""}`;
const counts = new Map();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^(.+?)\(\d+,\d+\): error TS\d+:/);
  if (!match) continue;
  const file = match[1].replaceAll("\\", "/").replace(`${process.cwd().replaceAll("\\", "/")}/`, "");
  counts.set(file, (counts.get(file) || 0) + 1);
}

if (result.status !== 0 && counts.size === 0) {
  console.error(output.slice(0, 4000));
  console.error("TypeScript failed without parseable diagnostics; refusing to pass the ratchet.");
  process.exit(1);
}

const failures = [];
for (const [file, count] of counts) {
  const baseline = baselineByFile.get(file);
  if (baseline === undefined) failures.push(`${file}: ${count} new diagnostic${count === 1 ? "" : "s"}`);
  else if (count > baseline) failures.push(`${file}: ${count} diagnostics exceeds baseline ${baseline}`);
}

const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
const baselineTotal = Array.from(baselineByFile.values()).reduce((sum, count) => sum + count, 0);
if (total > baselineTotal) failures.push(`total diagnostics ${total} exceeds baseline ${baselineTotal}`);

if (failures.length > 0) {
  console.error("TypeScript diagnostic ratchet failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`TypeScript diagnostic ratchet passed (${total}/${baselineTotal}; no new diagnostic files or per-file increases).`);
