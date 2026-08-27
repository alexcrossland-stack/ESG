#!/usr/bin/env bash
set -Eeuo pipefail

BASE_REPO="/root/ESG"
RELEASES_ROOT="/root/esg-releases"
BACKUPS_ROOT="/root/esg-deploy-backups"
PREFLIGHT_ROOT="/root/esg-deploy-preflight"
PROCESS_NAME="esg"
PRIVATE_PROCESS_NAME="esg-candidate"
PUBLIC_ORIGIN="https://www.simplyesg.co.uk"

DEPLOY_STAGE="initialising"
OLD_STOPPED=0
BACKUP_READY=0
MIGRATION_STARTED=0
DEPLOY_SUCCEEDED=0
ROLLBACK_IN_PROGRESS=0
CUTOVER_COMMITTED=0

log() {
  echo
  echo "==> $1"
}

require_full_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] || {
    echo "::error::$2 must be a full Git commit SHA" >&2
    return 1
  }
}

wait_for_release() {
  local name="$1"
  local url="$2"
  local expected_sha="$3"
  local expected_scheduler="${4:-running}"
  local resolve_arg="${5:-}"
  local response_file
  response_file="$(mktemp)"
  for attempt in $(seq 1 45); do
    local curl_args=(--fail --silent --show-error --max-time 15 --output "${response_file}")
    if [ -n "${resolve_arg}" ]; then
      curl_args+=(--resolve "${resolve_arg}")
    fi
    if curl "${curl_args[@]}" "${url}" && HEALTH_FILE="${response_file}" EXPECTED_SHA="${expected_sha}" EXPECTED_SCHEDULER="${expected_scheduler}" node - <<'NODE'
const fs = require("node:fs");
const health = JSON.parse(fs.readFileSync(process.env.HEALTH_FILE, "utf8"));
if (health.db !== "connected") process.exit(1);
if (health.scheduler !== process.env.EXPECTED_SCHEDULER) process.exit(1);
if (process.env.EXPECTED_SCHEDULER === "running" && health.status !== "ok") process.exit(1);
if (process.env.EXPECTED_SCHEDULER === "stopped" && health.status !== "degraded") process.exit(1);
if (health.releaseSha !== process.env.EXPECTED_SHA) process.exit(1);
const timestamp = Date.parse(health.timestamp);
if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 300000) process.exit(1);
NODE
    then
      rm -f "${response_file}"
      echo "${name} confirms release ${expected_sha}"
      return 0
    fi
    echo "${name} not ready (${attempt}/45); retrying in 2 seconds"
    sleep 2
  done
  rm -f "${response_file}"
  echo "::error::${name} did not become healthy" >&2
  return 1
}

start_previous_release() {
  if pm2 describe "${PROCESS_NAME}" >/dev/null 2>&1; then
    pm2 restart "${PROCESS_NAME}"
  else
    DEPLOY_PROCESS_NAME="${PROCESS_NAME}" pm2 start "${BACKUP_DIR}/rollback.ecosystem.cjs" --only "${PROCESS_NAME}" --update-env
  fi
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:5000/health" >/dev/null; then
      echo "Previous production release restarted"
      return 0
    fi
    sleep 2
  done
  echo "::error::Previous production release did not recover" >&2
  return 1
}

handle_failure() {
  local exit_code="$1"
  local reason="$2"
  if [ "${ROLLBACK_IN_PROGRESS}" -eq 1 ]; then
    exit "${exit_code}"
  fi
  ROLLBACK_IN_PROGRESS=1
  trap - ERR HUP INT TERM
  set +e
  echo "::error::Deployment interrupted by ${reason} during: ${DEPLOY_STAGE}" >&2

  # Once the new PM2 state and release pointer are durably recorded, accepting
  # writes on the new release is the only safe direction. A signal in the tiny
  # lock-removal window must never restore an older database underneath it.
  if [ "${CUTOVER_COMMITTED}" -eq 1 ]; then
    rm -f "${WRITE_LOCK_FILE:-}"
    echo "::error::Cutover was already committed; the candidate remains active and was not rolled back" >&2
    exit "${exit_code}"
  fi

  pm2 delete "${PRIVATE_PROCESS_NAME}" >/dev/null 2>&1

  if [ "${OLD_STOPPED}" -eq 1 ]; then
    if [ "${MIGRATION_STARTED}" -eq 1 ] && [ "${BACKUP_READY}" -eq 1 ]; then
      pm2 delete "${PROCESS_NAME}" >/dev/null 2>&1
      DEPLOY_STAGE="restoring coordinated production recovery point"
      if ! node "${RECOVERY_HELPER}" restore "${CANDIDATE_DIR}/.env" "${BACKUP_DIR}"; then
        echo "::error::CRITICAL: automatic database/evidence restore failed; the previous application will remain stopped" >&2
        exit 70
      fi
    fi
    DEPLOY_STAGE="restarting previous production release"
    if ! start_previous_release; then
      echo "::error::CRITICAL: the previous production release could not be restarted" >&2
      exit 71
    fi
    rollback_link="/root/.esg-current.rollback.${RUN_INSTANCE}"
    ln -s "${PREVIOUS_CWD}" "${rollback_link}"
    mv -Tf "${rollback_link}" /root/esg-current
    pm2 save >/dev/null 2>&1
  fi

  exit "${exit_code}"
}

