# August 2026 SME Release Migration and Recovery Note

Release scope: promotion from production commit `a178ae2006be15edbf6e09eef46b0a4afa6a8f1b` to the approved `main` release.

## Forward changes

Application startup applies idempotent schema operations before accepting traffic:

- creates and validates `framework_response_source_type`;
- creates and validates `framework_requirement_responses` and its indexes;
- converts `super_admin_actions.admin_user_id`, `target_company_id`, and `target_user_id` to `varchar` and validates their resulting types;
- adds evidence attachment metadata where absent;
- changes defaults for company, factor and calculation records to the UK Government 2026 factor set/year without rewriting explicit historical selections;
- transactionally reconciles and validates the required metric-definition, framework, requirement and mapping catalogues;
- transactionally upserts and validates exactly 11 canonical UK 2026 emission factors;
- adds a unique natural key on emission factors `(country, factor_year, name)`.

Schema conversion and all required catalogue validation now fail startup closed. Seeding uses transaction-scoped advisory locks and rolls back its own catalogue changes on failure. Do not bypass a failure or manually edit production data during the deployment window.

## Mandatory recovery point

The production workflow builds the candidate without changing the live checkout. While the previous app remains online, it takes a preliminary backup and fully restores that dump into a disposable database. It then pauses HTTP and scheduler writes and captures the final coordinated recovery point before candidate startup can migrate data. The private validation process keeps its scheduler dormant; the promoted process does not poll or enqueue jobs until the write lock is removed. It stores, on the production server only:

- a custom-format `pg_dump`, checksum validation and a successful disposable-database restore rehearsal using the same tooling;
- a compressed archive of the resolved evidence storage directory (not merely a symlink);
- a deterministic evidence file/byte manifest;
- the previous runtime `.env`;
- a PM2 rollback configuration, previous path/script, previous and target SHAs, and SHA-256 checksums.

The workflow records the directory under `/root/esg-deploy-backups` and in `/root/esg-deploy-backups/latest`. Secret values and database contents must not be copied into workflow logs or repository artifacts. The server-side release point is for rapid release recovery; a separate current off-host backup remains required for host/disk loss.

## Rollback decision

Application-only rollback to `a178ae2` is prohibited after catalogue reconciliation. That application reads multiple emission-factor years without a deterministic year filter and can therefore calculate with the wrong factor set after the 2026 rows are added.

Before the deployment write lock is removed, the workflow may automatically restore the final database/evidence recovery point and restart the previous app because no user writes were accepted in that window. After the lock is removed, restoration discards all writes made after the backup timestamp and therefore requires an explicit incident owner and data-loss assessment. Follow [backup-restore.md](../backup-restore.md) and never start the previous app until the matching restore succeeds.

## Post-deploy validation

Require all of the following before closing the deployment:

- public `/health` reports `status=ok`, `db=connected`, `scheduler=running`, and the exact approved release SHA;
- the public HTTPS app shell responds;
- startup logs show the framework schema validation and 2026 default reconciliation succeeded;
- startup logs show metric, framework and emission-factor catalogues reconciled and validated;
- an approved internal user can log in and access existing evidence and historical reports;
- email, AI and billing are checked only when their complete provider configuration is present.
