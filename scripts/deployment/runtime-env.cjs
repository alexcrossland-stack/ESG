"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const RUNTIME_KEYS = [
  "NODE_ENV",
  "DATABASE_URL",
  "SESSION_SECRET",
  "MFA_ENCRYPTION_KEY",
  "APP_BASE_URL",
  "CSRF_TRUSTED_ORIGINS",
  "REPLIT_DOMAINS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "AI_INTEGRATIONS_OPENAI_MODEL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "FEATURE_ESTIMATION_ENABLED",
  "FEATURE_PORTFOLIO_ENABLED",
  "FEATURE_REPORT_GENERATION_ENABLED",
  "SESSION_ABSOLUTE_LIFETIME_MS",
  "SESSION_COOKIE_SECURE",
  "SESSION_IDLE_TIMEOUT_MS",
  "STEP_UP_VALIDITY_MS",
  "SLACK_SECURITY_WEBHOOK_URL",
  "AGENT_SERVICE_URL",
  "AGENT_WEBHOOK_URL",
  "RELEASE_SHA",
  "PORT",
];

function parseRuntimeEnv(content) {
  const parsed = {};
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    const rawValue = line.slice(separator + 1).trim();
    let value = rawValue;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      try {
        value = JSON.parse(rawValue);
      } catch {
        throw new Error(`Invalid quoted value for ${key}`);
      }
    } else if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
      value = rawValue.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function serializeRuntimeEnv(values, heading = "Generated runtime configuration. Do not edit manually.") {
  const lines = [
    `# ${heading}`,
    "# This file must be parsed as dotenv data and must never be sourced by a shell.",
  ];
  for (const key of RUNTIME_KEYS) {
    const value = values[key];
    if (value === undefined || value === "") continue;
    lines.push(`${key}=${JSON.stringify(String(value))}`);
  }
  return `${lines.join("\n")}\n`;
}

function readRuntimeEnv(file) {
  if (!file || !fs.existsSync(file)) return {};
  return parseRuntimeEnv(fs.readFileSync(file, "utf8"));
}

function writeRuntimeEnv(file, values, heading) {
  fs.writeFileSync(file, serializeRuntimeEnv(values, heading), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function databaseIdentity(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }
  return JSON.stringify({
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    user: decodeURIComponent(parsed.username),
  });
}

function databaseTargetFingerprint(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }
  const target = JSON.stringify({
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  });
  return crypto.createHash("sha256").update(target).digest("hex");
}

function assertStableEncryptionKey(current, candidate) {
  if (current && candidate && current !== candidate) {
    throw new Error("Routine deployment cannot rotate MFA_ENCRYPTION_KEY without an explicit re-encryption migration");
  }
}

function validateRuntimeEnv(env) {
  const fail = (message) => {
    throw new Error(message);
  };
  if (!env.DATABASE_URL) fail("DATABASE_URL is required");
  databaseIdentity(env.DATABASE_URL);
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    fail("SESSION_SECRET must be at least 32 characters");
  }
  if (!env.MFA_ENCRYPTION_KEY) fail("MFA_ENCRYPTION_KEY is required");

  let appUrl;
  try {
    appUrl = new URL(env.APP_BASE_URL);
  } catch {
    fail("APP_BASE_URL must be a valid URL");
  }
  if (appUrl.protocol !== "https:") fail("APP_BASE_URL must use HTTPS");
  const trustedOrigins = String(env.CSRF_TRUSTED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const trustedDomains = String(env.REPLIT_DOMAINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!trustedOrigins.includes(appUrl.origin) && !trustedDomains.includes(appUrl.hostname)) {
    fail("APP_BASE_URL must be present in CSRF_TRUSTED_ORIGINS or REPLIT_DOMAINS");
  }
  if (env.AI_INTEGRATIONS_OPENAI_BASE_URL !== "https://api.openai.com/v1") {
    fail("AI_INTEGRATIONS_OPENAI_BASE_URL must be https://api.openai.com/v1");
  }
  if (!env.AI_INTEGRATIONS_OPENAI_API_KEY || !env.AI_INTEGRATIONS_OPENAI_MODEL) {
    fail("OpenAI configuration is incomplete");
  }
  if (Boolean(env.RESEND_API_KEY) !== Boolean(env.EMAIL_FROM)) {
    fail("RESEND_API_KEY and EMAIL_FROM must be configured together");
  }
  const stripe = [env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, env.STRIPE_PRO_PRICE_ID];
  if (stripe.some(Boolean) && !stripe.every(Boolean)) {
    fail("Stripe configuration must be complete or disabled");
  }
}

function getPm2RuntimeEnv(processName) {
  try {
    const processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" }));
    const app = processes.find((entry) => entry.name === processName);
    return app?.pm2_env?.env || {};
  } catch {
    return {};
  }
}

function renderFromPrefix(output, prefix, releaseSha) {
  const values = { NODE_ENV: "production", RELEASE_SHA: releaseSha };
  for (const key of RUNTIME_KEYS) {
    if (key === "NODE_ENV" || key === "RELEASE_SHA") continue;
    values[key] = process.env[`${prefix}${key}`];
  }
  writeRuntimeEnv(output, values, "Generated by the SimplyESG deployment workflow.");
}