rollback_on_error() {
  local exit_code=$?
  handle_failure "${exit_code}" "command failure"
}

rollback_on_signal() {
  local signal_name="$1"
  local exit_code="$2"
  handle_failure "${exit_code}" "${signal_name}"
}

cleanup() {
  rm -f "${REMOTE_ENV_PATH:-}"
  if [ -n "${PREVIOUS_EFFECTIVE_ENV:-}" ]; then
    rm -f "${PREVIOUS_EFFECTIVE_ENV}"
  fi
  if [ "${DEPLOY_SUCCEEDED}" -eq 1 ]; then
    rm -rf "${TOOLS_DIR}"
  fi
}

trap rollback_on_error ERR
trap 'rollback_on_signal SIGHUP 129' HUP
trap 'rollback_on_signal SIGINT 130' INT
trap 'rollback_on_signal SIGTERM 143' TERM
trap cleanup EXIT

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
: "${REMOTE_ENV_PATH:?REMOTE_ENV_PATH is required}"
: "${TOOLS_DIR:?TOOLS_DIR is required}"

RUNTIME_HELPER="${TOOLS_DIR}/runtime-env.cjs"
RECOVERY_HELPER="${TOOLS_DIR}/recovery-point.cjs"
require_full_sha "${DEPLOY_SHA}" "DEPLOY_SHA"
[[ "${GITHUB_RUN_ID}" =~ ^[0-9]+$ ]] || { echo "::error::GITHUB_RUN_ID must be numeric" >&2; exit 1; }
[[ "${GITHUB_RUN_ATTEMPT}" =~ ^[0-9]+$ ]] || { echo "::error::GITHUB_RUN_ATTEMPT must be numeric" >&2; exit 1; }
RUN_INSTANCE="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
test "${TOOLS_DIR}" = "/tmp/esg-deploy-tools.${RUN_INSTANCE}" || {
  echo "::error::TOOLS_DIR is outside the isolated deployment path" >&2
  exit 1
}
test -s "${RUNTIME_HELPER}"
test -s "${RECOVERY_HELPER}"
test -s "${REMOTE_ENV_PATH}"

for command in curl df flock git node npm pg_dump pg_restore psql createdb dropdb pm2 sha256sum tar; do
  command -v "${command}" >/dev/null || { echo "::error::Missing required command: ${command}" >&2; exit 1; }
done
test -d "${BASE_REPO}/.git"
exec 9>/root/esg-production-deploy.lock
if ! flock -n 9; then
  echo "::error::Another server-side production deployment is already active" >&2
  exit 1
fi

mapfile -t previous_process < <(pm2 jlist | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  const app = JSON.parse(input).find(entry => entry.name === "esg");
  if (!app || app.pm2_env?.status !== "online") process.exit(1);
  console.log(app.pm2_env.pm_cwd || "");
  console.log(app.pm2_env.pm_exec_path || "");
});
')
PREVIOUS_CWD="${previous_process[0]:-}"
PREVIOUS_SCRIPT="${previous_process[1]:-}"
test -d "${PREVIOUS_CWD}"
test -f "${PREVIOUS_SCRIPT}"
test -s "${PREVIOUS_CWD}/.env"
PREVIOUS_SHA="$(git -C "${PREVIOUS_CWD}" rev-parse HEAD)"
require_full_sha "${PREVIOUS_SHA}" "previous production SHA"

