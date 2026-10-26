import fs from 'node:fs';
import assert from 'node:assert/strict';
import { groupMapRecords, indexMapLocations, clusteredMapFeatures, renderMapFeatures } from '../src/map-data.js';

// Deterministic synthetic stress case; no personal observations or API calls.
const size = Number(process.argv[2] || 100000);
const records = Array.from({ length: size }, (_, i) => ({
  locationId: `L${i}`,
  checklist: `S${i}`,
  location: `Synthetic site ${i}`,
  longitude: -179 + (i % 500) * 0.716,
  latitude: -70 + (Math.floor(i / 500) % 200) * 0.7,
  country: 'US',
  region: 'US-TEST',
  species: 'mallar3',
  count: 1,
  exotic: '',
}));
const started = performance.now();
const points = groupMapRecords(records, 'off');
const grouped = performance.now();
const features = renderMapFeatures(points);
const prepared = performance.now();
assert.equal(features.length, size);
assert.equal(
  features.reduce((sum, point) => sum + point.properties.observations, 0),
  size,
);
assert.ok(features.every((point) => !('speciesIds' in point.properties) && !('checklistIds' in point.properties)));
const index = indexMapLocations(points);
const indexed = performance.now();
const world = clusteredMapFeatures(index, 0);
assert.equal(
  world.reduce((sum, point) => sum + point.properties.locations, 0),
  size,
);
const result = {
  locations: size,
  groupMs: grouped - started,
  renderPayloadMs: prepared - grouped,
  clusterIndexMs: indexed - prepared,
  renderBytes: Buffer.byteLength(JSON.stringify(features)),
  clusterFeaturesAtZoom0: world.length,
  peakRssMB: process.resourceUsage().maxRSS / 1024,
  note: 'Local Node preprocessing measurement; browser rendering and physical-phone performance must be measured separately.',
};
fs.mkdirSync('output/review', { recursive: true });
fs.writeFileSync('output/review/map-benchmark.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
