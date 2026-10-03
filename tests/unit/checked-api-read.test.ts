import assert from "node:assert/strict";

const memory = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) },
  window: new EventTarget(),
});

async function run() {
  const { checkedJson, checkedArrayJson, checkedEntryJson, apiGet, queryClient } = await import("../../client/src/lib/queryClient");
  for (const status of [401, 403, 429, 500, 503]) {
    await assert.rejects(checkedJson(new Response(JSON.stringify({ error: "Service failure" }), { status })), (error: any) => error.status === status);
  }
  await assert.rejects(checkedJson(new Response("<html>not JSON</html>")), /unreadable response/);
  assert.deepEqual(await checkedJson(new Response("[]")), []);
  await assert.rejects(checkedArrayJson(new Response('{"error":"not a list"}')), /invalid list/);
  await assert.rejects(checkedEntryJson(new Response('{}')), /could not be read/);
  assert.deepEqual(await checkedEntryJson(new Response('{"metrics":[],"values":[]}')), { metrics: [], values: [] });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("Offline"); };
    await assert.rejects(apiGet("/api/my-tasks"), /Offline/);
  } finally { globalThis.fetch = originalFetch; }
  queryClient.setQueryData(["/api/control-centre", "2026-09"], { missingData: ["gas"] });
  await queryClient.getMutationCache().build(queryClient, { gcTime: 0, mutationFn: async () => "saved" }).execute(undefined);
  assert.ok(queryClient.getQueryState(["/api/control-centre", "2026-09"])?.isInvalidated);
  assert.ok(memory.has("simplyesg-data-changed"));
  assert.equal(queryClient.getDefaultOptions().queries?.staleTime, 60_000);
  assert.equal(queryClient.getDefaultOptions().mutations?.retry, false);
  queryClient.clear();
  console.log("PASS checked reads distinguish successful empty, HTTP errors, malformed JSON/offline; saves invalidate recommendations and notify other tabs without retrying writes");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
