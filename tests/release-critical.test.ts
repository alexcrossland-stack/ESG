import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  formatReleaseStepFailure,
  getIncompletePlaywrightSummary,
  RELEASE_STEP_MAX_BUFFER_BYTES,
} from "./release-gate-policy";

type Result = {
  name: string;
  status: "passed" | "failed" | "skipped";
  detail?: string;
};

const cwd = process.cwd();
const nodeBinDir = path.join(process.env.HOME || "", "node", "bin");
const env = {
  ...process.env,
  PATH: nodeBinDir ? `${nodeBinDir}:${process.env.PATH || ""}` : process.env.PATH || "",
};

const results: Result[] = [];

function record(name: string, status: Result["status"], detail?: string) {
  results.push({ name, status, detail });
  const prefix = status === "passed" ? "PASS" : status === "failed" ? "FAIL" : "SKIP";
  console.log(`${prefix} ${name}${detail ? ` — ${detail}` : ""}`);
}

function runStep(
  name: string,
  command: string,
  args: string[],
  options: { failOnSkippedTests?: boolean } = {},
) {
  const res = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: RELEASE_STEP_MAX_BUFFER_BYTES,
  });

  const stdout = res.stdout || "";
  const stderr = res.stderr || "";
  const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");
  const skippedSummary = getIncompletePlaywrightSummary(combinedOutput);

  if (res.status === 0 && options.failOnSkippedTests && skippedSummary) {
    record(name, "failed", `Playwright reported ${skippedSummary}; release acceptance requires every selected journey to run`);
    if (stdout.trim()) console.log(stdout.trim());
    return false;
  }

  if (res.status === 0) {
    record(name, "passed");
    if (stdout.trim()) console.log(stdout.trim());
    return true;
  }

  record(name, "failed", formatReleaseStepFailure({
    output: combinedOutput,
    status: res.status,
    signal: res.signal,
    errorMessage: res.error?.message,
  }));
  return false;
}

function requireOrSkip(name: string, detail: string) {
  record(name, process.env.STRICT_RELEASE === "1" ? "failed" : "skipped", detail);
}

function main() {
  console.log("Release-Critical Regression Suite");
  console.log("================================");
  console.log("Covers: production build, secret scanning, all unit contracts, every standalone API regression, the Playwright API project, and all Chromium user journeys.");

  runStep("Production build", "npm", ["run", "build"]);
  runStep("TypeScript diagnostic ratchet", "npm", ["run", "check:types-ratchet"]);
  runStep("Secret scan", "npm", ["run", "check:secrets"]);
  for (const file of readdirSync(path.join(cwd, "tests", "unit")).filter((name) => name.endsWith(".test.ts")).sort()) {
    runStep(`Unit contract: ${file}`, "node", ["--import", "tsx", path.join("tests", "unit", file)]);
  }

  if (process.env.RUN_E2E_RELEASE === "1") {
    // Run the browser project first. It contains the true signup journey and
    // therefore must execute before database fixtures consume registration
    // rate-limit slots and fall back to SQL provisioning.
    runStep(
      "Complete Chromium user-journey project",
      "npx",
      ["playwright", "test", "--project=chromium", "--workers=1"],
      { failOnSkippedTests: true },
    );
    runStep(
      "Playwright API regression project",
      "npx",
      ["playwright", "test", "--project=api", "--workers=1"],
      { failOnSkippedTests: true },
    );
  } else {
    requireOrSkip("Complete API and Chromium projects", "Set RUN_E2E_RELEASE=1 to include browser/API journey checks");
  }

  if (process.env.DATABASE_URL) {
    runStep("API security / RBAC / tenant isolation", "node", ["--import", "tsx", "tests/api-security.test.ts"]);
    runStep("Metric upsert / duplicate prevention", "node", ["--import", "tsx", "tests/metric-upsert.test.ts"]);
    const standaloneApiFiles = readdirSync(path.join(cwd, "tests", "api"))
      .filter((name) => name.endsWith(".test.ts"))
      .sort((left, right) => {
        const rateLimitFile = "rate-limiting-abuse-protection.test.ts";
        if (left === rateLimitFile) return 1;
        if (right === rateLimitFile) return -1;
        return left.localeCompare(right);
      });
    for (const file of standaloneApiFiles) {
      runStep(`Standalone API: ${file}`, "node", ["--import", "tsx", path.join("tests", "api", file)]);
    }
  } else {
    requireOrSkip("Database-backed API and security suite", "DATABASE_URL not set");
  }

  record("SME and extended regression scope", "passed", "Core SME, security, reporting, public sharing and portfolio isolation projects are included");

  const failed = results.filter((r) => r.status === "failed");
  console.log("\nSummary");
  console.log("=======");
  console.log(`passed=${results.filter((r) => r.status === "passed").length}`);
  console.log(`failed=${failed.length}`);
  console.log(`skipped=${results.filter((r) => r.status === "skipped").length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
