# Repository Operating Instructions

These instructions apply to all Codex work in this repository. Follow them before any task-specific request unless the user explicitly overrides them.

## Autonomy Rules

- Work autonomously through investigation, implementation, and validation when the requested change is clear and safely scoped.
- Prefer small, focused changes that match existing architecture, naming, and test patterns.
- Preserve unrelated user or generated changes in the worktree. Do not revert, overwrite, reformat, or stage files outside the requested scope.
- Keep the user informed when work becomes long-running, risky, blocked, or likely to affect production behavior.
- Stop and ask for approval before taking destructive actions, changing deployment settings, modifying production data, or broadening scope beyond the original request.

## Deployment Rules

- Do not deploy from this repository unless the user explicitly asks for a deployment in the current conversation.
- Do not alter deployment configuration, secrets, environment variables, domains, build hooks, or infrastructure settings without explicit approval.
- Treat deployment-facing changes as high risk. Validate build behavior and document any required environment changes before handing off.
- Never assume a local validation run is equivalent to a production deployment check.

## Testing Expectations

- Run the narrowest reliable tests that cover the changed behavior.
- For shared server logic, permissions, reporting, routing, migrations, or schema changes, run the relevant API tests and any nearby regression tests.
- For user-facing UI changes, run the relevant browser or component tests when available, and verify layout in a browser when the visual behavior matters.
- For documentation-only changes, no automated tests are required unless the documentation affects generated output or developer tooling.
- If tests cannot be run, explain exactly what was not run and why.

## Migration Safety

- Treat database migrations as irreversible unless proven otherwise.
- Review migration SQL for data loss, locks, backfills, defaults, constraints, indexes, and compatibility with existing rows before running it.
- Do not edit a migration that may already have been applied outside the local development database. Create a follow-up migration instead.
- Do not run migrations against production, staging, or shared databases without explicit user approval.
- Prefer additive schema changes and backward-compatible rollout steps for production-facing work.

## Production Restrictions

- Never connect to, inspect, mutate, seed, truncate, or reset production data unless the user explicitly authorizes the exact operation.
- Never use production credentials, API keys, tokens, or connection strings in local test commands.
- Never commit secrets, local environment files, generated credentials, uploaded private files, or production data snapshots.
- Do not disable authentication, authorization, auditing, rate limits, or tenant isolation in production code paths unless the user explicitly approves the change and the risk is documented.

## Validation Requirements

- Validate behavior at the same layer where the risk lives: unit tests for isolated logic, API tests for contracts and permissions, browser tests for end-to-end flows, and build checks for packaging/type regressions.
- Confirm access control, tenant scoping, audit trails, and error handling when touching routes, reports, evidence, policies, users, or organization data.
- Confirm migrations and seed changes against a disposable non-production database before considering them ready.
- Before committing, review the diff and ensure only intended files are staged.

## Non-Production Database Policy

- Use only local, disposable, or explicitly provided non-production databases for development and validation.
- Test database names, ports, and credentials must make their non-production nature obvious.
- Keep seed data synthetic. Do not import customer, employee, supplier, financial, or regulated production data into local databases.
- Prefer creating or resetting a disposable database over reusing a shared one when validating migrations, permissions, reports, or destructive test cases.

## When To Stop And Ask For Approval

Stop and ask the user before:

- Running any command against production or a shared remote database.
- Applying, rolling back, editing, or deleting migrations that may affect shared environments.
- Deploying, changing infrastructure, or modifying deployment configuration.
- Installing new services, adding paid third-party dependencies, or changing external integrations.
- Taking destructive actions such as deleting files, dropping data, resetting branches, force-pushing, or rewriting history.
- Committing broad or unrelated changes that are already present in the worktree.
- Changing security-sensitive behavior, permissions, authentication, authorization, audit logging, or tenant boundaries in ways not explicitly requested.
- Continuing when requirements conflict, the target environment is ambiguous, or a safe assumption cannot be made.
