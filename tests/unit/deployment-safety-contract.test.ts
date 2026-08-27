import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const production = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const staging = await readFile(new URL("../../.github/workflows/deploy-staging.yml", import.meta.url), "utf8");
const releaseGate = await readFile(new URL("../../.github/workflows/sme-release-gate.yml", import.meta.url), "utf8");
const healthRoute = await readFile(new URL("../../server/agent-routes.ts", import.meta.url), "utf8");
const startup = await readFile(new URL("../../server/index.ts", import.meta.url), "utf8");
const routes = await readFile(new URL("../../server/routes.ts", import.meta.url), "utf8");
const scheduler = await readFile(new URL("../../server/scheduler.ts", import.meta.url), "utf8");
const preflight = await readFile(new URL("../../docs/runbooks/hetzner-preflight.md", import.meta.url), "utf8");
const remoteDeploy = await readFile(new URL("../../scripts/deployment/remote-production.sh", import.meta.url), "utf8");
const recovery = await readFile(new URL("../../scripts/deployment/recovery-point.cjs", import.meta.url), "utf8");
const ecosystem = await readFile(new URL("../../ecosystem.config.cjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const npmrc = await readFile(new URL("../../.npmrc", import.meta.url), "utf8");

assert.match(production, /group: deploy-production\s+cancel-in-progress: false/);
assert.match(production, /GITHUB_REF[^\n]+refs\/heads\/main/);
assert.match(production, /PRODUCTION_APP_BASE_URL: https:\/\/www\.simplyesg\.co\.uk/);
assert.match(production, /PRODUCTION_CSRF_TRUSTED_ORIGINS: https:\/\/www\.simplyesg\.co\.uk/);
assert.match(production, /ref: main\s+fetch-depth: 0/);
assert.match(production, /Verify checkout and release gate/);
assert.match(production, /node-version: 24\.20\.0/);
assert.match(production, /NODE_RUNTIME_SHA256: 2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2/);
assert.match(production, /Download and verify pinned production Node runtime/);
assert.match(production, /Validate and render production runtime configuration/);
assert.match(production, /Start isolated ssh-agent and add deploy key/);
assert.doesNotMatch(production, /webfactory\/ssh-agent@/);
assert.match(production, /Build, recoverability-check and atomically deploy/);
assert.match(production, /remote-production\.sh/);
assert.match(production, /systemd-run --unit=/);
assert.match(production, /--setenv=PM2_HOME='\/root\/\.pm2'/);
assert.match(production, /systemctl show/);
assert.match(production, /Verify public production release and safe anonymous contracts/);
assert.doesNotMatch(production, /\. \.\/\.env|source .*\.env/);
assert.doesNotMatch(production, /git reset --hard/);

assert.match(releaseGate, /runs-on: ubuntu-24\.04/);
assert.match(releaseGate, /sudo systemctl start postgresql\.service/);
assert.match(releaseGate, /CREATE ROLE simplyesg LOGIN CREATEDB/);
assert.match(releaseGate, /SELECT host\(inet_server_addr\(\)\)/);
assert.doesNotMatch(releaseGate, /services:\s+postgres:/);

assert.match(staging, /group: deploy-staging\s+cancel-in-progress: false/);
assert.match(staging, /node-version: 24\.20\.0/);
assert.match(staging, /Staging requires Node v\$\{NODE_RUNTIME_VERSION\}/);
assert.match(staging, /STAGING_EMAIL_FROM/);
assert.match(staging, /STAGING_AI_INTEGRATIONS_OPENAI_MODEL/);
assert.match(staging, /runtime-env\.cjs render staging\.env/);
assert.match(staging, /pm2 start ecosystem\.config\.cjs/);
assert.match(staging, /canonical_app_dir="\$\(ssh/);
assert.match(staging, /Canonical staging path resolves to the production checkout/);
assert.match(staging, /PRODUCTION_DATABASE_TARGET_FINGERPRINT/);
assert.match(staging, /STAGING_DATABASE_URL resolves to the protected production database target/);
assert.match(staging, /Start isolated ssh-agent and add staging deploy key/);
assert.doesNotMatch(staging, /webfactory\/ssh-agent@/);
assert.doesNotMatch(staging, /\. \.\/\.env|source .*\.env/);
assert.match(staging, /Verify public staging release/);
assert.match(staging, /DEPLOY_NODE_INTERPRETER="\$\{NODE_BIN\}"/);
assert.match(staging, /readlink -f "\/proc\/\$\{process_pid\}\/exe"/);

assert.match(remoteDeploy, /git -C "\$\{BASE_REPO\}" worktree add --detach/);
assert.match(remoteDeploy, /export PM2_HOME="\/root\/\.pm2"/);
assert.match(remoteDeploy, /NODE_RUNTIME_VERSION="24\.20\.0"/);
assert.match(remoteDeploy, /sha256sum --check --strict/);
assert.match(remoteDeploy, /export RECOVERY_AUTHORITY="local-postgres-os"/);
assert.match(remoteDeploy, /cleanup-stale-preflight "\$\{PREFLIGHT_ROOT\}" "\$\{RUN_INSTANCE\}"/);
assert.match(remoteDeploy, /DEPLOY_NODE_INTERPRETER="\$\{NODE_BIN\}"/);
assert.match(remoteDeploy, /PREVIOUS_INTERPRETER/);
assert.match(remoteDeploy, /readlink -f "\/proc\/\$\{PREVIOUS_PID\}\/exe"/);
assert.match(remoteDeploy, /assert_process_interpreter "\$\{PROCESS_NAME\}" "\$\{NODE_BIN\}"/);
assert.match(remoteDeploy, /previous production recovery/);
assert.match(remoteDeploy, /booting release candidate on private port/);
assert.match(remoteDeploy, /DEPLOY_PORT_OVERRIDE="5001"/);
assert.match(remoteDeploy, /DEPLOYMENT_VALIDATION="1"/);
assert.match(remoteDeploy, /private candidate health[^\n]+"stopped"/);
assert.match(remoteDeploy, /restoring coordinated production recovery point/);
assert.match(remoteDeploy, /start_previous_release/);
assert.match(remoteDeploy, /\.esg-current\.rollback\.\$\{RUN_INSTANCE\}/);
assert.match(remoteDeploy, /local reverse-proxy health/);
assert.match(remoteDeploy, /DEPLOYMENT_WRITE_LOCK_FILE/);
assert.match(remoteDeploy, /Persistent evidence storage is missing or unavailable/);
assert.match(remoteDeploy, /trap 'rollback_on_signal SIGHUP 129' HUP/);
assert.match(remoteDeploy, /trap 'rollback_on_signal SIGINT 130' INT/);
assert.match(remoteDeploy, /trap 'rollback_on_signal SIGTERM 143' TERM/);
assert.ok(
  remoteDeploy.lastIndexOf('rm -f "${WRITE_LOCK_FILE}"') > remoteDeploy.indexOf('local reverse-proxy health'),
  "the write pause must remain active through private, public and reverse-proxy health verification",
);
assert.ok(
  remoteDeploy.lastIndexOf("CUTOVER_COMMITTED=1") < remoteDeploy.lastIndexOf('rm -f "${WRITE_LOCK_FILE}"'),
  "the deployment must cross its no-rollback boundary before accepting writes",
);
assert.match(remoteDeploy, /if \[ "\$\{CUTOVER_COMMITTED\}" -eq 1 \]; then/);
assert.ok(
  remoteDeploy.indexOf('DEPLOY_STAGE="pausing production writes"')
    < remoteDeploy.indexOf('DEPLOY_STAGE="creating coordinated database and evidence recovery point"'),
  "production writes must pause before the coordinated recovery point is captured",
);
assert.ok(
  remoteDeploy.indexOf('DEPLOY_STAGE="creating coordinated database and evidence recovery point"')
    < remoteDeploy.indexOf('DEPLOY_STAGE="booting release candidate on private port"'),
  "the recovery point must complete before candidate migrations start",
);
assert.doesNotMatch(remoteDeploy, /\. \/[^\n]*\.env|source [^\n]*\.env/);
assert.match(recovery, /pg_restore/);
assert.match(recovery, /"--create", "--format=custom"/);
assert.match(recovery, /"--clean",\s+"--if-exists",\s+"--create",\s+"--exit-on-error"/);
assert.match(recovery, /createdb/);
assert.match(recovery, /SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user/);
assert.match(recovery, /DATABASE_URL is not loopback; refusing local PostgreSQL recovery authority/);
assert.match(recovery, /process\.getuid\(\) !== 0/);
assert.match(recovery, /\/usr\/sbin\/runuser/);
assert.match(recovery, /"\/usr\/bin\/env",\s+"-i"/);
assert.match(recovery, /Local PostgreSQL admin socket does not identify the DATABASE_URL cluster/);
assert.match(recovery, /"--owner", descriptor\.username/);
assert.match(recovery, /pg_control_system\(\)/);
assert.match(recovery, /inet_server_addr\(\)/);
assert.match(recovery, /setDatabaseConnectionLimit\(databaseUrl, database, 0, authority\)/);
assert.match(recovery, /Could not terminate all database sessions before recovery/);
assert.match(recovery, /Post-backup database objects survived recovery/);
assert.match(recovery, /restore-state\.json/);
assert.match(recovery, /state: "completed"/);
assert.match(recovery, /markRestoreCompleted\(backupDir, metadata, authority\)/);
assert.match(recovery, /Recovery restore marker does not match this checked recovery point/);
assert.match(recovery, /Recovery resume PostgreSQL system identifier changed/);
assert.match(recovery, /resolveRestoreIdentity\(runtime\.DATABASE_URL, backupDir, metadata, authority\)/);
assert.match(recovery, /recovery directory is outside its fixed root/);
assert.match(recovery, /Refusing to remove a symlinked preflight directory/);
assert.match(recovery, /Refusing to clean unsafe stale preflight entry/);
assert.doesNotMatch(recovery, /"--no-owner"|"--no-privileges"/);
assert.match(recovery, /evidence-manifest\.json/);
assert.match(recovery, /Insufficient disk headroom/);
assert.match(recovery, /duplicate emission-factor natural key/);

assert.match(ecosystem, /interpreter: nodeInterpreter/);
assert.equal(packageJson.engines.node, ">=24.12.0 <25");
assert.equal(packageJson.engines.npm, ">=11 <12");
assert.deepEqual(packageJson.allowScripts, {
  "bufferutil@4.1.0": true,
  "esbuild@0.25.12": true,
  "esbuild@0.27.2": true,
  fsevents: false,
});
assert.match(npmrc, /^engine-strict=true\s+strict-allow-scripts=true\s*$/);

assert.match(healthRoute, /releaseSha: process\.env\.RELEASE_SHA \|\| "unknown"/);
assert.match(startup, /DEPLOYMENT_WRITE_PAUSE/);
assert.match(routes, /process\.env\.DEPLOYMENT_VALIDATION !== "1"/);
assert.match(scheduler, /function deploymentWritesPaused\(\): boolean/);
assert.match(scheduler, /if \(deploymentWritesPaused\(\)\) return;/);
assert.match(startup, /!\["GET", "HEAD", "OPTIONS"\]\.includes\(req\.method\)/);
assert.match(startup, /FATAL: Could not create or validate super_admin_actions/);
assert.ok(
  startup.indexOf("ALTER COLUMN admin_user_id TYPE varchar") < startup.indexOf("const superAdminActionColumns"),
  "super-admin identifier migration must run before its fail-closed type validation",
);
assert.match(preflight, /Never run the mutating test commands.*against production/i);

console.log("deployment safety contract tests passed");
