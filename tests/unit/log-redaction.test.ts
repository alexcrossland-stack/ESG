import assert from "node:assert/strict";
import { redactResponseForLog } from "../../server/log-redaction";

const original = {
  user: { id: "user-1", email: "person@example.test" },
  company: { id: "company-1", name: "Example SME" },
  token: "bearer-token-plaintext",
  nested: {
    clientSecret: "oauth-secret",
    refresh_token: "refresh-token",
    key: "esgk_plaintext",
    recoveryCodes: ["code-one", "code-two"],
    uri: "otpauth://totp/SimplyESG?secret=plaintext-mfa-secret",
    qrDataUrl: "data:image/png;base64,plaintext-qr-secret",
  },
  keyMetrics: [{ name: "Electricity", value: "100" }],
};

const redacted = redactResponseForLog(original) as any;

assert.equal(redacted.token, "[redacted]");
assert.equal(redacted.nested.clientSecret, "[redacted]");
assert.equal(redacted.nested.refresh_token, "[redacted]");
assert.equal(redacted.nested.key, "[redacted]");
assert.equal(redacted.nested.recoveryCodes, "[redacted]");
assert.equal(redacted.nested.uri, "[redacted]");
assert.equal(redacted.nested.qrDataUrl, "[redacted]");
assert.deepEqual(redacted.user, original.user);
assert.deepEqual(redacted.company, original.company);
assert.deepEqual(redacted.keyMetrics, original.keyMetrics);
assert.equal(original.token, "bearer-token-plaintext", "redaction must not mutate the response body");

console.log("response log redaction tests passed");
