#!/usr/bin/env bash
set -Eeuo pipefail

BASE_REPO="/root/ESG"
RELEASES_ROOT="/root/esg-releases"
BACKUPS_ROOT="/root/esg-deploy-backups"
PREFLIGHT_ROOT="/root/esg-deploy-preflight"
RUNTIMES_ROOT="/root/esg-runtimes"
PROCESS_NAME="esg"
PRIVATE_PROCESS_NAME="esg-candidate"
PUBLIC_ORIGIN="https://www.simplyesg.co.uk"
NODE_RUNTIME_VERSION="24.20.0"
NODE_RUNTIME_ARCHIVE="node-v24.20.0-linux-x64.tar.xz"
NODE_RUNTIME_SHA256="2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2"
NODE_RUNTIME_ROOT="${RUNTIMES_ROOT}/node-v${NODE_RUNTIME_VERSION}-linux-x64"
NODE_BIN="${NODE_RUNTIME_ROOT}/bin/node"
NODE_NPM_CLI="${NODE_RUNTIME_ROOT}/lib/node_modules/npm/bin/npm-cli.js"
export PM2_HOME="/root/.pm2"
export RECOVERY_AUTHORITY="local-postgres-os"

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
  local pm2_process="${6:-}"
  local response_file
  response_file="$(mktemp)"
  for attempt in $(seq 1 45); do
    local curl_args=(--fail --silent --show-error --max-time 15 --output "${response_file}")
    if [ -n "${resolve_arg}" ]; then
      curl_args+=(--resolve "${resolve_arg}")
    fi
    if curl "${curl_args[@]}" "${url}" && HEALTH_FILE="${response_file}" EXPECTED_SHA="${expected_sha}" EXPECTED_SCHEDULER="${expected_scheduler}" "${NODE_BIN}" - <<'NODE'
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
  if [ "${pm2_process}" = "${PRIVATE_PROCESS_NAME}" ]; then
    safe_candidate_startup_log_tail
  elif [ -n "${pm2_process}" ]; then
    safe_pm2_process_summary "${pm2_process}"
  fi
  echo "::error::${name} did not become healthy" >&2
  return 1
}

safe_candidate_startup_log_tail() {
  # Keep deployment diagnostics useful without copying historical production
  # request data or unbounded PM2 output into the workflow log.
  # JavaScript template literals must remain literal to Bash.
  # shellcheck disable=SC2016
  pm2 logs "${PRIVATE_PROCESS_NAME}" --err --lines 80 --nostream 2>&1 | "${NODE_BIN}" -e '
let input = "";
process.stdin.on("data", chunk => {
  input = (input + chunk).slice(-65536);
}).on("end", () => {
  const categories = [
    [/framework catalogue reconciliation failed/i, "framework catalogue reconciliation failed"],
    [/required database indexes? (?:are )?missing|index reconciliation/i, "database index reconciliation failed"],
    [/permission denied/i, "database or filesystem permission denied"],
    [/password authentication failed/i, "database authentication failed"],
    [/ECONNREFUSED|connection refused/i, "dependency connection refused"],
    [/EADDRINUSE|address already in use/i, "candidate port already in use"],
    [/out of memory|heap limit/i, "candidate memory exhaustion"],
    [/\[Startup\] FATAL|\bFATAL\b/i, "uncategorised fatal startup error"],
  ];
  const matched = categories.filter(([pattern]) => pattern.test(input)).map(([, label]) => label);
  const summary = matched.length > 0 ? [...new Set(matched)].join("; ") : "no recognised safe category";
  process.stderr.write(`Candidate startup diagnostic categories: ${summary}\n`);
});
' || true
}

