/**
 * API regression: ESG Assistant OpenAI response handling
 *
 * Run: npx tsx tests/api/chat-assist-openai-response.test.ts
 */

import assert from "node:assert/strict";
import {
  createOpenAiAssistantReply,
  extractOpenAiAssistantReply,
} from "../../server/openai-assist";

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

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass(name);
  } catch (error: any) {
    fail(name, error?.message || String(error));
  }
}

await check("parses Responses API output_text", () => {
  const reply = extractOpenAiAssistantReply({ output_text: "  Review your top material topics.  " });
  assert.equal(reply, "Review your top material topics.");
});

await check("parses Responses API structured output text parts", () => {
  const reply = extractOpenAiAssistantReply({
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: "Start with energy data quality." },
          { type: "output_text", text: "Assign a metric owner." },
        ],
      },
    ],
  });
  assert.equal(reply, "Start with energy data quality.\nAssign a metric owner.");
});

await check("parses legacy Chat Completions content for compatibility", () => {
  const reply = extractOpenAiAssistantReply({
    choices: [{ message: { content: "Your ESG profile is missing recent evidence." } }],
  });
  assert.equal(reply, "Your ESG profile is missing recent evidence.");
});

await check("returns null for empty provider responses so route can fall back intentionally", () => {
  assert.equal(extractOpenAiAssistantReply({ output_text: "   " }), null);
  assert.equal(extractOpenAiAssistantReply({ output: [{ content: [] }] }), null);
  assert.equal(extractOpenAiAssistantReply({ choices: [{ message: { content: "" } }] }), null);
});

await check("assistant request uses configured model with Responses API", async () => {
  const calls: unknown[] = [];
  const fakeOpenAi = {
    responses: {
      create: async (request: unknown) => {
        calls.push(request);
        return { output_text: "Use the data-entry page to close the evidence gap." };
      },
    },
  };

  const reply = await createOpenAiAssistantReply(fakeOpenAi, {
    model: "gpt-5.4-mini",
    systemPrompt: "system prompt redacted in logs",
    message: "What should I do next?",
  });

  assert.equal(reply, "Use the data-entry page to close the evidence gap.");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    model: "gpt-5.4-mini",
    input: [
      { role: "system", content: "system prompt redacted in logs" },
      { role: "user", content: "What should I do next?" },
    ],
    max_output_tokens: 350,
  });
});

const passed = results.filter((result) => result.passed).length;
const total = results.length;
console.log(`\nESG Assistant OpenAI response handling: ${passed}/${total} passed\n`);
if (passed < total) process.exit(1);
