#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !file.startsWith("package-lock.json"))
  .filter((file) => !file.startsWith("node_modules/"))
  .filter((file) => !file.startsWith("dist/"));

const checks = [
  {
    name: "OpenAI key",
    pattern: /(?<![A-Za-z0-9])sk-(?!local|test|example|dummy)[A-Za-z0-9_-]{20,}/g,
  },
  {
    name: "Private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    name: "AWS access key",
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: "Slack token",
    pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  },
  {
    name: "Stripe live key",
    pattern: /(?:sk|pk)_live_[A-Za-z0-9]{20,}/g,
  },
  {
    name: "JWT literal",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
];

const findings = [];

for (const file of trackedFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const lines = text.split(/\r?\n/);
  for (const check of checks) {
    for (const match of text.matchAll(check.pattern)) {
      const index = match.index ?? 0;
      const line = text.slice(0, index).split(/\r?\n/).length;
      const content = lines[line - 1] || "";
      findings.push({
        file,
        line,
        check: check.name,
        preview: content.replace(match[0], "<redacted>").slice(0, 180),
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential committed secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.check} :: ${finding.preview}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${trackedFiles.length} tracked files checked).`);
