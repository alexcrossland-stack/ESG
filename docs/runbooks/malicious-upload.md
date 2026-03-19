# Runbook: Malicious Upload Concern

## How to Detect
- Virus scan result on an evidence file is flagged (`scan_result = 'infected'` or similar)
- User reports downloading a file that triggered antivirus warnings
- Evidence file has an unexpected file type (e.g., `.exe`, `.sh`, `.bat` disguised as PDF)
- `evidence_files` shows `evidence_status = 'quarantined'`

## Immediate Containment (do first)
1. Set the file status to quarantined to prevent download:
   `UPDATE evidence_files SET evidence_status = 'quarantined' WHERE id = '<file_id>'`
2. Do not download or execute the file on any company device
3. Identify the uploading user and suspend if the upload was intentional or their account is compromised

## Logs to Inspect
- `evidence_files` WHERE `scan_result IS NOT NULL` or `evidence_status = 'quarantined'`
- `audit_logs` WHERE `action LIKE '%upload%' OR action LIKE '%evidence%'` — who uploaded what and when
- `audit_logs` for the uploader's `user_id` — broader activity around the upload time
- Check file metadata: `file_type`, `filename`, `file_url`, `uploaded_by`

## Remediation Steps
1. Confirm the file is quarantined and no users can access it
2. Identify who uploaded the file and notify them — determine if account was compromised
3. Alert any users who may have already downloaded the file before quarantine
4. Delete the malicious file from storage after forensic analysis is complete
5. Review file type validation and upload filtering rules — enforce allowlists for accepted MIME types
6. Consider adding server-side virus scanning for all uploads if not already active
7. If the upload was part of a coordinated attack, follow the account compromise runbook
