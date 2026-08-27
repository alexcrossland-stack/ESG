# August 2026 SME Release Migration and Recovery Note

Release scope: promotion from production commit `a178ae2006be15edbf6e09eef46b0a4afa6a8f1b` to the approved `main` release.

## Forward changes

Application startup applies idempotent schema operations before accepting traffic:

- creates and validates `framework_response_source_type`;
- creates and validates `framework_requirement_responses` and its indexes;
- converts `super_admin_actions.admin_user_id`, `target_company_id`, and `target_user_id` to `varchar` and validates their resulting types;
- adds evidence attachment metadata where absent;
- changes defaults for company, factor and calculation records to the UK Government 2026 factor set/year without rewriting explicit historical selections.

The `super_admin_actions` conversion and framework-response schema now fail startup closed. Do not bypass a failure or manually edit production data during the deployment window.

## Mandatory recovery point

The production workflow must complete `Create production recovery point` before it uploads a candidate runtime environment or changes the checkout. It stores, on the production server only:

- a custom-format `pg_dump`, validated with `pg_restore --list`;
- a compressed archive of `uploads/evidence`;
- the previous runtime `.env`;
- previous and target SHAs plus SHA-256 checksums.

The workflow records the directory in its job summary and `/root/esg-deploy-backups/latest`. Secret values and database contents must not be copied into workflow logs or repository artifacts.

## Rollback decision

Preferred rollback is application-only: create a revert on `main`, pass the exact-commit release gate, confirm the previous code can run against the additive upgraded schema, then deploy normally. The new table, enum and defaults may remain.

Restore the database/evidence recovery point only if the migration corrupts or removes production data. A database restore discards all writes made after the backup timestamp and therefore requires an explicit incident owner and data-loss assessment.

## Post-deploy validation

Require all of the following before closing the deployment:

- public `/health` reports `status=ok`, `db=connected`, `scheduler=running`, and the exact approved release SHA;
- the public HTTPS app shell responds;
- startup logs show the framework schema validation and 2026 default reconciliation succeeded;
- an approved internal user can log in and access existing evidence and historical reports;
- email, AI and billing are checked only when their complete provider configuration is present.
