#!/usr/bin/env node

/**
 * Production-safe report export smoke helper.
 *
 * Default mode uses only GET /api/reports/export-data/:reportType.
 * Optional DOCX checks call POST /api/reports/export/:reportType and will create
 * an audit log entry. Enable only for an approved internal smoke tenant.
 */

import { inflateRawSync } from "node:zlib";

const config = {
  baseUrl: process.env.BASE_URL,
  token: process.env.SMOKE_AUTH_TOKEN,
  period: process.env.SMOKE_PERIOD,
  siteAId: process.env.SMOKE_SITE_A_ID || "",
  siteBId: process.env.SMOKE_SITE_B_ID || "",
  runBinaryExports: process.env.SMOKE_RUN_BINARY_EXPORTS === "1",
  expectations: parseExpectations(process.env.SMOKE_EXPECTATIONS_JSON),
};

const failures = [];
const results = [];

function parseExpectations(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`SMOKE_EXPECTATIONS_JSON is not valid JSON: ${error.message}`);
  }
}

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
}

function record(name, detail = "") {
  results.push({ name, detail });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normaliseBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function scopeDefinitions() {
  const scopes = [
    {
      key: "org",
      label: "Organisation-wide",
      querySiteId: "null",
      exportSiteId: "__org__",
      expectedSiteId: null,
    },
    {
      key: "all",
      label: "All scopes",
      querySiteId: "__all__",
      exportSiteId: "__all__",
      expectedSiteId: undefined,
    },
  ];

  if (config.siteAId) {
    scopes.splice(1, 0, {
      key: "siteA",
      label: "Site A",
      querySiteId: config.siteAId,
      exportSiteId: config.siteAId,
      expectedSiteId: config.siteAId,
    });
  }

  if (config.siteBId) {
    const insertIndex = scopes.findIndex((scope) => scope.key === "all");
    scopes.splice(insertIndex, 0, {
      key: "siteB",
      label: "Site B",
      querySiteId: config.siteBId,
      exportSiteId: config.siteBId,
      expectedSiteId: config.siteBId,
    });
  }

  return scopes;
}

async function requestJson(path) {
  const response = await fetch(`${normaliseBaseUrl(config.baseUrl)}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const text = await response.text();
  assert(response.ok, `GET ${path} returned ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function requestDocx(path, body) {
  const response = await fetch(`${normaliseBaseUrl(config.baseUrl)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  assert(response.ok, `POST ${path} returned ${response.status}: ${buffer.toString("utf8").slice(0, 500)}`);
  assert(
    contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    `POST ${path} returned unexpected content-type ${contentType}`,
  );
  return docxText(buffer);
}

function getZipEntry(buffer, entryName) {
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  assert(eocdOffset >= 0, "ZIP end-of-central-directory not found");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  for (let i = 0; i < totalEntries; i += 1) {
    assert(buffer.readUInt32LE(centralOffset) === 0x02014b50, "invalid ZIP central directory header");
    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const fileName = buffer.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      assert(buffer.readUInt32LE(localHeaderOffset) === 0x04034b50, `invalid ZIP local header for ${entryName}`);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return inflateRawSync(compressed);
      throw new Error(`unsupported ZIP compression method ${compressionMethod} for ${entryName}`);
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function docxText(buffer) {
  const xml = getZipEntry(buffer, "word/document.xml").toString("utf8");
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decimal(value) {
  const numberValue = Number(value);
  assert(Number.isFinite(numberValue), `expected numeric value, received ${value}`);
  return numberValue.toFixed(2);
}

function rowsForMetric(values, metricId) {
  return values.filter((row) => row.metricId === metricId);
}

function assertExpectedRows(scope, exportData) {
  const expected = config.expectations[scope.key] || {};
  const values = Array.isArray(exportData.values) ? exportData.values : [];

  for (const row of expected.expectedRows || []) {
    assert(row.metricId, `${scope.key}.expectedRows entry missing metricId`);
    const matches = rowsForMetric(values, row.metricId).filter((candidate) => {
      const candidateSiteId = candidate.siteId ?? null;
      const expectedSiteId = Object.prototype.hasOwnProperty.call(row, "siteId") ? row.siteId : scope.expectedSiteId;
      const siteMatches = expectedSiteId === undefined || candidateSiteId === expectedSiteId;
      const valueMatches = row.value === undefined || Number(candidate.value) === Number(row.value);
      return siteMatches && valueMatches;
    });
    assert(
      matches.length > 0,
      `${scope.key} missing expected row ${JSON.stringify(row)}; values=${JSON.stringify(values.slice(0, 12))}`,
    );
  }

  for (const metricId of expected.absentMetricIds || []) {
    assert(rowsForMetric(values, metricId).length === 0, `${scope.key} unexpectedly included metricId ${metricId}`);
  }

  for (const value of expected.absentValues || []) {
    assert(!values.some((row) => Number(row.value) === Number(value)), `${scope.key} unexpectedly included value ${value}`);
  }
}

function assertScopeIsolation(scope, exportData) {
  const values = Array.isArray(exportData.values) ? exportData.values : [];
  if (scope.key === "org") {
    assert(values.every((row) => row.siteId === null || row.siteId === undefined), "organisation-wide export-data included site-scoped rows");
  }
  if (scope.key === "siteA" || scope.key === "siteB") {
    assert(values.every((row) => row.siteId === scope.expectedSiteId), `${scope.label} export-data included another scope`);
  }
  if (scope.key === "all") {
    if (config.siteAId) assert(values.some((row) => row.siteId === config.siteAId), "all-scope export-data missing Site A rows");
    if (config.siteBId) assert(values.some((row) => row.siteId === config.siteBId), "all-scope export-data missing Site B rows");
  }
}

function assertDocxExpectations(scope, text, exportData) {
  const expected = config.expectations[scope.key] || {};
  assert(text.includes("ESG Metrics Summary"), `${scope.key} DOCX missing report title`);
  assert(text.includes(`Reporting Period ${config.period}`), `${scope.key} DOCX missing reporting period label`);

  if (scope.key === "org") {
    assert(text.includes("excludes site-specific metric entries"), "organisation-wide DOCX missing scope statement");
  }
  if (scope.key === "siteA" || scope.key === "siteB") {
    const siteName = exportData.site?.name;
    if (siteName) assert(text.includes(siteName), `${scope.key} DOCX missing site name ${siteName}`);
    assert(text.includes("excludes organisation-wide and other-site metric entries"), `${scope.key} DOCX missing site scope statement`);
  }
  if (scope.key === "all") {
    assert(text.includes("all active sites and organisational-level metric entries"), "all-scope DOCX missing aggregate scope statement");
  }

  if (scope.key !== "all") {
    for (const row of exportData.values || []) {
      if (row.value !== null && row.value !== undefined) {
        assert(text.includes(decimal(row.value)), `${scope.key} DOCX missing formatted value ${decimal(row.value)}`);
      }
    }
  }

  for (const snippet of expected.docxIncludes || []) {
    assert(text.includes(snippet), `${scope.key} DOCX missing expected text ${JSON.stringify(snippet)}`);
  }
  for (const snippet of expected.docxExcludes || []) {
    assert(!text.includes(snippet), `${scope.key} DOCX unexpectedly included text ${JSON.stringify(snippet)}`);
  }
}

async function checkScope(scope) {
  const qs = new URLSearchParams({ period: config.period, siteId: scope.querySiteId });
  const exportData = await requestJson(`/api/reports/export-data/esg_metrics_summary?${qs.toString()}`);
  assert(exportData.period === config.period, `${scope.key} export-data period mismatch: ${exportData.period}`);
  if (scope.expectedSiteId) {
    assert(exportData.site?.id === scope.expectedSiteId, `${scope.key} export-data site metadata mismatch`);
  }
  assertScopeIsolation(scope, exportData);
  assertExpectedRows(scope, exportData);
  record(`${scope.label} export-data`, `${exportData.values?.length ?? 0} value row(s)`);

  if (config.runBinaryExports) {
    const text = await requestDocx("/api/reports/export/esg_metrics_summary", {
      format: "docx",
      period: config.period,
      siteId: scope.exportSiteId,
    });
    assertDocxExpectations(scope, text, exportData);
    record(`${scope.label} DOCX export`, "content, period, scope label, and precision checked");
  }
}

async function main() {
  requireEnv("BASE_URL", config.baseUrl);
  requireEnv("SMOKE_AUTH_TOKEN", config.token);
  requireEnv("SMOKE_PERIOD", config.period);

  for (const scope of scopeDefinitions()) {
    try {
      await checkScope(scope);
    } catch (error) {
      fail(`${scope.label} smoke`, error.message);
    }
  }

  console.log("");
  console.log(`Report export smoke: ${results.length} passed, ${failures.length} failed`);
  if (!config.runBinaryExports) {
    console.log("Binary DOCX export checks skipped. Set SMOKE_RUN_BINARY_EXPORTS=1 for approved internal-tenant export generation.");
  }
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
