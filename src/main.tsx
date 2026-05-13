import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { analyticsCollector } from "./lib/analytics";
import { installChunkReloadGuard } from "./lib/lazy-with-retry";

// Install the global chunk-load failure guard BEFORE we mount the app, so
// even module preload errors from old cached index.html files trigger an
// automatic reload to fetch fresh chunk hashes.
installChunkReloadGuard();

// Initialize analytics collector and log metrics after DOM is ready
createRoot(document.getElementById("root")!).render(<App />);

// Log metrics after a short delay to allow Web Vitals to populate
setTimeout(() => {
  analyticsCollector.logMetrics();

  // Send metrics to analytics endpoint if available
  const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  if (analyticsEndpoint) {
    analyticsCollector.sendMetrics(analyticsEndpoint);
  }
}, 5000);
