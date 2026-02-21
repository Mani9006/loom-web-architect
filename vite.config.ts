import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { analyticsPlugin } from "./vite-analytics-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
          // Split heavy vendor libraries into separate chunks
          if (id.includes("node_modules/html2pdf.js")) {
            return "pdf-libs";
          }
          if (id.includes("node_modules/jspdf")) {
            return "pdf-libs";
          }
          if (id.includes("node_modules/html2canvas")) {
            return "html2canvas";
          }
          if (id.includes("node_modules/recharts")) {
            return "recharts-vendor";
          }
          if (id.includes("node_modules/react") && !id.includes("node_modules/@")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/@radix-ui")) {
            return "ui-vendor";
          }
          if (id.includes("node_modules/sonner")) {
            return "sonner-vendor";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "framer-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 500, // Keep default 500KB warning
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
