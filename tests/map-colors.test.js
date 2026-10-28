import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapColorBreaks, datasetMapColorBreaks } from '../src/map-colors.js';

test('category thresholds adapt to each metric and stay ordered for small datasets', () => {
  const features = [
    { properties: { species: 100, checklists: 1000, observations: 42, individuals: 2450000, locations: 1 } },
  ];
  const breaks = mapColorBreaks(features);
  assert.equal(breaks.species.at(-1), 100);
  assert.equal(breaks.checklists.at(-1), 1000);
  assert.equal(breaks.observations.at(-1), 50);
  assert.deepEqual(breaks.locations, []);
  assert.equal(breaks.individuals.at(-1), 3000000);
  for (const values of Object.values(breaks)) {
    if (values.length) assert.ok(values[0] >= 2);
    assert.ok(values.every((value, index) => !index || value > values[index - 1]));
  }
  assert.deepEqual(datasetMapColorBreaks([]).off, mapColorBreaks([]));
});

test('small integer metrics use only meaningful categories', () => {
  for (let maximum = 0; maximum <= 6; maximum++) {
    const breaks = mapColorBreaks([
      { properties: { species: maximum, checklists: 0, observations: 0, individuals: 0, locations: 0 } },
    ]).species;
    assert.deepEqual(
      breaks,
      Array.from({ length: Math.max(0, maximum - 1) }, (_, i) => i + 2),
    );
  }
});

test('taxon selection scales use all matching records and clearing restores the full-file scale', () => {
  const records = Array.from({ length: 100 }, (_, i) => ({
    code: i < 3 ? 'selected-form' : 'other',
    species: i < 3 ? 'selected-species' : 'other',
    count: 1,
    exotic: '',
    checklist: `S${i}`,
    locationId: 'L1',
    location: 'Location',
    country: 'CH',
    region: 'CH-VD',
    longitude: 6,
    latitude: 46,
  }));
  records.push({ ...records[0], count: 0, checklist: 'S-zero' });
  const full = datasetMapColorBreaks(records);
  const selected = datasetMapColorBreaks(records, new Set(['selected-species']));
  assert.deepEqual(selected, datasetMapColorBreaks(records, new Set(['selected-form'])));
  for (const grouping of ['off', 'auto', 'region', 'country']) {
    assert.deepEqual(selected[grouping].species, []);
    assert.deepEqual(selected[grouping].checklists, [2, 3]);
    assert.deepEqual(selected[grouping].observations, [2, 3]);
    assert.deepEqual(selected[grouping].individuals, [2, 3]);
    assert.equal(full[grouping].checklists.at(-1), 200);
  }
  assert.deepEqual(datasetMapColorBreaks(records, new Set()), full);
});
