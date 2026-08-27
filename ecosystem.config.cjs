"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parseRuntimeEnv } = require("./scripts/deployment/runtime-env.cjs");

const envFile = path.join(__dirname, ".env");
if (!fs.existsSync(envFile)) {
  throw new Error(`Runtime environment file is missing: ${envFile}`);
}

const runtimeEnv = parseRuntimeEnv(fs.readFileSync(envFile, "utf8"));
const processName = process.env.DEPLOY_PROCESS_NAME || "esg";
const port = process.env.DEPLOY_PORT_OVERRIDE || runtimeEnv.PORT || "5000";
const deploymentWriteLockFile = process.env.DEPLOYMENT_WRITE_LOCK_FILE;
const deploymentValidation = process.env.DEPLOYMENT_VALIDATION;

module.exports = {
  apps: [
    {
      name: processName,
      script: path.join(__dirname, "dist", "index.cjs"),
      cwd: __dirname,
      env: {
        ...runtimeEnv,
        NODE_ENV: "production",
        PORT: String(port),
        ...(deploymentWriteLockFile ? { DEPLOYMENT_WRITE_LOCK_FILE: deploymentWriteLockFile } : {}),
        ...(deploymentValidation ? { DEPLOYMENT_VALIDATION: deploymentValidation } : {}),
      },
    },
  ],
};