safe_pm2_process_summary() {
  local name="$1"
  # JavaScript template literals and optional chaining must remain literal to Bash.
  # shellcheck disable=SC2016
  pm2 jlist | PROCESS_NAME_TO_CHECK="${name}" "${NODE_BIN}" -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  try {
    const matches = JSON.parse(input).filter(entry => entry.name === process.env.PROCESS_NAME_TO_CHECK);
    const summary = matches.map(entry => ({
      name: entry.name,
      status: entry.pm2_env?.status ?? null,
      pid: entry.pid ?? null,
      cwd: entry.pm2_env?.pm_cwd ?? null,
      script: entry.pm2_env?.pm_exec_path ?? null,
      interpreter: entry.pm2_env?.exec_interpreter ?? null,
    }));
    process.stderr.write(`PM2 process summary: ${JSON.stringify(summary)}\n`);
  } catch {
    process.stderr.write("PM2 process summary unavailable: invalid jlist output\n");
    process.exitCode = 1;
  }
});
' || true
}

assert_process_interpreter() {
  local name="$1"
  local expected="$2"
  local expected_cwd="${3:-}"
  local expected_script="${4:-}"
  local process_details
  # JavaScript template literals and optional chaining must remain literal to Bash.
  # shellcheck disable=SC2016
  if ! process_details="$(pm2 jlist | PROCESS_NAME_TO_CHECK="${name}" "${NODE_BIN}" -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  const matches = JSON.parse(input).filter(entry => entry.name === process.env.PROCESS_NAME_TO_CHECK);
  if (matches.length !== 1) process.exit(1);
  const app = matches[0];
  if (app.pm2_env?.status !== "online" || !Number.isInteger(app.pid) || app.pid < 2) process.exit(1);
  process.stdout.write(`${app.pid}\n${app.pm2_env?.pm_cwd ?? ""}\n${app.pm2_env?.pm_exec_path ?? ""}\n`);
});
')"; then
    echo "::error::${name} does not have exactly one online PM2 process with a live PID" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  local -a process_identity
  mapfile -t process_identity <<< "${process_details}"
  local process_pid="${process_identity[0]:-}"
  local actual_cwd="${process_identity[1]:-}"
  local actual_script="${process_identity[2]:-}"
  if ! [[ "${process_pid}" =~ ^[0-9]+$ ]]; then
    echo "::error::${name} has an invalid PM2 PID" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  if [ -n "${expected_cwd}" ] && [ "${actual_cwd}" != "${expected_cwd}" ]; then
    echo "::error::${name} uses cwd ${actual_cwd}, expected ${expected_cwd}" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  if [ -n "${expected_script}" ] && [ "${actual_script}" != "${expected_script}" ]; then
    echo "::error::${name} uses script ${actual_script}, expected ${expected_script}" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  local actual
  if ! actual="$(readlink -f "/proc/${process_pid}/exe")"; then
    echo "::error::${name} interpreter could not be resolved from PID ${process_pid}" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  if [ ! -x "${actual}" ]; then
    echo "::error::${name} resolved interpreter is not executable: ${actual}" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  if [ "${actual}" != "${expected}" ]; then
    echo "::error::${name} is running under ${actual}, expected ${expected}" >&2
    safe_pm2_process_summary "${name}"
    return 1
  fi
  echo "${name} uses pinned interpreter ${expected}"
}

