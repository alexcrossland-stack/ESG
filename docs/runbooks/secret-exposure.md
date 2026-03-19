# Runbook: Secret Exposure

## How to Detect
- A secret (SESSION_SECRET, STRIPE_SECRET_KEY, RESEND_API_KEY, OPENAI_API_KEY, etc.) is found in logs, code, or public storage
- Security audit check on `/api/admin/security-audit` flags a weak or missing secret
- Deployment log shows secrets being printed (should never happen)

## Immediate Containment (do first)
1. Rotate the exposed secret immediately via the Replit Secrets panel
2. For Stripe keys: rotate in the Stripe dashboard and update the secret
3. For OpenAI keys: rotate in the OpenAI dashboard
4. For SESSION_SECRET: rotating this invalidates all active sessions — users must log in again
5. Do NOT log or echo the new secret anywhere

## Logs to Inspect
- Deployment logs for any printed secret values
- `audit_logs` for any unusual authentication patterns that may indicate the secret was used
- `platform_health_events` for any anomalies around the time of exposure

## Remediation Steps
1. Determine the exposure vector: git commit, log output, error message, misconfigured endpoint
2. Scrub the secret from all logs and history (git history rewrite if committed to source control)
3. Notify all downstream services using the exposed credential (Stripe, OpenAI, etc.)
4. Audit whether the exposure enabled any unauthorised access
5. If SESSION_SECRET was exposed, force-logout all users by rotating it
6. Review secret management practices: use environment variables only, never hardcode
7. Add secret scanning to CI/CD if not already present
