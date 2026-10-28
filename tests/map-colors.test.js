import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  datasetMapScales,
  continuousMapColor,
  continuousMapColorValue,
  mapPalette,
  mapMetricColor,
} from '../src/map-colors.js';

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

test('all groupings use exact full-file maxima and taxon selection restores predictably', () => {
  const full = datasetMapScales(records);
  const selected = datasetMapScales(records, new Set(['selected-species']));
  assert.deepEqual(selected, datasetMapScales(records, new Set(['selected-form'])));
  for (const grouping of ['off', 'auto', 'region', 'country']) {
    assert.deepEqual(selected.maxima[grouping], {
      species: 1,
      checklists: 3,
      observations: 3,
      individuals: 3,
      locations: 1,
    });
    assert.equal(full.maxima[grouping].checklists, 101);
    assert.equal(full.maxima[grouping].observations, 100);
    assert.deepEqual(datasetMapScales([]).maxima[grouping], {
      species: 0,
      checklists: 0,
      observations: 0,
      individuals: 0,
      locations: 0,
    });
  }
  assert.deepEqual(datasetMapScales(records, new Set()), full);
});

test('continuous endpoints are exact for small counts and maxima including 1966 and 3176', () => {
  for (const maximum of [2, 3, 6, 1966, 3176]) {
    const expression = continuousMapColor(['get', 'checklists'], maximum).at(-1);
    assert.equal(expression[3], Math.log(2));
    assert.equal(expression[4], mapPalette[0]);
    assert.equal(expression.at(-2), Math.log(maximum + 1));
    assert.equal(expression.at(-1), mapPalette.at(-1));
    assert.equal(continuousMapColorValue(1, maximum), 'rgb(68, 1, 84)');
    assert.equal(continuousMapColorValue(maximum, maximum), 'rgb(253, 231, 37)');
    assert.equal(continuousMapColorValue(maximum * 2, maximum), 'rgb(253, 231, 37)');
  }
  assert.equal(continuousMapColorValue(0, 0), '#87939b');
  assert.equal(continuousMapColorValue(1, 1), 'rgb(253, 231, 37)');
});

test('displayed High Seas totals contribute to both country and region maxima', () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({
    checklist: `S${i}`,
    locationId: `L${i % 3}`,
    location: 'Site',
    longitude: 6,
    latitude: 46,
    species: 'bird',
    code: 'bird',
    count: 1,
    country: i < 100 ? 'XX' : 'CH',
    region: i < 100 ? 'XX-' : 'CH-VD',
  }));
  const scales = datasetMapScales(rows);
  for (const grouping of ['country', 'region']) {
    assert.equal(scales.maxima[grouping].checklists, 100);
    assert.equal(scales.maxima[grouping].species, 1);
    assert.equal(scales.maxima[grouping].locations, 3);
  }
});

test('replay and normal maps share continuous color expressions for every grouping', () => {
  const scales = datasetMapScales(records);
  const state = ['coalesce', ['feature-state', 'checklists'], 0];
  for (const grouping of ['off', 'auto', 'country', 'region']) {
    assert.deepEqual(
      mapMetricColor(state, grouping, scales, 'checklists'),
      continuousMapColor(state, scales.maxima[grouping].checklists),
    );
    const base = mapMetricColor(['get', 'checklists'], grouping, scales, 'checklists');
    const replay = mapMetricColor(state, grouping, scales, 'checklists');
    assert.deepEqual(replay.at(-1).slice(3), base.at(-1).slice(3));
  }
});