quiesce_processes_for_recovery() {
  local process_pids
  # JavaScript template literals must remain literal to Bash.
  # shellcheck disable=SC2016
  if ! process_pids="$(pm2 jlist | PRIVATE_PROCESS_NAME="${PRIVATE_PROCESS_NAME}" PROCESS_NAME="${PROCESS_NAME}" "${NODE_BIN}" -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  const names = new Set([process.env.PRIVATE_PROCESS_NAME, process.env.PROCESS_NAME]);
  const matches = JSON.parse(input).filter(entry => names.has(entry.name));
  for (const entry of matches) {
    if (Number.isInteger(entry.pid) && entry.pid > 1) process.stdout.write(`${entry.pid}\n`);
  }
});
')"; then
    echo "::error::Could not identify candidate processes before recovery" >&2
    safe_pm2_process_summary "${PRIVATE_PROCESS_NAME}"
    safe_pm2_process_summary "${PROCESS_NAME}"
    return 1
  fi

  local process
  for process in "${PRIVATE_PROCESS_NAME}" "${PROCESS_NAME}"; do
    if pm2 describe "${process}" >/dev/null 2>&1; then
      if ! pm2 delete "${process}" >/dev/null; then
        echo "::error::Could not delete ${process} before recovery" >&2
        safe_pm2_process_summary "${process}"
        return 1
      fi
    fi
  done

  local process_pid
  while IFS= read -r process_pid; do
    [ -n "${process_pid}" ] || continue
    if kill -0 "${process_pid}" 2>/dev/null; then
      echo "::error::Candidate PID ${process_pid} survived PM2 deletion; refusing database recovery" >&2
      return 1
    fi
  done <<< "${process_pids}"

  if ! pm2 jlist | PRIVATE_PROCESS_NAME="${PRIVATE_PROCESS_NAME}" PROCESS_NAME="${PROCESS_NAME}" "${NODE_BIN}" -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  const names = new Set([process.env.PRIVATE_PROCESS_NAME, process.env.PROCESS_NAME]);
  const matches = JSON.parse(input).filter(entry => names.has(entry.name));
  if (matches.length > 0) process.exit(1);
});
'; then
    echo "::error::PM2 still contains a candidate process definition; refusing database recovery" >&2
    safe_pm2_process_summary "${PRIVATE_PROCESS_NAME}"
    safe_pm2_process_summary "${PROCESS_NAME}"
    return 1
  fi
  echo "Candidate processes are quiescent before recovery"
}

persist_previous_release_state() {
  local rollback_link="/root/.esg-current.rollback.${RUN_INSTANCE}"
  if ! ln -s "${PREVIOUS_CWD}" "${rollback_link}"; then
    echo "::error::Could not stage the previous release pointer" >&2
    return 1
  fi
  if ! mv -Tf "${rollback_link}" /root/esg-current; then
    rm -f "${rollback_link}"
    echo "::error::Could not restore the previous release pointer" >&2
    return 1
  fi
  local current_target
  local previous_target
  if ! current_target="$(readlink -f /root/esg-current)" || ! previous_target="$(readlink -f "${PREVIOUS_CWD}")" || [ "${current_target}" != "${previous_target}" ]; then
    echo "::error::The restored release pointer does not resolve to ${PREVIOUS_CWD}" >&2
    return 1
  fi
  if ! pm2 save >/dev/null; then
    echo "::error::Could not persist the recovered PM2 process list" >&2
    return 1
  fi
  if ! PM2_DUMP="${PM2_HOME}/dump.pm2" EXPECTED_CWD="${PREVIOUS_CWD}" EXPECTED_SCRIPT="${PREVIOUS_SCRIPT}" EXPECTED_INTERPRETER="${PREVIOUS_INTERPRETER}" PROCESS_NAME="${PROCESS_NAME}" PRIVATE_PROCESS_NAME="${PRIVATE_PROCESS_NAME}" "${NODE_BIN}" -e '
const fs = require("node:fs");
const rows = JSON.parse(fs.readFileSync(process.env.PM2_DUMP, "utf8"));
const matches = rows.filter(entry => entry.name === process.env.PROCESS_NAME);
if (matches.length !== 1) process.exit(1);
const app = matches[0];
if (app.status !== "online") process.exit(1);
if (app.pm_cwd !== process.env.EXPECTED_CWD) process.exit(1);
if (app.pm_exec_path !== process.env.EXPECTED_SCRIPT) process.exit(1);
if (app.exec_interpreter !== process.env.EXPECTED_INTERPRETER) process.exit(1);
if (rows.some(entry => entry.name === process.env.PRIVATE_PROCESS_NAME)) process.exit(1);
'; then
    echo "::error::The saved PM2 state does not match the recovered previous release" >&2
    return 1
  fi
  echo "Previous release pointer and PM2 state were durably recovered"
}

