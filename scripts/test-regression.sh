#!/usr/bin/env bash
# Regression Pack — Release-Critical Flows
#
# Runs the named regression suite covering the ten most commercially critical
# user journeys. Produces a clear PASS/FAIL exit code suitable for CI.
#
# Usage:
#   ./scripts/test-regression.sh
#   npm run test:regression   (if configured in package.json)
#
# The suite requires the application server to be running on port 5000 and
# DATABASE_URL to point to the test database.

set -euo pipefail

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  ESG Platform — Regression Pack (Release-Critical Flows)"
echo "══════════════════════════════════════════════════════════════"
echo ""

exec npx playwright test --grep "REGR-" "$@"
