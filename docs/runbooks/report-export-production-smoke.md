# Report Export Production Smoke

Use this checklist after report/export changes are deployed and an approved internal smoke tenant is available. Do not create temporary production tenants for this smoke.

## PR #23 Status

- Deployment: successful
- Merge commit: `06c8a77ccbbbb1022709543d92e2f8aa208a0727`
- Deploy run: `Deploy to Hetzner` #112
- Production health: passed (`/health` returned `ok`, DB connected)
- Authenticated export smoke: pending approved internal smoke tenant credentials/token

## Required Inputs

- `SMOKE_AUTH_TOKEN`: bearer token for an internal/non-customer test user with `generate_report` permission
- Tenant/company: approved internal smoke tenant only
- `SMOKE_PERIOD`: reporting period containing deterministic metric values
- `SMOKE_SITE_A_ID`: optional, existing active Site A ID for site-scoped checks
- `SMOKE_SITE_B_ID`: optional, existing active Site B ID for site-scoped checks
- Existing metric data:
  - organisation-wide metric value for `SMOKE_PERIOD`
  - Site A metric value for `SMOKE_PERIOD`
  - Site B metric value for `SMOKE_PERIOD`
  - evidence coverage suitable for the expected export assertions
- Optional `SMOKE_EXPECTATIONS_JSON`: deterministic metric/value assertions for source-data and DOCX content

The default script mode is read-only and calls only `GET /api/reports/export-data/esg_metrics_summary`. Full DOCX validation calls `POST /api/reports/export/esg_metrics_summary`; that endpoint does not create report records or files, but it does write an `audit_logs` entry for `export_report`.

## Read-Only Source-Data Smoke

```bash
BASE_URL="https://esgmanager.app" \
SMOKE_AUTH_TOKEN="<approved-internal-smoke-token>" \
SMOKE_PERIOD="<period>" \
SMOKE_SITE_A_ID="<site-a-id>" \
SMOKE_SITE_B_ID="<site-b-id>" \
node scripts/report-export-smoke.mjs
```

Expected result:

- Organisation-wide export-data returns only `siteId=null` rows
- Site A export-data returns only Site A rows
- Site B export-data returns only Site B rows
- All scopes export-data includes organisation-wide and site-scoped rows intentionally
- Period metadata matches `SMOKE_PERIOD`
- Site metadata matches the supplied site IDs

## Deterministic Assertion Mode

Use `SMOKE_EXPECTATIONS_JSON` when the internal smoke tenant has known metric IDs and values.

```bash
BASE_URL="https://esgmanager.app" \
SMOKE_AUTH_TOKEN="<approved-internal-smoke-token>" \
SMOKE_PERIOD="2025-01" \
SMOKE_SITE_A_ID="<site-a-id>" \
SMOKE_SITE_B_ID="<site-b-id>" \
SMOKE_EXPECTATIONS_JSON='{
  "org": {
    "expectedRows": [
      { "metricId": "<org-metric-id>", "value": 101.5, "siteId": null }
    ],
    "absentValues": [202.25, 303.75]
  },
  "siteA": {
    "expectedRows": [
      { "metricId": "<shared-metric-id>", "value": 202.25, "siteId": "<site-a-id>" }
    ],
    "absentValues": [101.5, 303.75]
  },
  "siteB": {
    "expectedRows": [
      { "metricId": "<shared-metric-id>", "value": 303.75, "siteId": "<site-b-id>" }
    ],
    "absentValues": [101.5, 202.25]
  },
  "all": {
    "expectedRows": [
      { "metricId": "<shared-metric-id>", "value": 101.5 },
      { "metricId": "<shared-metric-id>", "value": 202.25 },
      { "metricId": "<shared-metric-id>", "value": 303.75 }
    ]
  }
}' \
node scripts/report-export-smoke.mjs
```

## Full Export Smoke

Run this only against the approved internal smoke tenant because it records an `export_report` audit log entry.

```bash
BASE_URL="https://esgmanager.app" \
SMOKE_AUTH_TOKEN="<approved-internal-smoke-token>" \
SMOKE_PERIOD="<period>" \
SMOKE_SITE_A_ID="<site-a-id>" \
SMOKE_SITE_B_ID="<site-b-id>" \
SMOKE_RUN_BINARY_EXPORTS=1 \
SMOKE_EXPECTATIONS_JSON='{
  "org": {
    "docxIncludes": ["Reporting Period <period>", "101.50", "Evidence Coverage"],
    "docxExcludes": ["202.25", "303.75"]
  },
  "siteA": {
    "docxIncludes": ["202.25", "Evidence Coverage"],
    "docxExcludes": ["101.50", "303.75"]
  },
  "siteB": {
    "docxIncludes": ["303.75", "Evidence Coverage"],
    "docxExcludes": ["101.50", "202.25"]
  },
  "all": {
    "docxIncludes": ["all active sites and organisational-level metric entries", "607.50", "Evidence Coverage"],
    "docxExcludes": []
  }
}' \
node scripts/report-export-smoke.mjs
```

Expected result:

- DOCX export loads for organisation-wide, Site A, Site B, and All scopes
- Reporting period label is visible and correct
- Scope label/statement is correct
- Site-specific exports exclude other site and organisation-wide values
- All scopes export shows intentional aggregate values
- Metric values render to two decimals

## Data Requirements For The Internal Smoke Tenant

Minimum deterministic fixture:

- One enabled metric with values for:
  - organisation-wide
  - Site A
  - Site B
- Optional second metric with a value in only one site to prove site-specific row isolation
- Evidence linked to at least one scoped metric value per scope, if evidence coverage assertions are required
- No customer data, and company/user names must clearly identify the tenant as internal smoke/test data

## Stop Conditions

Stop and investigate before retrying if:

- Any endpoint returns 401/403 for the smoke token
- Site A or Site B metadata does not match the expected tenant
- Organisation-wide export-data includes any non-null `siteId`
- A site-scoped export-data response includes `null` or another site ID
- All scopes is missing expected organisation-wide or site-scoped source rows
- DOCX export omits the reporting period or expected scope statement
