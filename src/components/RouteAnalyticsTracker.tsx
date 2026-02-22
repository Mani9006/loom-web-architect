import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView, trackProductEvent } from "@/lib/product-analytics";

export default function RouteAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search || ""}`;
    trackPageView(path);
  }, [location.pathname, location.search]);

  useEffect(() => {
    void trackProductEvent("session_start", {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    });
  }, []);

  return null;
}
