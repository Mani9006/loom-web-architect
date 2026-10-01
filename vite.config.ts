import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { analyticsPlugin } from "./vite-analytics-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Small helpers shared by the entry and the lazy-only vendors below. Without this rule
          // Rollup folds them into whichever vendor chunk depends on them (e.g. jspdf-vendor,
          // recharts-vendor), which forces those large chunks into every page's initial load.
          if (
            id.includes("vite/preload-helper") ||
            id.includes("commonjsHelpers") ||
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge")
          )
            return "app-shared";
          if (id.includes("node_modules/html2pdf.js")) return "html2pdf-vendor";
          if (id.includes("node_modules/jspdf")) return "jspdf-vendor";
          if (id.includes("node_modules/html2canvas")) return "html2canvas-vendor";
          if (id.includes("node_modules/recharts")) return "recharts-vendor";
          if (id.includes("node_modules/react") && !id.includes("node_modules/@")) return "react-vendor";
          if (id.includes("node_modules/@radix-ui")) return "ui-vendor";
          if (id.includes("node_modules/sonner")) return "sonner-vendor";
          if (id.includes("node_modules/framer-motion")) return "framer-vendor";
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    analyticsPlugin({ outputDir: ".vite-metrics" }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
