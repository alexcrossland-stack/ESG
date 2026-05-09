# Site-Scoped Data Entry QA Matrix

## Goal

Prevent cross-site leakage and ambiguous persistence for Data Entry, Evidence, and Report History while keeping nullable `site_id` as the organisation-wide scope.

## Automated Coverage Added

`tests/api/site-scoped-data.test.ts` covers:

- Site A, Site B, and organisation-wide values for the same metric and period remain isolated.
- Site-scoped Data Entry reads exclude organisation-wide values unless `siteId=null` is explicitly requested.
- Omitted `siteId` reads can return all scopes for aggregation-style views.
- Evidence uploads are isolated for organisation-wide, specific site, and all-scope coverage reads.
- Ambiguous writes fail when active sites exist: metric save, evidence upload, raw-data save, and recalculation.
- Foreign tenant `siteId` values are rejected on scoped reads/writes and adjacent report/score/metric-definition read endpoints.

## Manual QA Matrix

| Scenario | Setup | Action | Expected result |
| --- | --- | --- | --- |
| Org-wide only tenant | Tenant has no active sites | Enter metric data and upload evidence | No site selector blocks the flow; records persist with `site_id = null`; reports generate organisation-wide |
| Multi-site tenant | Tenant has Site A and Site B active | Save the same metric/period under Site A and Site B | Site A reads show only Site A value; Site B reads show only Site B value; organisation-wide read shows only `site_id = null` |
| Mixed org-wide + site-scoped reporting | Same metric/period has org-wide, Site A, and Site B rows | Generate site report, organisation-wide report, and all-scope history/readiness views | Site report uses the selected site only; organisation-wide report excludes site-specific rows where applicable; all-scope views aggregate intentionally |
| Evidence uploads | Active sites exist | Upload evidence for org-wide, Site A, and Site B | Upload requires explicit scope; each evidence list/coverage filter returns only the selected scope, and all-scope coverage includes all three |
| Report history rendering | Generate a site-scoped report | Open Report History and filter by site | Report row shows `siteName`/country metadata and no reports from other tenant sites |

## Endpoint Ownership Checks

Explicit `validateSiteOwnership` coverage is expected for site-scoped Data Entry, raw data, recalculation, Evidence, Reports, report preflight, ESG score reads, and metric-definition value reads. Foreign tenant site IDs should return a scoped ownership error before querying or persisting data.

## Index Coverage

Confirmed in schema, migration, and runtime index bootstrap:

- `metric_values(metric_id, site_id)`
- `metric_values(metric_id, reporting_period_id, site_id)`
- `raw_data_inputs(company_id, reporting_period_id, site_id)`
- `raw_data_inputs(company_id, period, site_id)`
- `evidence_files(company_id, site_id, linked_period)`
- `evidence_files(linked_module, linked_entity_id, site_id)`
- `report_runs(company_id, site_id, generated_at)`

## Scope Ambiguity Hardening

- Product paths no longer call implicit `storage.getMetricValues(metricId)` reads. They use `getMetricValuesForMetric(companyId, metricId, scope)` with an explicit `all`, `organisation`, or `site` scope.
- Report export paths validate requested site ownership and pass explicit scope into metric value reads. Date-range exports still loop by metric, but each read declares the selected scope.
- Direct metric evidence paths require or pass scope context in multi-site flows. `metric_value` evidence remains safe because the metric value ID is already scoped, and direct `metric` evidence now supports `siteId=null`, a specific site, or `siteId=__all__`.
- Reports readiness detail is scope-aware. The API returns `scope` and `scopeLabel`, and the Reports UI displays the selected readiness scope.

## UX Ambiguity Watchlist

- “Organisation-wide” means only `site_id = null`; “All scopes” means org-wide plus every active site. Keep both labels visible wherever both modes exist.
- Default selector state should never silently save to a site. Data Entry and Evidence now require an explicit org-wide or site scope when active sites exist.
- Switching scope mid-edit can discard unsaved local edits because the page reloads scoped values. Add a dirty-state confirmation if this becomes a recurring user pain point.
- Evidence attached from a metric row inherits the current Data Entry scope; standalone evidence requires explicit scope. A small scope badge on attachment actions would further reduce wrong-scope uploads.
