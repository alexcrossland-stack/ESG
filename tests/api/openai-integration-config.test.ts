/**
 * API regression: OpenAI integration configuration
 *
 * Ensures production AI paths use the configured AI integration env vars and
 * avoid unsafe full-error logging around OpenAI failures.
 *
 * Run: npx tsx tests/api/openai-integration-config.test.ts
 */

import { readFileSync } from "node:fs";

interface TestResult { name: string; passed: boolean; detail?: string }
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => string | void) {
  try {
    const detail = fn();
    pass(name, typeof detail === "string" ? detail : undefined);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

const routes = readFileSync("server/routes.ts", "utf8");

await check("routes do not use legacy OPENAI_API_KEY", () => {
  assert(!routes.includes("process.env.OPENAI_API_KEY"), "server/routes.ts still references process.env.OPENAI_API_KEY");
});

await check("shared OpenAI client uses configured API key and base URL", () => {
  assert(routes.includes("function createOpenAiIntegrationClient()"), "missing shared OpenAI integration client");
  assert(routes.includes("apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY"), "client does not use AI_INTEGRATIONS_OPENAI_API_KEY");
  assert(routes.includes("baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL"), "client does not use AI_INTEGRATIONS_OPENAI_BASE_URL");
});

await check("OpenAI chat model is configurable with production-safe default", () => {
  assert(routes.includes("function getOpenAiChatModel()"), "missing shared OpenAI chat model resolver");
  assert(routes.includes("process.env.AI_INTEGRATIONS_OPENAI_MODEL?.trim()"), "resolver does not read AI_INTEGRATIONS_OPENAI_MODEL");
  assert(routes.includes('|| "gpt-4.1-mini"'), "default OpenAI chat model is not gpt-4.1-mini");
  assert(routes.includes("model: getOpenAiChatModel()"), "chat completion requests do not use configured model resolver");
});

await check("legacy inaccessible OpenAI chat model is not hardcoded", () => {
  assert(!routes.includes('"gpt-4o-mini"'), "server/routes.ts still hardcodes gpt-4o-mini");
});

await check("OpenAI failure logging uses sanitized metadata", () => {
  assert(routes.includes("function safeOpenAiErrorMeta"), "missing safe OpenAI error metadata helper");
  const unsafePatterns = [
    /Policy generation error:\s*["']?\s*,\s*e/,
    /Autofill error:\s*["']?\s*,\s*e/,
    /Template generation error:\s*["']?\s*,\s*e/,
    /OpenAI .*failed:\s*["']?\s*,\s*e/,
    /AI roadmap generation failed,\s*using fallback:\s*["']?\s*,\s*aiErr\.message/,
  ];
  for (const pattern of unsafePatterns) {
    assert(!pattern.test(routes), `unsafe OpenAI logging pattern remains: ${pattern}`);
  }
});

const passed = results.filter((result) => result.passed).length;
const total = results.length;
console.log(`\nOpenAI integration config: ${passed}/${total} passed\n`);
if (passed < total) process.exit(1);
