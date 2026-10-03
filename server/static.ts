import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveAssets(app: Express, distPath = path.resolve(__dirname, "public")) {
  const assets = path.join(distPath, "assets");
  app.use("/assets", (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || path.basename(req.path) !== req.path.slice(1)) return next();
    const original = path.join(assets, path.basename(req.path));
    if (!fs.existsSync(original) || !fs.statSync(original).isFile()) return next();
    res.vary("Accept-Encoding");
    const encoding = req.acceptsEncodings("br", "gzip", "identity");
    if (!encoding) return res.status(406).type("text/plain").send("No acceptable content encoding");
    const suffix = encoding === "br" ? ".br" : encoding === "gzip" ? ".gz" : "";
    if (suffix && fs.existsSync(original + suffix)) {
      res.type(path.extname(original));
      res.setHeader("Content-Encoding", encoding as string);
      return res.sendFile(original + suffix, { immutable: true, maxAge: "1y", acceptRanges: false });
    }
    next();
  });
  app.use("/assets", express.static(assets, { immutable: true, maxAge: "1y", dotfiles: "deny" }));
  app.use("/assets", (_req, res) => res.status(404).type("text/plain").send("Asset not found"));
}

export function serveStatic(app: Express, distPath = path.resolve(__dirname, "public")) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (req, res) => {
    if (!["GET", "HEAD"].includes(req.method) || !req.accepts("html") || path.extname(req.path)) {
      return res.status(404).type("text/plain").send("Not found");
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
