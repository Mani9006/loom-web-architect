/**
 * Vite Plugin for Analytics Instrumentation
 * Captures bundle size and build time metrics
 */

import { Plugin } from 'vite';
import { promises as fs } from 'fs';
import path from 'path';

export interface ViteAnalyticsPluginOptions {
  outputDir?: string;
}

interface BuildMetrics {
  buildTime: number; // milliseconds
  bundleSize: number; // bytes
  timestamp: string;
  mode: string;
  assets: Array<{
    name: string;
    size: number; // bytes
  }>;
}

export function analyticsPlugin(options: ViteAnalyticsPluginOptions = {}): Plugin {
  const outputDir = options.outputDir || '.vite-metrics';
  let buildStartTime: number;

  return {
    name: 'vite-analytics-plugin',
    apply: 'build',

    buildStart() {
      buildStartTime = Date.now();
      console.log('[Analytics] Build started...');
    },

    async generateBundle(output, bundle) {
      // Calculate bundle sizes
      let totalBundleSize = 0;
      const assets: Array<{ name: string; size: number }> = [];

      for (const [fileName, assetInfo] of Object.entries(bundle)) {
        let size = 0;
        if ('code' in assetInfo) {
          size = new TextEncoder().encode(assetInfo.code).length;
        } else if ('source' in assetInfo) {
          const source =
            typeof assetInfo.source === 'string'
              ? assetInfo.source
              : new TextDecoder().decode(assetInfo.source);
          size = new TextEncoder().encode(source).length;
        }
        totalBundleSize += size;
        assets.push({ name: fileName, size });
      }

      // Store metrics
      const buildTime = Date.now() - buildStartTime;
      const metrics: BuildMetrics = {
        buildTime,
        bundleSize: totalBundleSize,
        timestamp: new Date().toISOString(),
        mode: process.env.NODE_ENV || 'production',
        assets: assets.sort((a, b) => b.size - a.size).slice(0, 20), // Top 20 assets
      };

      // Save metrics to file
      try {
        await fs.mkdir(outputDir, { recursive: true });
        const metricsPath = path.join(outputDir, `build-${Date.now()}.json`);
        await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));

        // Also update latest.json for easy access
        const latestPath = path.join(outputDir, 'latest.json');
        await fs.writeFile(latestPath, JSON.stringify(metrics, null, 2));

        console.log(`[Analytics] Build metrics saved to ${metricsPath}`);
      } catch (error) {
        console.error('[Analytics] Failed to save build metrics:', error);
      }
    },

    writeBundle() {
      const buildTime = Date.now() - buildStartTime;
      console.log(`[Analytics] Build completed in ${buildTime}ms`);
    },
  };
}

/**
 * Log build metrics from the latest build
 */
export async function logBuildMetrics(metricsDir: string = '.vite-metrics'): Promise<void> {
  try {
    const latestPath = path.join(metricsDir, 'latest.json');
    const content = await fs.readFile(latestPath, 'utf-8');
    const metrics: BuildMetrics = JSON.parse(content);

    console.log('\n📊 Build Metrics Summary');
    console.log('========================');
    console.log(`Build Time: ${metrics.buildTime}ms`);
    console.log(`Bundle Size: ${(metrics.bundleSize / 1024).toFixed(2)} KB`);
    console.log(`Mode: ${metrics.mode}`);
    console.log(`Timestamp: ${metrics.timestamp}`);
    console.log('\nTop Assets by Size:');
    metrics.assets.forEach((asset, index) => {
      console.log(`  ${index + 1}. ${asset.name}: ${(asset.size / 1024).toFixed(2)} KB`);
    });
    console.log();
  } catch (error) {
    console.warn('[Analytics] Could not read build metrics:', error);
  }
}

export default analyticsPlugin;
