import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarize } from '../src/model.js';
import { groupMapRecords, indexMapLocations, clusteredMapFeatures } from '../src/map-data.js';
import { loadExportManifest, readExport, scenarioRecords, sha256 } from '../tests/export-helpers.js';

const manifest = loadExportManifest();
for (const fixture of manifest.fixtures) {
  assert.equal(sha256(fs.readFileSync(fixture.path)), fixture.sha256, `${fixture.name}: CSV changed; regenerate cases`);
  const records = readExport(fixture.path);
  assert.equal(records.length, fixture.rows, `${fixture.name}: raw rows`);
  assert.deepEqual(summarize(records), fixture.expected, `${fixture.name}: independent Python totals`);
  const points = groupMapRecords(records, 'off');
  assert.equal(points.length, fixture.expected.locations);
  const index = indexMapLocations(points);
  for (const zoom of [0, 3, 7, 12, 15]) {
    const features = clusteredMapFeatures(index, zoom);
    assert.equal(
      features.reduce((sum, feature) => sum + feature.properties.observations, 0),
      fixture.expected.observations,
      `${fixture.name}: zoom ${zoom} observations`,
    );
    assert.equal(
      features.reduce((sum, feature) => sum + feature.properties.locations, 0),
      fixture.expected.locations,
      `${fixture.name}: zoom ${zoom} locations`,
    );
    // A cluster must equal the union of the original member records, not a sum of richness values.
    const byLocation = new Map();
    for (const record of records) {
      if (!byLocation.has(record.locationId)) byLocation.set(record.locationId, []);
      byLocation.get(record.locationId).push(record);
    }
    for (const feature of features) {
      const ids = feature.properties.cluster
        ? index.getLeaves(feature.properties.cluster_id, Infinity).map((point) => point.properties.id)
        : [feature.properties.id];
      const expected = summarize(ids.flatMap((id) => byLocation.get(id)));
      for (const key of ['species', 'checklists', 'observations', 'locations'])
        assert.equal(feature.properties[key], expected[key], `${fixture.name}: zoom ${zoom} cluster ${key}`);
    }
  }
  if (fixture.name === 'full') {
    for (const scenario of manifest.scenarios) {
      const selected = scenarioRecords(records, scenario);
      assert.equal(selected.length, scenario.rows, `${scenario.name}: rows`);
      assert.deepEqual(summarize(selected), scenario.expected, `${scenario.name}: independent Python totals`);
    }
    for (const grouping of ['country', 'region']) {
      const grouped = groupMapRecords(records, grouping);
      assert.deepEqual(
        grouped.map((point) => point.properties.id).sort(),
        Object.keys(manifest.groups[grouping]).sort(),
      );
      for (const point of grouped) {
        for (const [key, value] of Object.entries(manifest.groups[grouping][point.properties.id]))
          assert.equal(point.properties[key], value, `${grouping}: ${key}`);
      }
    }
  }
  console.log(
    `Passed ${fixture.name}: ${records.length} rows, independent totals, and exact cluster unions at five zoom levels.`,
  );
}
console.log(`Passed ${manifest.scenarios.length} real-export filter/polygon cases and every country/region group.`);
