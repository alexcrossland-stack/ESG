const SENSITIVE_RESPONSE_KEYS = new Set([
  "apikey",
  "authorization",
  "backupcodes",
  "clientsecret",
  "key",
  "mfasecret",
  "password",
  "plaintextkey",
  "privatekey",
  "qrdataurl",
  "recoverycodes",
  "refreshtoken",
  "secret",
  "token",
  "uri",
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveResponseKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return SENSITIVE_RESPONSE_KEYS.has(normalized)
    || normalized.endsWith("password")
    || normalized.endsWith("secret")
    || normalized.endsWith("token");
}

export function redactResponseForLog(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const visit = (current: unknown): unknown => {
    if (current === null || typeof current !== "object") return current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);

    if (Array.isArray(current)) return current.map(visit);

    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).map(([key, nested]) => [
        key,
        isSensitiveResponseKey(key) ? "[redacted]" : visit(nested),
      ]),
    );
  };

  return visit(value);
}
