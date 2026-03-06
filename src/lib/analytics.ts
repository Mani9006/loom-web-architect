/**
 * Analytics Instrumentation
 * Tracks bundle size, build time, and runtime quality metrics
 */

export interface BuildMetrics {
  bundleSize: number; // bytes
  timestamp: number;
  mode: 'development' | 'production';
}

export interface RuntimeMetrics {
  ttfb: number; // Time to First Byte (ms)
  fcp: number; // First Contentful Paint (ms)
  lcp: number; // Largest Contentful Paint (ms)
  cls: number; // Cumulative Layout Shift
  fid: number; // First Input Delay (ms)
  ini: number; // Interaction to Next Paint (ms)
  timestamp: number;
}

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number; // errors per minute
  jsErrors: Array<{
    message: string;
    stack?: string;
    timestamp: number;
  }>;
  networkErrors: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  build?: BuildMetrics;
  runtime?: RuntimeMetrics;
  errors?: ErrorMetrics;
}

class AnalyticsCollector {
  private metrics: PerformanceMetrics = {};
  private errorLog: Array<{ message: string; stack?: string; timestamp: number }> = [];
  private sessionStart: number = Date.now();

  constructor() {
    this.initializeWebVitals();
    this.initializeErrorTracking();
  }

  /**
   * Initialize Web Vitals tracking using PerformanceObserver
   */
  private initializeWebVitals(): void {
    if (!window.PerformanceObserver) {
      console.warn('PerformanceObserver not supported');
      return;
    }

    const runtime: Partial<RuntimeMetrics> = {
      timestamp: Date.now(),
    };

    // Navigation timing for TTFB, FCP
    const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigationTiming) {
      runtime.ttfb = navigationTiming.responseStart - navigationTiming.fetchStart;
    }

    // Observe First Contentful Paint
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            runtime.fcp = entry.startTime;
            this.metrics.runtime = { ...this.metrics.runtime, ...runtime } as RuntimeMetrics;
          }
        }
      });
      paintObserver.observe({ entryTypes: ['paint'] });
    } catch (e) {
      console.warn('Paint observer failed:', e);
    }

    // Observe Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        runtime.lcp = lastEntry.startTime;
        this.metrics.runtime = { ...this.metrics.runtime, ...runtime } as RuntimeMetrics;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      console.warn('LCP observer failed:', e);
    }

    // Observe Layout Shift
    let clsValue = 0;
    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        runtime.cls = clsValue;
        this.metrics.runtime = { ...this.metrics.runtime, ...runtime } as RuntimeMetrics;
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      console.warn('CLS observer failed:', e);
    }

    // Observe First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const firstEntry = entries[0];
        runtime.fid = (firstEntry as any).processingStart - firstEntry.startTime;
        this.metrics.runtime = { ...this.metrics.runtime, ...runtime } as RuntimeMetrics;
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      console.warn('FID observer failed:', e);
    }

    // Observe Interaction to Next Paint (newer API)
    try {
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          runtime.ini = (lastEntry as any).processingDuration;
          this.metrics.runtime = { ...this.metrics.runtime, ...runtime } as RuntimeMetrics;
        }
      });
      inpObserver.observe({ entryTypes: ['interaction'] });
    } catch (e) {
      console.warn('INP observer failed:', e);
    }
  }

  /**
   * Initialize error tracking for JavaScript and network errors
   */
  private initializeErrorTracking(): void {
    window.addEventListener('error', (event) => {
      this.errorLog.push({
        message: event.message,
        stack: event.filename + ':' + event.lineno + ':' + event.colno,
        timestamp: Date.now(),
      });
      this.updateErrorMetrics();
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.errorLog.push({
        message: 'Unhandled Promise Rejection: ' + String(event.reason),
        timestamp: Date.now(),
      });
      this.updateErrorMetrics();
    });
  }

  /**
   * Update error metrics based on collected errors
   */
  private updateErrorMetrics(): void {
    const uptime = (Date.now() - this.sessionStart) / 1000 / 60; // minutes
    this.metrics.errors = {
      errorCount: this.errorLog.length,
      errorRate: uptime > 0 ? this.errorLog.length / uptime : 0,
      jsErrors: this.errorLog.slice(-50), // Keep last 50 errors
      networkErrors: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Set build metrics (called from Vite plugin)
   */
  setBuildMetrics(bundleSize: number, mode: 'development' | 'production'): void {
    this.metrics.build = {
      bundleSize,
      timestamp: Date.now(),
      mode,
    };
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): PerformanceMetrics {
    this.updateErrorMetrics();
    return this.metrics;
  }

  /**
   * Send metrics to analytics endpoint
   */
  async sendMetrics(endpoint: string): Promise<void> {
    try {
      const metrics = this.getMetrics();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metrics,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        console.error('Failed to send metrics:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending metrics:', error);
    }
  }

  /**
   * Log metrics to console (dev mode)
   */
  logMetrics(): void {
    const metrics = this.getMetrics();
    console.group('📊 Performance Metrics');

    if (metrics.build) {
      console.log('Build Metrics:', {
        bundleSize: `${(metrics.build.bundleSize / 1024).toFixed(2)} KB`,
        mode: metrics.build.mode,
      });
    }

    if (metrics.runtime) {
      console.log('Runtime Metrics:', {
        ttfb: `${metrics.runtime.ttfb?.toFixed(0) ?? 'N/A'} ms`,
        fcp: `${metrics.runtime.fcp?.toFixed(0) ?? 'N/A'} ms`,
        lcp: `${metrics.runtime.lcp?.toFixed(0) ?? 'N/A'} ms`,
        cls: `${metrics.runtime.cls?.toFixed(3) ?? 'N/A'}`,
        fid: `${metrics.runtime.fid?.toFixed(0) ?? 'N/A'} ms`,
        ini: `${metrics.runtime.ini?.toFixed(0) ?? 'N/A'} ms`,
      });
    }

    if (metrics.errors) {
      console.log('Error Metrics:', {
        errorCount: metrics.errors.errorCount,
        errorRate: `${metrics.errors.errorRate.toFixed(2)} errors/min`,
        recentErrors: metrics.errors.jsErrors.slice(0, 5),
      });
    }

    console.groupEnd();
  }
}

// Singleton instance
export const analyticsCollector = new AnalyticsCollector();

// Export for convenience
export default analyticsCollector;
