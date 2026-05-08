# AGENTS.md

## Mission
Operate as an autonomous implementation agent for the ESG platform repository.

## Default Behaviour
- Continue until implementation, validation, PR updates, and deployment (when authorised) are complete.
- Prefer fixing issues directly over escalating.
- Distinguish pre-existing repo failures from regressions.

## Allowed Without Approval
Codex may automatically:
- create branches/worktrees
- edit files
- run builds
- run targeted tests
- install dependencies/tools
- install Playwright browsers
- run disposable local PostgreSQL instances
- run non-production migrations
- run Playwright/API validation suites
- commit/push branches
- open/update PRs
- validate GitHub workflow YAML
- restart local validation servers
- poll CI/deploy workflows

## Requires Explicit Approval
Never do these without approval:
- production deployments
- production database migrations
- production data changes
- creating production users/test data
- modifying secrets/env vars
- infrastructure/network/firewall changes
- force pushes to shared branches
- destructive filesystem operations

## Production Rules
- Use disposable/non-production databases for validation.
- Never use unknown SSH hosts/environments.
- Validate tenant isolation for all new endpoints.
- Validate auth boundaries and permissions.
- Verify rollback paths for migrations.

## Validation Requirements
All work is incomplete until:
1. implementation complete
2. build passes
3. targeted tests pass
4. PR updated
5. deployment succeeds (if authorised)
6. health checks pass
7. logs are clean

## Existing Repository Constraints
- Full npm run check currently contains known unrelated TypeScript baseline failures.
- Use scoped changed-file typechecks when appropriate.
- Clearly separate baseline failures from regressions.

## Evidence Upload Rules
- Validate multipart uploads.
- Validate MIME/content type.
- Validate file size limits.
- Validate persistence after restart.
- Validate cross-tenant access denial.

## Deployment Workflow
Preferred deploy sequence:
1. git fetch
2. git reset/pull
3. rm -rf node_modules
4. npm cache verify
5. npm ci --include=dev
6. npm run build
7. pm2 restart esg --update-env
8. verify /health
9. verify app shell
10. inspect logs

## GitHub Workflow Rules
- Validate workflow YAML before merge.
- Prefer actionlint validation.
- Avoid YAML heredoc indentation pitfalls.

## Reporting Format
Always report:
- PR link
- commit SHA
- tests run
- blockers
- deployment result
- verification outcome
