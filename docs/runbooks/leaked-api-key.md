# Runbook: Leaked API Key

## How to Detect
- Alert fired for `repeated_api_key_failures` (invalid key being tried repeatedly)
- API key appears in a public repository (GitHub, GitLab, Pastebin, etc.)
- Unusual API activity volume for a specific key — check `agent_runs` table
- User reports key may have been exposed in logs or configuration

## Immediate Containment (do first)
1. Revoke the compromised key immediately: `POST /api/admin/agent-api-keys/:id/revoke`
   - Or via the Admin console → API Keys → Revoke
2. Rotate to a new key for the affected integration or agent

## Logs to Inspect
- `agent_api_keys` WHERE `key_hash = '<hash>'` — confirm key details and last use
- `agent_runs` WHERE `created_at > '<suspected_exposure_date>'` — what was done with the key
- `agent_actions` for the associated runs — specific data accessed or modified
- `audit_logs` for any API-auth-related events

## Remediation Steps
1. Determine when the key was last legitimately used vs. when suspicious use started
2. Review all `agent_runs` triggered by the compromised key for unauthorised actions
3. If data was accessed cross-tenant, treat as a cross-tenant incident (see that runbook)
4. Notify the API key owner to rotate credentials in all places they were used
5. Issue a new API key with the minimum required scopes
6. Review API key storage practices — keys must never be committed to source control
7. Consider adding IP allowlisting for API key usage if the integration source is known
