#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const mode = process.argv[2] || "all";
const rootPort = Number.parseInt(process.env.SECURITY_TEST_BASE_PORT || "5070", 10);

const apiGroups = [
  {
    name: "settings, invites, password reset",
    files: [
      "tests/api/settings-security.test.ts",
      "tests/api/invite-identity-provider-hardening.test.ts",
      "tests/api/password-reset-security.test.ts",
    ],
  },
  {
    name: "token lifecycle and timestamp handling",
    files: [
      "tests/api/api-key-token-lifecycle-hardening.test.ts",
      "tests/api/auth-token-timestamps.test.ts",
    ],
  },
  {
    name: "session, headers, sanitization, operational controls",
    files: [
      "tests/api/session-cookie-csrf-hardening.test.ts",
      "tests/api/security-headers.test.ts",
      "tests/api/response-sanitization-hardening.test.ts",
      "tests/api/operational-admin-security-hardening.test.ts",
    ],
  },
  {
    name: "report export and generated files",
    files: [
      "tests/api/report-export-authz.test.ts",
      "tests/api/report-export-content-integrity.test.ts",
      "tests/api/generated-report-file-lifecycle.test.ts",
      "tests/api/report-export-audit.test.ts",
      "tests/api/report-export-audit-visibility.test.ts",
    ],
  },
  {
    name: "audit logs and permissions",
    files: [
      "tests/api/audit-log-retention-immutability.test.ts",
      "tests/api/security-audit-log-completeness.test.ts",
      "tests/api/permissions.test.ts",
    ],
  },
  {
    name: "rate limiting and abuse protection",
    files: ["tests/api/rate-limiting-abuse-protection.test.ts"],
  },
];

const browserSpecs = [
  "tests/e2e/settings-security.browser.spec.ts",
  "tests/e2e/settings-security-ui.browser.spec.ts",
  "tests/e2e/audit-log-ui.browser.spec.ts",
  "--project=chromium",
];

function validateMode() {
  if (!["api", "browser", "all"].includes(mode)) {
    console.error(`Unknown security regression mode "${mode}". Use api, browser, or all.`);
    process.exit(1);
  }
}

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required for security regression tests.");
    process.exit(1);
  }
}

function serverEnv(port) {
  return {
    ...process.env,
    NODE_ENV: "development",
    REGRESSION_TEST: "1",
    SESSION_SECRET: process.env.SESSION_SECRET || "local-security-regression-secret-32chars",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-local-security-regression-dummy",
    PORT: String(port),
    BASE_URL: `http://127.0.0.1:${port}`,
  };
}

function runCommand(label, command, args, env) {
  return new Promise((resolve, reject) => {
    console.log(`\n[security] ${label}`);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with ${signal || `exit code ${code}`}`));
    });
  });
}

function startServer(port) {
  const env = serverEnv(port);
  const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  let settled = false;

  function collect(chunk, stream) {
    const text = chunk.toString();
    logs.push(text);
    if (logs.join("").includes(`serving on port ${port}`) && !settled) {
      settled = true;
      readyResolve({ server, env });
    }
    stream.write(chunk);
  }

  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  server.stdout.on("data", (chunk) => collect(chunk, process.stdout));
  server.stderr.on("data", (chunk) => collect(chunk, process.stderr));
  server.on("error", (error) => {
    if (!settled) {
      settled = true;
      readyReject(error);
    }
  });
  server.on("exit", (code, signal) => {
    if (!settled) {
      settled = true;
      readyReject(new Error(`Server exited before readiness with ${signal || `code ${code}`}`));
    }
  });

  setTimeout(() => {
    if (!settled) {
      settled = true;
      readyReject(new Error(`Timed out waiting for server on port ${port}`));
    }
  }, 30000);

  return ready;
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
    }, 5000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

async function withServer(port, label, callback) {
  console.log(`\n[security] Starting local server for ${label} on port ${port}`);
  const { server, env } = await startServer(port);
  try {
    await callback(env);
  } finally {
    await stopServer(server);
  }
}

async function runApiGroups() {
  for (let index = 0; index < apiGroups.length; index += 1) {
    const group = apiGroups[index];
    const port = rootPort + index;
    await withServer(port, group.name, async (env) => {
      for (const file of group.files) {
        await runCommand(file, process.execPath, ["--import", "tsx", file], env);
      }
    });
  }
}

async function runBrowserSpecs() {
  const port = rootPort + apiGroups.length;
  await withServer(port, "browser security specs", async (env) => {
    await runCommand("Playwright security specs", "npx", ["playwright", "test", ...browserSpecs], env);
  });
}

validateMode();
requireDatabaseUrl();

try {
  if (mode === "api" || mode === "all") {
    await runApiGroups();
  }
  if (mode === "browser" || mode === "all") {
    await runBrowserSpecs();
  }
  console.log("\n[security] Security regression suite completed successfully.");
} catch (error) {
  console.error(`\n[security] ${error?.message || String(error)}`);
  process.exit(1);
}
