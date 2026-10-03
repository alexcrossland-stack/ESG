import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { gzipSync, brotliCompressSync } from "node:zlib";
import express from "express";
import { get } from "node:http";
import { serveAssets, serveStatic } from "../../server/static";

async function run() {
  const dir = await mkdtemp(path.join(tmpdir(), "simplyesg-static-test-"));
  await mkdir(path.join(dir, "assets"));
  const source = "console.log('content-hashed asset');";
  await writeFile(path.join(dir, "index.html"), "<!doctype html><html>app shell</html>");
  await writeFile(path.join(dir, "assets/app-abcd1234.js"), source);
  await writeFile(path.join(dir, "assets/app-abcd1234.js.gz"), gzipSync(source));
  await writeFile(path.join(dir, "assets/app-abcd1234.js.br"), brotliCompressSync(source));
  const app = express();
  serveAssets(app, dir);
  app.use((_req, res, next) => { res.setHeader("Set-Cookie", "test-session=created"); next(); });
  app.use("/api", (_req, res) => res.status(404).setHeader("Cache-Control", "no-store").json({ error: "API route not found" }));
  serveStatic(app, dir);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const encoding of ["br", "gzip", "identity"]) {
      const response = await fetch(`${base}/assets/app-abcd1234.js`, { headers: { "Accept-Encoding": encoding } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-encoding"), encoding === "identity" ? null : encoding);
      assert.match(response.headers.get("cache-control")!, /max-age=31536000.*immutable/);
      assert.match(response.headers.get("vary")!, /Accept-Encoding/);
      assert.match(response.headers.get("content-type")!, /javascript/);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(await response.text(), source);
    }
    const first = await fetch(`${base}/assets/app-abcd1234.js`, { headers: { "Accept-Encoding": "identity" } });
    const refused = await fetch(`${base}/assets/app-abcd1234.js`, { headers: { "Accept-Encoding": "br;q=0, gzip;q=0, identity;q=0" } });
    assert.equal(refused.status, 406);
    // Node fetch adds no-cache to conditional requests. A raw HTTP conditional
    // request verifies browser revalidation without that extra cache bypass.
    const unchanged = await new Promise<number | undefined>((resolve, reject) => get(`${base}/assets/app-abcd1234.js`, { headers: { "Accept-Encoding": "identity", "If-None-Match": first.headers.get("etag")! } }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject));
    assert.equal(unchanged, 304);
    const missing = await fetch(`${base}/assets/missing-hash.js`);
    assert.equal(missing.status, 404);
    assert.ok(!missing.headers.get("content-type")?.includes("html"));
    const api = await fetch(`${base}/api/does-not-exist`);
    assert.equal(api.status, 404);
    assert.match(api.headers.get("content-type")!, /json/);
    assert.equal(api.headers.get("cache-control"), "no-store");
    const deepLink = await fetch(`${base}/data-entry?period=2026-09`);
    assert.equal(deepLink.status, 200);
    assert.match(deepLink.headers.get("content-type")!, /html/);
    assert.equal(deepLink.headers.get("cache-control"), "no-cache");
    console.log("PASS production static gzip/Brotli/identity, MIME, immutable cache, ETag/304, no asset session, real missing resources and revalidated deep links");
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await rm(dir, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