CANDIDATE_DIR="${RELEASES_ROOT}/${RUN_INSTANCE}-${DEPLOY_SHA:0:12}"
CANDIDATE_ENV="${PREFLIGHT_ROOT}/${RUN_INSTANCE}/candidate.env"
PREVIOUS_EFFECTIVE_ENV="${PREFLIGHT_ROOT}/${RUN_INSTANCE}/previous-effective.env"
PREFLIGHT_DIR="${PREFLIGHT_ROOT}/${RUN_INSTANCE}/restore-rehearsal"
BACKUP_DIR="${BACKUPS_ROOT}/${RUN_INSTANCE}-${PREVIOUS_SHA:0:12}"
EVIDENCE_LINK="${PREVIOUS_CWD}/uploads/evidence"
WRITE_LOCK_FILE="${PREFLIGHT_ROOT}/${RUN_INSTANCE}/writes.lock"

mkdir -p "${RELEASES_ROOT}" "$(dirname "${CANDIDATE_ENV}")" "${BACKUPS_ROOT}"
chmod 700 "${RELEASES_ROOT}" "${PREFLIGHT_ROOT}" "${BACKUPS_ROOT}"
if [ ! -d "${EVIDENCE_LINK}" ]; then
  echo "::error::Persistent evidence storage is missing or unavailable at ${EVIDENCE_LINK}" >&2
  exit 1
fi

DEPLOY_STAGE="validating runtime configuration without shell evaluation"
log "${DEPLOY_STAGE}"
node "${RUNTIME_HELPER}" capture "${PREVIOUS_CWD}/.env" "${PREVIOUS_EFFECTIVE_ENV}" "${PROCESS_NAME}"
node "${RUNTIME_HELPER}" merge "${REMOTE_ENV_PATH}" "${PREVIOUS_EFFECTIVE_ENV}" "${CANDIDATE_ENV}" "${PROCESS_NAME}"
node "${RECOVERY_HELPER}" capacity "${CANDIDATE_ENV}" "${EVIDENCE_LINK}" "${RELEASES_ROOT}" "${PREVIOUS_CWD}"
node "${RECOVERY_HELPER}" preflight "${CANDIDATE_ENV}"

DEPLOY_STAGE="building isolated release candidate"
log "${DEPLOY_STAGE}"
git -C "${BASE_REPO}" fetch --no-tags origin "${DEPLOY_SHA}"
git -C "${BASE_REPO}" worktree add --detach "${CANDIDATE_DIR}" "${DEPLOY_SHA}"
test "$(git -C "${CANDIDATE_DIR}" rev-parse HEAD)" = "${DEPLOY_SHA}"
mv "${CANDIDATE_ENV}" "${CANDIDATE_DIR}/.env"
chmod 600 "${CANDIDATE_DIR}/.env"

(
  cd "${CANDIDATE_DIR}"
  npm cache verify
  npm ci --include=dev
  # JavaScript template literals must remain literal to Bash.
  # shellcheck disable=SC2016
  node -e '["@vitejs/plugin-react", "class-variance-authority", "lodash/max", "recharts"].forEach(name => console.log(`${name} -> ${require.resolve(name)}`))'
  npm run build
  cp node_modules/connect-pg-simple/table.sql dist/table.sql
  mkdir -p uploads
  ln -s "$(realpath "${EVIDENCE_LINK}")" uploads/evidence
)

DEPLOY_STAGE="rehearsing database recovery while production remains online"
log "${DEPLOY_STAGE}"
node "${RECOVERY_HELPER}" create \
  "${CANDIDATE_DIR}/.env" "${PREVIOUS_EFFECTIVE_ENV}" "${PREFLIGHT_DIR}" "${EVIDENCE_LINK}" \
  "${PREVIOUS_SHA}" "${DEPLOY_SHA}" "${PREVIOUS_CWD}" "${PREVIOUS_SCRIPT}"
node "${RECOVERY_HELPER}" rehearse "${CANDIDATE_DIR}/.env" "${PREFLIGHT_DIR}" "${RUN_INSTANCE}"
node "${RECOVERY_HELPER}" cleanup-preflight "${PREFLIGHT_DIR}"

DEPLOY_STAGE="pausing production writes"
log "${DEPLOY_STAGE}"
: > "${WRITE_LOCK_FILE}"
chmod 600 "${WRITE_LOCK_FILE}"
OLD_STOPPED=1
pm2 stop "${PROCESS_NAME}"

