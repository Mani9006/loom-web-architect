#!/usr/bin/env node

/**
 * Build Metrics Collection Script
 * Displays bundle size and build performance metrics
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metricsDir = path.join(__dirname, '..', '.vite-metrics');

async function readBuildMetrics() {
  try {
    const latestPath = path.join(metricsDir, 'latest.json');
    const content = await fs.readFile(latestPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to read build metrics:', error.message);
    return null;
  }
}

async function formatMetricsReport(metrics) {
  if (!metrics) {
    console.log('No build metrics found. Run: npm run build');
    return;
  }

  const report = `
╔════════════════════════════════════════════════════════════════╗
║                   📊 BUILD METRICS REPORT                       ║
╚════════════════════════════════════════════════════════════════╝

Build Information:
  • Mode:           ${metrics.mode.toUpperCase()}
  • Timestamp:      ${metrics.timestamp}
  • Build Time:     ${metrics.buildTime}ms

Bundle Performance:
  • Total Size:     ${(metrics.bundleSize / 1024).toFixed(2)} KB
  • Gzipped Est.:   ${(metrics.bundleSize / 1024 * 0.35).toFixed(2)} KB (approx)

Top 10 Largest Assets:
${metrics.assets
  .slice(0, 10)
  .map(
    (asset, idx) =>
      `  ${String(idx + 1).padStart(2, ' ')}. ${asset.name.padEnd(40, ' ')} ${String((asset.size / 1024).toFixed(2)).padStart(8, ' ')} KB`
  )
  .join('\n')}

Key Metrics:
  • Assets Count:   ${metrics.assets.length}
  • Avg Asset:      ${(metrics.bundleSize / metrics.assets.length / 1024).toFixed(2)} KB
  • Largest Asset:  ${metrics.assets[0] ? metrics.assets[0].name : 'N/A'} (${metrics.assets[0] ? (metrics.assets[0].size / 1024).toFixed(2) : 'N/A'} KB)

═══════════════════════════════════════════════════════════════════
`;

  console.log(report);

  // Return metrics for programmatic use
  return {
    buildTime: metrics.buildTime,
    bundleSize: metrics.bundleSize,
    bundleSizeKb: metrics.bundleSize / 1024,
    gzippedEstimate: metrics.bundleSize / 1024 * 0.35,
    assetCount: metrics.assets.length,
    topAssets: metrics.assets.slice(0, 10),
  };
}

async function main() {
  const metrics = await readBuildMetrics();
  await formatMetricsReport(metrics);

  // Exit with appropriate code
  if (!metrics) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
