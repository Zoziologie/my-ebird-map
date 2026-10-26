import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { summarize } from '../src/model.js';
import { groupMapRecords, indexMapLocations, clusteredMapFeatures, renderMapFeatures } from '../src/map-data.js';
import { loadExportManifest, readExport, scenarioRecords, sha256 } from '../tests/export-helpers.js';

const manifest = loadExportManifest();
const repetitions = Number(process.argv[2] || 5);
const results = [];
for (const fixture of manifest.fixtures) {
  assert.equal(sha256(fs.readFileSync(fixture.path)), fixture.sha256, 'CSV changed; regenerate cases');
  const timings = {};
  let payloadBytes;
  for (let iteration = 0; iteration <= repetitions; iteration++) {
    const measure = (name, operation) => {
      const started = performance.now();
      const result = operation();
      if (iteration) (timings[name] ||= []).push(performance.now() - started);
      return result;
    };
    const records = measure('readParseNormalize', () => readExport(fixture.path));
    assert.deepEqual(
      measure('summarize', () => summarize(records)),
      fixture.expected,
    );
    const points = measure('groupLocations', () => groupMapRecords(records, 'off'));
    const index = measure('clusterIndex', () => indexMapLocations(points));
    for (const zoom of [0, 3, 7, 12, 15]) {
      const features = measure(`clustersZoom${zoom}`, () => clusteredMapFeatures(index, zoom));
      assert.equal(
        features.reduce((sum, feature) => sum + feature.properties.locations, 0),
        fixture.expected.locations,
      );
    }
    const payload = measure('renderPayload', () => JSON.stringify(renderMapFeatures(points)));
    payloadBytes = Buffer.byteLength(payload);
    measure('groupCountries', () => groupMapRecords(records, 'country'));
    measure('groupRegions', () => groupMapRecords(records, 'region'));
    for (const scenario of manifest.scenarios) {
      const selected = measure(`filter:${scenario.name}`, () => scenarioRecords(records, scenario));
      if (fixture.name === 'full') assert.deepEqual(summarize(selected), scenario.expected);
    }
  }
  results.push({
    fixture: fixture.name,
    sourceSha256: fixture.sha256,
    rows: fixture.rows,
    totals: fixture.expected,
    payloadBytes,
    timingsMs: Object.fromEntries(
      Object.entries(timings).map(([name, samples]) => {
        const sorted = [...samples].sort((a, b) => a - b);
        return [
          name,
          {
            median: sorted[Math.floor(sorted.length / 2)],
            p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
            min: sorted[0],
            max: sorted.at(-1),
            samples,
          },
        ];
      }),
    ),
  });
}
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0].model,
  repetitions,
  warmupRuns: 1,
  taxonomySha256: manifest.taxonomySha256,
  peakProcessRssMB: process.resourceUsage().maxRSS / 1024,
  note: 'Warm filesystem Node benchmark with one warmup per fixture. Includes disk read, CSV parsing and normalization; excludes browser worker messaging, IndexedDB, rendering and network. Peak RSS is process-wide, not per fixture. No timing pass/fail thresholds.',
  results,
};
fs.mkdirSync('output/benchmarks', { recursive: true });
fs.writeFileSync('output/benchmarks/ebird-export.json', JSON.stringify(report, null, 2) + '\n');
console.table(
  results.map((result) => ({
    fixture: result.fixture,
    rows: result.rows,
    importMedianMs: result.timingsMs.readParseNormalize.median.toFixed(1),
    indexMedianMs: result.timingsMs.clusterIndex.median.toFixed(1),
    payloadKiB: (result.payloadBytes / 1024).toFixed(1),
  })),
);
console.log('Saved output/benchmarks/ebird-export.json');