function mergeRuntimeEnv({ uploadedFile, existingFile, outputFile, pm2Process }) {
  const uploaded = readRuntimeEnv(uploadedFile);
  const existing = readRuntimeEnv(existingFile);
  const pm2 = getPm2RuntimeEnv(pm2Process);
  const merged = {};

  for (const key of RUNTIME_KEYS) {
    const supplied = uploaded[key];
    const preserved = existing[key];
    const runtime = pm2[key];
    const value = supplied !== undefined && supplied !== ""
      ? supplied
      : preserved !== undefined && preserved !== ""
        ? preserved
        : runtime;
    if (value !== undefined && value !== "") merged[key] = String(value);
  }

  merged.NODE_ENV = "production";
  validateRuntimeEnv(merged);

  const currentDatabaseUrl = existing.DATABASE_URL || pm2.DATABASE_URL;
  if (currentDatabaseUrl && databaseIdentity(currentDatabaseUrl) !== databaseIdentity(merged.DATABASE_URL)) {
    throw new Error("Routine deployment cannot change the production database identity");
  }
  assertStableEncryptionKey(existing.MFA_ENCRYPTION_KEY || pm2.MFA_ENCRYPTION_KEY, merged.MFA_ENCRYPTION_KEY);

  writeRuntimeEnv(outputFile, merged, "Validated SimplyESG production runtime configuration.");
  return merged;
}

function captureEffectiveRuntimeEnv(existingFile, outputFile, pm2Process) {
  const existing = readRuntimeEnv(existingFile);
  const pm2 = getPm2RuntimeEnv(pm2Process);
  const effective = {};
  for (const key of RUNTIME_KEYS) {
    const configured = existing[key];
    const runtime = pm2[key];
    const value = runtime !== undefined && runtime !== "" ? runtime : configured;
    if (value !== undefined && value !== "") effective[key] = String(value);
  }
  effective.NODE_ENV = "production";
  validateRuntimeEnv(effective);
  writeRuntimeEnv(outputFile, effective, "Captured effective production runtime for rollback.");
  return effective;
}

function runCli(argv) {
  const [command, ...args] = argv;
  if (command === "render") {
    const [output, prefix, releaseSha] = args;
    if (!output || !prefix || !/^[0-9a-f]{40}$/.test(releaseSha || "")) {
      throw new Error("Usage: runtime-env.cjs render <output> <prefix> <40-char-release-sha>");
    }
    renderFromPrefix(output, prefix, releaseSha);
    console.log(`Runtime configuration rendered to ${path.basename(output)}`);
    return;
  }
  if (command === "merge") {
    const [uploadedFile, existingFile, outputFile, pm2Process = "esg"] = args;
    if (!uploadedFile || !existingFile || !outputFile) {
      throw new Error("Usage: runtime-env.cjs merge <uploaded> <existing> <output> [pm2-process]");
    }
    const merged = mergeRuntimeEnv({ uploadedFile, existingFile, outputFile, pm2Process });
    fs.rmSync(uploadedFile, { force: true });
    console.log("Production runtime candidate validated without shell evaluation");
    console.log(`Email: ${merged.RESEND_API_KEY ? "configured" : "disabled"}`);
    console.log(`Billing: ${merged.STRIPE_SECRET_KEY ? "configured" : "disabled"}`);
    return;
  }
  if (command === "capture") {
    const [existingFile, outputFile, pm2Process = "esg"] = args;
    if (!existingFile || !outputFile) {
      throw new Error("Usage: runtime-env.cjs capture <existing> <output> [pm2-process]");
    }
    captureEffectiveRuntimeEnv(existingFile, outputFile, pm2Process);
    console.log("Effective rollback runtime captured without printing values");
    return;
  }
  if (command === "database-target-fingerprint") {
    const [envFile] = args;
    if (!envFile) throw new Error("Usage: runtime-env.cjs database-target-fingerprint <env-file>");
    const runtime = readRuntimeEnv(envFile);
    if (!runtime.DATABASE_URL) throw new Error("DATABASE_URL is required");
    console.log(databaseTargetFingerprint(runtime.DATABASE_URL));
    return;
  }
  if (command === "exec") {
    const [envFile, executable, ...commandArgs] = args;
    if (!envFile || !executable) {
      throw new Error("Usage: runtime-env.cjs exec <env-file> <executable> [...args]");
    }
    const runtime = readRuntimeEnv(envFile);
    const result = spawnSync(executable, commandArgs, {
      stdio: "inherit",
      env: { ...process.env, ...runtime },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
    return;
  }
  throw new Error("Unknown runtime-env command");
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  RUNTIME_KEYS,
  assertStableEncryptionKey,
  captureEffectiveRuntimeEnv,
  databaseIdentity,
  databaseTargetFingerprint,
  mergeRuntimeEnv,
  parseRuntimeEnv,
  serializeRuntimeEnv,
  validateRuntimeEnv,
  writeRuntimeEnv,
};
