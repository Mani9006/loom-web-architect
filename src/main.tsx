import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App.tsx";
import "./index.css";
import { analyticsCollector } from "./lib/analytics";
import { installChunkReloadGuard } from "./lib/lazy-with-retry";
import { initializeTheme } from "./hooks/use-theme";
import { installGlobalIncidentHandlers } from "./lib/incidents";

// Install the global chunk-load failure guard BEFORE we mount the app, so
// even module preload errors from old cached index.html files trigger an
// automatic reload to fetch fresh chunk hashes.
installChunkReloadGuard();
initializeTheme();
installGlobalIncidentHandlers();

// Initialize analytics collector and log metrics after DOM is ready
// One motion house style: critically damped springs (no overshoot), and
// framer-motion honours the OS reduced-motion setting everywhere.
createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user" transition={{ type: "spring", bounce: 0, duration: 0.35 }}>
    <App />
  </MotionConfig>,
);

// Log metrics after a short delay to allow Web Vitals to populate
setTimeout(() => {
  analyticsCollector.logMetrics();

  // Send metrics to analytics endpoint if available
  const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  if (analyticsEndpoint) {
    analyticsCollector.sendMetrics(analyticsEndpoint);
  }
}, 5000);
