import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const production = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const staging = await readFile(new URL("../../.github/workflows/deploy-staging.yml", import.meta.url), "utf8");
const healthRoute = await readFile(new URL("../../server/agent-routes.ts", import.meta.url), "utf8");
const startup = await readFile(new URL("../../server/index.ts", import.meta.url), "utf8");
const preflight = await readFile(new URL("../../docs/runbooks/hetzner-preflight.md", import.meta.url), "utf8");

assert.match(production, /group: deploy-production\s+cancel-in-progress: false/);
assert.match(production, /GITHUB_REF[^\n]+refs\/heads\/main/);
assert.match(production, /ref: main\s+fetch-depth: 0/);
assert.match(production, /Verify checkout is the remote main tip/);
assert.match(production, /Create production recovery point/);
assert.match(production, /pg_dump --format=custom/);
assert.match(production, /pg_restore --list/);
assert.match(production, /evidence\.tar\.gz/);
assert.match(production, /const value = uploaded\[key\] \|\| existing\[key\]/);
assert.match(production, /RESEND_API_KEY and EMAIL_FROM must be configured together/);
assert.match(production, /Stripe configuration must be complete or disabled/);
assert.match(production, /RELEASE_SHA/);
assert.match(production, /Verify public production release/);
assert.doesNotMatch(production, /git reset --hard origin\/main/);

assert.match(staging, /group: deploy-staging\s+cancel-in-progress: false/);
assert.match(staging, /STAGING_EMAIL_FROM/);
assert.match(staging, /STAGING_AI_INTEGRATIONS_OPENAI_MODEL/);
assert.ok(
  staging.indexOf(". ./.env") < staging.indexOf('pm2 restart "${STAGING_PM2_PROCESS}" --update-env'),
  "staging must source its runtime environment before restarting PM2",
);
assert.match(staging, /Verify public staging release/);

assert.match(healthRoute, /releaseSha: process\.env\.RELEASE_SHA \|\| "unknown"/);
assert.match(startup, /FATAL: Could not create or validate super_admin_actions/);
assert.match(preflight, /Never run the mutating test commands.*against production/i);

console.log("deployment safety contract tests passed");
