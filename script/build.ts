import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, copyFile, readdir, writeFile } from "fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();
  for (const name of await readdir("dist/public/assets")) {
    if (!/\.(js|css)$/.test(name)) continue;
    const file = `dist/public/assets/${name}`;
    const source = await readFile(file);
    await Promise.all([
      writeFile(`${file}.gz`, gzipSync(source, { level: 9 })),
      writeFile(`${file}.br`, brotliCompressSync(source)),
    ]);
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("copying connect-pg-simple table.sql into dist...");
  await copyFile(
    "node_modules/connect-pg-simple/table.sql",
    "dist/table.sql"
  );
}

buildAll()
  .then(() => {
    console.log("build complete.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
