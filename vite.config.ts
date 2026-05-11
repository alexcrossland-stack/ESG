import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (!normalizedId.includes("node_modules")) return undefined;

          if (normalizedId.includes("/react") || normalizedId.includes("/react-dom") || normalizedId.includes("/scheduler")) return "react-vendor";
          if (normalizedId.includes("@tanstack/react-query")) return "query-vendor";
          if (normalizedId.includes("@radix-ui")) return "radix-vendor";
          if (normalizedId.includes("lucide-react")) return "icons-vendor";
          if (normalizedId.includes("recharts") || normalizedId.includes("/d3-")) return "charts-vendor";
          if (normalizedId.includes("/docx/")) return "docx-vendor";
          if (normalizedId.includes("/marked/") || normalizedId.includes("/sanitize-html/")) return "markdown-vendor";
          if (normalizedId.includes("date-fns")) return "date-vendor";

          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
