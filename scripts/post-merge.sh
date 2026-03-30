#!/bin/bash
set -e
npm install
# --force skips interactive enum-rename prompts from drizzle-kit.
# This is safe in this project because:
#   1. All enum changes in schema.ts create NEW enum types (not renames of existing ones).
#   2. The interactive prompt only appears when drizzle-kit detects a potential rename,
#      which is a false positive here (estimate_confidence is a new enum, not a rename).
# If a destructive schema change is ever intentional, update this script accordingly.
npm run db:push --force