DEPLOY_STAGE="creating coordinated database and evidence recovery point"
log "${DEPLOY_STAGE}"
node "${RECOVERY_HELPER}" create \
  "${CANDIDATE_DIR}/.env" "${PREVIOUS_EFFECTIVE_ENV}" "${BACKUP_DIR}" "${EVIDENCE_LINK}" \
  "${PREVIOUS_SHA}" "${DEPLOY_SHA}" "${PREVIOUS_CWD}" "${PREVIOUS_SCRIPT}"
cp "${RUNTIME_HELPER}" "${BACKUP_DIR}/runtime-env.cjs"
cp "${RECOVERY_HELPER}" "${BACKUP_DIR}/recovery-point.cjs"
chmod 600 "${BACKUP_DIR}/runtime-env.cjs" "${BACKUP_DIR}/recovery-point.cjs"
ROLLBACK_DIR="${BACKUP_DIR}" PREVIOUS_CWD="${PREVIOUS_CWD}" PREVIOUS_SCRIPT="${PREVIOUS_SCRIPT}" node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const backup = process.env.ROLLBACK_DIR;
const content = `"use strict";
const fs = require("node:fs");
const { parseRuntimeEnv } = require("./runtime-env.cjs");
const env = parseRuntimeEnv(fs.readFileSync(__dirname + "/production.env", "utf8"));
module.exports = { apps: [{ name: "esg", script: ${JSON.stringify(process.env.PREVIOUS_SCRIPT)}, cwd: ${JSON.stringify(process.env.PREVIOUS_CWD)}, env: { ...env, NODE_ENV: "production" } }] };
`;
fs.writeFileSync(path.join(backup, "rollback.ecosystem.cjs"), content, { mode: 0o600 });
NODE
(
  cd "${BACKUP_DIR}"
  sha256sum runtime-env.cjs recovery-point.cjs rollback.ecosystem.cjs >> SHA256SUMS
)
chmod 600 "${BACKUP_DIR}/SHA256SUMS"
printf '%s\n' "${BACKUP_DIR}" > "${BACKUPS_ROOT}/latest"
BACKUP_READY=1

DEPLOY_STAGE="booting release candidate on private port"
log "${DEPLOY_STAGE}"
MIGRATION_STARTED=1
DEPLOY_PROCESS_NAME="${PRIVATE_PROCESS_NAME}" DEPLOY_PORT_OVERRIDE="5001" DEPLOYMENT_WRITE_LOCK_FILE="${WRITE_LOCK_FILE}" DEPLOYMENT_VALIDATION="1" \
  pm2 start "${CANDIDATE_DIR}/ecosystem.config.cjs" --only "${PRIVATE_PROCESS_NAME}" --update-env
wait_for_release "private candidate health" "http://127.0.0.1:5001/health" "${DEPLOY_SHA}" "stopped"
curl --fail --silent --show-error --max-time 15 --output /dev/null "http://127.0.0.1:5001/"

DEPLOY_STAGE="switching production process to verified candidate"
log "${DEPLOY_STAGE}"
pm2 delete "${PRIVATE_PROCESS_NAME}"
pm2 delete "${PROCESS_NAME}"
DEPLOY_PROCESS_NAME="${PROCESS_NAME}" DEPLOY_PORT_OVERRIDE="5000" DEPLOYMENT_WRITE_LOCK_FILE="${WRITE_LOCK_FILE}" \
  pm2 start "${CANDIDATE_DIR}/ecosystem.config.cjs" --only "${PROCESS_NAME}" --update-env
wait_for_release "production process health" "http://127.0.0.1:5000/health" "${DEPLOY_SHA}" "running"
curl --fail --silent --show-error --max-time 15 --output /dev/null "http://127.0.0.1:5000/"
wait_for_release \
  "local reverse-proxy health" \
  "${PUBLIC_ORIGIN}/health" \
  "${DEPLOY_SHA}" \
  "running" \
  "www.simplyesg.co.uk:443:127.0.0.1"

DEPLOY_STAGE="recording atomic release pointer"
log "${DEPLOY_STAGE}"
current_link="/root/.esg-current.${RUN_INSTANCE}"
ln -s "${CANDIDATE_DIR}" "${current_link}"
mv -Tf "${current_link}" /root/esg-current
pm2 save

CUTOVER_COMMITTED=1
rm -f "${WRITE_LOCK_FILE}"
DEPLOY_SUCCEEDED=1
trap - ERR HUP INT TERM
log "deployment completed"
echo "Previous SHA: ${PREVIOUS_SHA}"
echo "Target SHA: ${DEPLOY_SHA}"
echo "Recovery point: ${BACKUP_DIR}"