start_previous_release() {
  if [ "${BACKUP_READY}" -eq 1 ]; then
    if pm2 describe "${PROCESS_NAME}" >/dev/null 2>&1 && ! pm2 delete "${PROCESS_NAME}" >/dev/null; then
      safe_pm2_process_summary "${PROCESS_NAME}"
      return 1
    fi
    if ! DEPLOY_PROCESS_NAME="${PROCESS_NAME}" pm2 start "${BACKUP_DIR}/rollback.ecosystem.config.cjs" --only "${PROCESS_NAME}" --update-env; then
      safe_pm2_process_summary "${PROCESS_NAME}"
      return 1
    fi
  elif pm2 describe "${PROCESS_NAME}" >/dev/null 2>&1; then
    if ! pm2 restart "${PROCESS_NAME}"; then
      safe_pm2_process_summary "${PROCESS_NAME}"
      return 1
    fi
  else
    echo "::error::${PROCESS_NAME} cannot be recovered before its coordinated recovery point is ready" >&2
    safe_pm2_process_summary "${PROCESS_NAME}"
    return 1
  fi
  if ! assert_process_interpreter "${PROCESS_NAME}" "${PREVIOUS_INTERPRETER}" "${PREVIOUS_CWD}" "${PREVIOUS_SCRIPT}"; then
    return 1
  fi
  wait_for_release "previous production recovery" "http://127.0.0.1:5000/health" "${PREVIOUS_SHA}" "running" "" "${PROCESS_NAME}"
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
    if ! rm -f "${WRITE_LOCK_FILE:-}"; then
      echo "::error::CRITICAL: cutover committed but the production write lock could not be removed" >&2
      exit 73
    fi
    echo "::error::Cutover was already committed; the candidate remains active and was not rolled back" >&2
    exit "${exit_code}"
  fi

  if [ "${OLD_STOPPED}" -eq 1 ]; then
    if [ "${MIGRATION_STARTED}" -eq 1 ] && [ "${BACKUP_READY}" -eq 1 ]; then
      if ! quiesce_processes_for_recovery; then
        echo "::error::CRITICAL: candidate processes could not be stopped; database/evidence recovery was not attempted" >&2
        exit 69
      fi
      DEPLOY_STAGE="restoring coordinated production recovery point"
      if ! "${NODE_BIN}" "${RECOVERY_HELPER}" restore "${CANDIDATE_DIR}/.env" "${BACKUP_DIR}"; then
        echo "::error::CRITICAL: automatic database/evidence restore failed; the previous application will remain stopped" >&2
        exit 70
      fi
    fi
    DEPLOY_STAGE="restarting previous production release"
    if ! start_previous_release; then
      echo "::error::CRITICAL: the previous production release could not be restarted" >&2
      exit 71
    fi
    if ! persist_previous_release_state; then
      echo "::error::CRITICAL: the previous release is live but its release pointer or PM2 state was not persisted" >&2
      exit 72
    fi
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
  if [ -n "${PREFLIGHT_DIR:-}" ] && [ "${PREFLIGHT_DIR}" = "${PREFLIGHT_ROOT}/${RUN_INSTANCE:-}/restore-rehearsal" ] && [ -d "${PREFLIGHT_DIR}" ]; then
    if [ -x "${NODE_BIN}" ]; then
      "${NODE_BIN}" "${RECOVERY_HELPER}" cleanup-preflight "${PREFLIGHT_DIR}" >/dev/null 2>&1 || true
    fi
  fi
  if [ "${DEPLOY_SUCCEEDED}" -ne 1 ] && [ "${CUTOVER_COMMITTED}" -eq 0 ] && [ -n "${CANDIDATE_DIR:-}" ]; then
    case "${CANDIDATE_DIR}" in
      "${RELEASES_ROOT}"/*) rm -f "${CANDIDATE_DIR}/.env" ;;
    esac
  fi
  if [ -n "${TOOLS_DIR:-}" ] && [ "${TOOLS_DIR}" = "/tmp/esg-deploy-tools.${RUN_INSTANCE:-}" ]; then
    rm -rf "${TOOLS_DIR}"
  fi
  if [ -n "${NODE_RUNTIME_TMP:-}" ] && [ -d "${NODE_RUNTIME_TMP}" ]; then
    rm -rf "${NODE_RUNTIME_TMP}"
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

for command in curl df flock git node pg_dump pg_restore psql createdb dropdb pm2 sha256sum tar; do
  command -v "${command}" >/dev/null || { echo "::error::Missing required command: ${command}" >&2; exit 1; }
done
test -d "${PM2_HOME}"
pm2 --version
test -d "${BASE_REPO}/.git"
exec 9>/root/esg-production-deploy.lock
if ! flock -n 9; then
  echo "::error::Another server-side production deployment is already active" >&2
  exit 1
fi

DEPLOY_STAGE="installing verified side-by-side Node runtime"
log "${DEPLOY_STAGE}"
test "$(uname -m)" = "x86_64" || { echo "::error::Pinned Node runtime requires x86_64" >&2; exit 1; }
NODE_RUNTIME_SOURCE="${TOOLS_DIR}/${NODE_RUNTIME_ARCHIVE}"
test -s "${NODE_RUNTIME_SOURCE}"
printf '%s  %s\n' "${NODE_RUNTIME_SHA256}" "${NODE_RUNTIME_SOURCE}" | sha256sum --check --strict
mkdir -p "${RUNTIMES_ROOT}"
chmod 700 "${RUNTIMES_ROOT}"
if [ ! -e "${NODE_RUNTIME_ROOT}" ]; then
  NODE_RUNTIME_TMP="${RUNTIMES_ROOT}/.node-v${NODE_RUNTIME_VERSION}.${RUN_INSTANCE}"
  test ! -e "${NODE_RUNTIME_TMP}"
  mkdir "${NODE_RUNTIME_TMP}"
  tar -xJf "${NODE_RUNTIME_SOURCE}" -C "${NODE_RUNTIME_TMP}" --strip-components=1
  test "$("${NODE_RUNTIME_TMP}/bin/node" --version)" = "v${NODE_RUNTIME_VERSION}"
  test -s "${NODE_RUNTIME_TMP}/lib/node_modules/npm/bin/npm-cli.js"
  mv "${NODE_RUNTIME_TMP}" "${NODE_RUNTIME_ROOT}"
  NODE_RUNTIME_TMP=""
fi
test -x "${NODE_BIN}"
test -s "${NODE_NPM_CLI}"
test "$("${NODE_BIN}" --version)" = "v${NODE_RUNTIME_VERSION}"
test "$("${NODE_BIN}" -p 'process.arch')" = "x64"
"${NODE_BIN}" "${NODE_NPM_CLI}" --version
"${NODE_BIN}" "${RECOVERY_HELPER}" cleanup-stale-preflight "${PREFLIGHT_ROOT}" "${RUN_INSTANCE}"

mapfile -t previous_process < <(pm2 jlist | "${NODE_BIN}" -e '
let input = "";
process.stdin.on("data", chunk => input += chunk).on("end", () => {
  const app = JSON.parse(input).find(entry => entry.name === "esg");
  if (!app || app.pm2_env?.status !== "online") process.exit(1);
  console.log(app.pm2_env.pm_cwd || "");
  console.log(app.pm2_env.pm_exec_path || "");
  console.log(app.pid || "");
});
')
PREVIOUS_CWD="${previous_process[0]:-}"
PREVIOUS_SCRIPT="${previous_process[1]:-}"
PREVIOUS_PID="${previous_process[2]:-}"
test -d "${PREVIOUS_CWD}"
test -f "${PREVIOUS_SCRIPT}"
test -s "${PREVIOUS_CWD}/.env"
[[ "${PREVIOUS_PID}" =~ ^[0-9]+$ ]]
PREVIOUS_INTERPRETER="$(readlink -f "/proc/${PREVIOUS_PID}/exe")"
test "${PREVIOUS_INTERPRETER#/}" != "${PREVIOUS_INTERPRETER}"
test -x "${PREVIOUS_INTERPRETER}"
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
"${NODE_BIN}" "${RUNTIME_HELPER}" capture "${PREVIOUS_CWD}/.env" "${PREVIOUS_EFFECTIVE_ENV}" "${PROCESS_NAME}"
"${NODE_BIN}" "${RUNTIME_HELPER}" merge "${REMOTE_ENV_PATH}" "${PREVIOUS_EFFECTIVE_ENV}" "${CANDIDATE_ENV}" "${PROCESS_NAME}"
"${NODE_BIN}" "${RECOVERY_HELPER}" capacity "${CANDIDATE_ENV}" "${EVIDENCE_LINK}" "${RELEASES_ROOT}" "${PREVIOUS_CWD}"
"${NODE_BIN}" "${RECOVERY_HELPER}" preflight "${CANDIDATE_ENV}"

DEPLOY_STAGE="building isolated release candidate"
log "${DEPLOY_STAGE}"
git -C "${BASE_REPO}" fetch --no-tags origin "${DEPLOY_SHA}"
git -C "${BASE_REPO}" worktree add --detach "${CANDIDATE_DIR}" "${DEPLOY_SHA}"
test "$(git -C "${CANDIDATE_DIR}" rev-parse HEAD)" = "${DEPLOY_SHA}"
mv "${CANDIDATE_ENV}" "${CANDIDATE_DIR}/.env"
chmod 600 "${CANDIDATE_DIR}/.env"

(
  cd "${CANDIDATE_DIR}"
  export PATH="${NODE_RUNTIME_ROOT}/bin:${PATH}"
  test "$(node --version)" = "v${NODE_RUNTIME_VERSION}"
  "${NODE_BIN}" "${NODE_NPM_CLI}" cache verify
  "${NODE_BIN}" "${NODE_NPM_CLI}" ci --include=dev
  # JavaScript template literals must remain literal to Bash.
  # shellcheck disable=SC2016
  "${NODE_BIN}" -e '["@vitejs/plugin-react", "class-variance-authority", "lodash/max", "recharts"].forEach(name => console.log(`${name} -> ${require.resolve(name)}`))'
  "${NODE_BIN}" "${NODE_NPM_CLI}" run build
  cp node_modules/connect-pg-simple/table.sql dist/table.sql
  mkdir -p uploads
  ln -s "$(realpath "${EVIDENCE_LINK}")" uploads/evidence
)

DEPLOY_STAGE="rehearsing database recovery while production remains online"
log "${DEPLOY_STAGE}"
"${NODE_BIN}" "${RECOVERY_HELPER}" create \
  "${CANDIDATE_DIR}/.env" "${PREVIOUS_EFFECTIVE_ENV}" "${PREFLIGHT_DIR}" "${EVIDENCE_LINK}" \
  "${PREVIOUS_SHA}" "${DEPLOY_SHA}" "${PREVIOUS_CWD}" "${PREVIOUS_SCRIPT}"
"${NODE_BIN}" "${RECOVERY_HELPER}" rehearse "${CANDIDATE_DIR}/.env" "${PREFLIGHT_DIR}" "${RUN_INSTANCE}"
"${NODE_BIN}" "${RECOVERY_HELPER}" cleanup-preflight "${PREFLIGHT_DIR}"

DEPLOY_STAGE="pausing production writes"
log "${DEPLOY_STAGE}"
: > "${WRITE_LOCK_FILE}"
chmod 600 "${WRITE_LOCK_FILE}"
OLD_STOPPED=1
pm2 stop "${PROCESS_NAME}"

DEPLOY_STAGE="creating coordinated database and evidence recovery point"
log "${DEPLOY_STAGE}"
"${NODE_BIN}" "${RECOVERY_HELPER}" create \
  "${CANDIDATE_DIR}/.env" "${PREVIOUS_EFFECTIVE_ENV}" "${BACKUP_DIR}" "${EVIDENCE_LINK}" \
  "${PREVIOUS_SHA}" "${DEPLOY_SHA}" "${PREVIOUS_CWD}" "${PREVIOUS_SCRIPT}"
cp "${RUNTIME_HELPER}" "${BACKUP_DIR}/runtime-env.cjs"
cp "${RECOVERY_HELPER}" "${BACKUP_DIR}/recovery-point.cjs"
chmod 600 "${BACKUP_DIR}/runtime-env.cjs" "${BACKUP_DIR}/recovery-point.cjs"
ROLLBACK_DIR="${BACKUP_DIR}" PREVIOUS_CWD="${PREVIOUS_CWD}" PREVIOUS_SCRIPT="${PREVIOUS_SCRIPT}" PREVIOUS_INTERPRETER="${PREVIOUS_INTERPRETER}" PREVIOUS_SHA="${PREVIOUS_SHA}" "${NODE_BIN}" - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const backup = process.env.ROLLBACK_DIR;
const content = `"use strict";
const fs = require("node:fs");
const { parseRuntimeEnv } = require("./runtime-env.cjs");
const env = parseRuntimeEnv(fs.readFileSync(__dirname + "/production.env", "utf8"));
module.exports = { apps: [{ name: "esg", script: ${JSON.stringify(process.env.PREVIOUS_SCRIPT)}, cwd: ${JSON.stringify(process.env.PREVIOUS_CWD)}, interpreter: ${JSON.stringify(process.env.PREVIOUS_INTERPRETER)}, env: { ...env, NODE_ENV: "production", RELEASE_SHA: ${JSON.stringify(process.env.PREVIOUS_SHA)} } }] };
`;
fs.writeFileSync(path.join(backup, "rollback.ecosystem.config.cjs"), content, { mode: 0o600 });
NODE
(
  cd "${BACKUP_DIR}"
  sha256sum runtime-env.cjs recovery-point.cjs rollback.ecosystem.config.cjs >> SHA256SUMS
)
chmod 600 "${BACKUP_DIR}/SHA256SUMS"
printf '%s\n' "${BACKUP_DIR}" > "${BACKUPS_ROOT}/latest"
BACKUP_READY=1

DEPLOY_STAGE="booting release candidate on private port"
log "${DEPLOY_STAGE}"
MIGRATION_STARTED=1
DEPLOY_PROCESS_NAME="${PRIVATE_PROCESS_NAME}" DEPLOY_PORT_OVERRIDE="5001" DEPLOYMENT_WRITE_LOCK_FILE="${WRITE_LOCK_FILE}" DEPLOYMENT_VALIDATION="1" \
  DEPLOY_NODE_INTERPRETER="${NODE_BIN}" pm2 start "${CANDIDATE_DIR}/ecosystem.config.cjs" --only "${PRIVATE_PROCESS_NAME}" --update-env
assert_process_interpreter "${PRIVATE_PROCESS_NAME}" "${NODE_BIN}" "${CANDIDATE_DIR}" "${CANDIDATE_DIR}/dist/index.cjs"
wait_for_release "private candidate health" "http://127.0.0.1:5001/health" "${DEPLOY_SHA}" "stopped" "" "${PRIVATE_PROCESS_NAME}"
curl --fail --silent --show-error --max-time 15 --output /dev/null "http://127.0.0.1:5001/"

DEPLOY_STAGE="switching production process to verified candidate"
log "${DEPLOY_STAGE}"
pm2 delete "${PRIVATE_PROCESS_NAME}"
pm2 delete "${PROCESS_NAME}"
DEPLOY_PROCESS_NAME="${PROCESS_NAME}" DEPLOY_PORT_OVERRIDE="5000" DEPLOYMENT_WRITE_LOCK_FILE="${WRITE_LOCK_FILE}" DEPLOY_NODE_INTERPRETER="${NODE_BIN}" \
  pm2 start "${CANDIDATE_DIR}/ecosystem.config.cjs" --only "${PROCESS_NAME}" --update-env
assert_process_interpreter "${PROCESS_NAME}" "${NODE_BIN}" "${CANDIDATE_DIR}" "${CANDIDATE_DIR}/dist/index.cjs"
wait_for_release "production process health" "http://127.0.0.1:5000/health" "${DEPLOY_SHA}" "running" "" "${PROCESS_NAME}"
curl --fail --silent --show-error --max-time 15 --output /dev/null "http://127.0.0.1:5000/"
wait_for_release \
  "local reverse-proxy health" \
  "${PUBLIC_ORIGIN}/health" \
  "${DEPLOY_SHA}" \
  "running" \
  "www.simplyesg.co.uk:443:127.0.0.1" \
  "${PROCESS_NAME}"

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
