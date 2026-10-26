import assert from 'node:assert/strict';
import test from 'node:test';
import { exoticRulesIndex, regionalExoticStatus, exoticStatusSummary } from '../src/exotic-rules.js';
import fs from 'node:fs';
import { filterRecords, summarize, normalizeRecord, taxonomyIndex } from '../src/model.js';
import { groupMapRecords, indexMapLocations, clusteredMapFeatures } from '../src/map-data.js';

const index = exoticRulesIndex({
  goose: { world: 'X', AU: '', 'AU-NSW': 'N', 'AU-NSW-001': 'P' },
  parrot: { world: 'X', 'US-FL-011': 'P' },
  uniform: { world: 'X', 'US-FL-011': 'X' },
  domestic: { world: 'X' },
});

test('summary shows the highest category or a native/exotic mix, keeping unresolved counties separate', () => {
  const counts = { native: 0, N: 0, P: 0, X: 0, unresolved: 0 };
  assert.equal(exoticStatusSummary({ ...counts, X: 4 }).code, 'X');
  assert.equal(exoticStatusSummary({ ...counts, P: 1, X: 4 }).code, 'P');
  assert.equal(exoticStatusSummary({ ...counts, N: 2, P: 1, X: 4 }).code, 'N');
  assert.equal(exoticStatusSummary({ ...counts, native: 3 }).code, '');
  const mixed = exoticStatusSummary({ ...counts, native: 3, X: 4 });
  assert.equal(mixed.code, 'mixed');
  assert.deepEqual(mixed.categories, [
    { code: 'native', label: 'Native', count: 3 },
    { code: 'X', label: 'Escapee', count: 4 },
  ]);
  assert.deepEqual(exoticStatusSummary({ ...counts, unresolved: 3 }).categories, []);
  assert.equal(exoticStatusSummary({ ...counts, unresolved: 3, X: 4 }).code, 'X');
  assert.equal(exoticStatusSummary({ ...counts, unresolved: 3 }).code, 'unresolved');
});

test('regional rules retain blank overrides and use the most specific scope', () => {
  assert.equal(regionalExoticStatus(index, 'goose', 'AU-VIC').status, '');
  assert.equal(regionalExoticStatus(index, 'goose', 'AU-NSW-001').status, 'P');
  assert.equal(regionalExoticStatus(index, 'goose', 'AU-NSW-002').status, 'N');
  assert.equal(regionalExoticStatus(index, 'goose', 'FR-IDF').status, 'X');
  assert.equal(regionalExoticStatus(index, 'unknown', 'FR-IDF').status, '');
  assert.equal(regionalExoticStatus(index, 'domestic', 'AU-VIC').status, 'X');
});

test('missing county cannot silently inherit a conflicting broader rule', () => {
  assert.deepEqual(regionalExoticStatus(index, 'parrot', 'US-FL'), {
    status: null,
    region: null,
    needsCounty: true,
  });
  assert.equal(regionalExoticStatus(index, 'goose', 'AU-NSW').needsCounty, true);
  assert.equal(regionalExoticStatus(index, 'uniform', 'US-FL').status, 'X');
  assert.equal(regionalExoticStatus(index, 'parrot', 'US-CA').status, 'X');
  assert.equal(regionalExoticStatus(index, 'parrot', 'US').needsCounty, true);
});

test('exclude an escapee occurrence before distinct species totals, retaining wild occurrences', () => {
  const records = ['AU-VIC', 'FR-IDF'].map((region) => ({
    species: 'goose',
    region,
    date: '2026-06-01',
    count: 1,
    exotic: regionalExoticStatus(index, 'goose', region).status,
  }));
  assert.equal(summarize(records).species, 1);
  assert.equal(summarize(records.slice(1)).species, 0);
  assert.equal(filterRecords(records, { additional: false }).length, 1);
  assert.equal(summarize(records).observations, 2);
});

const data = JSON.parse(fs.readFileSync('src/assets/exotic-rules.json', 'utf8'));
const regionalIndex = exoticRulesIndex(data.rules, data.counties);
const taxonomy = taxonomyIndex(JSON.parse(fs.readFileSync('src/assets/eBird_taxonomy.json', 'utf8')));
const base = {
  'Scientific Name': 'Amazona amazonica',
  'Common Name': 'Orange-winged Amazon',
  'State/Province': 'US-FL',
  County: 'Broward',
  Count: '1',
  Date: '2026-06-01',
};

test('import retains county names, maps codes within state and applies county exceptions', () => {
  const record = normalizeRecord(base, taxonomy, regionalIndex);
  assert.equal(record.county, 'Broward');
  assert.equal(record.countyCode, 'US-FL-011');
  assert.equal(record.exotic, 'P');
  assert.equal(record.exoticRegion, 'US-FL-011');
  assert.equal(record.exoticSource, 'regional');
  assert.equal(normalizeRecord({ ...base, County: 'Palm Beach' }, taxonomy, regionalIndex).exotic, 'X');
  assert.equal(
    normalizeRecord({ ...base, County: 'Broward', 'State/Province': 'US-CA' }, taxonomy, regionalIndex).countyCode,
    null,
  );
  assert.equal(
    normalizeRecord({ ...base, County: '', 'County Code': 'US-FL-011' }, taxonomy, regionalIndex).exotic,
    'P',
  );
});

test('explicit observation status takes priority, including native blanks', () => {
  for (const status of ['', 'X', 'N', 'P']) {
    const record = normalizeRecord({ ...base, 'Exotic Code': status }, taxonomy, regionalIndex);
    assert.equal(record.exotic, status);
    assert.equal(record.exoticSource, 'observation');
    assert.equal(record.exoticNeedsCounty, false);
  }
  const missing = normalizeRecord({ ...base, County: '' }, taxonomy, regionalIndex);
  assert.equal(missing.countyCode, null);
  assert.equal(missing.exotic, null);
  assert.equal(missing.exoticNeedsCounty, true);
});

test('different taxon codes and regional statuses count once when any occurrence is eligible', () => {
  const taxonomy = taxonomyIndex([
    { sciName: 'Wild bird', speciesCode: 'wild', category: 'species' },
    { sciName: 'Domestic bird', speciesCode: 'domestic', category: 'domestic', reportAs: 'wild' },
  ]);
  const rules = exoticRulesIndex({ wild: { world: 'X', AU: '', NZ: 'N' }, domestic: { world: 'X' } });
  const records = [
    ['Wild bird', 'FR-IDF'],
    ['Domestic bird', 'AU-NSW'],
    ['Wild bird', 'AU-NSW'],
    ['Wild bird', 'NZ-AUK'],
  ].map(([name, region], i) =>
    normalizeRecord(
      {
        ...base,
        'Scientific Name': name,
        'State/Province': region,
        'Location ID': `L${i}`,
        'Submission ID': `S${i}`,
        Latitude: '0',
        Longitude: '0',
      },
      taxonomy,
      rules,
    ),
  );
  assert.deepEqual(
    records.map((r) => r.exotic),
    ['X', 'X', '', 'N'],
  );
  assert.equal(summarize(records).species, 1);
  assert.equal(summarize(records.slice(0, 2)).species, 0);
  assert.equal(summarize(records.toReversed()).species, 1);
  assert.equal(filterRecords(records, { additional: false }).length, 2);
  assert.deepEqual(
    groupMapRecords(records, 'country').map((p) => p.properties.species),
    [0, 1, 1],
  );
  const clusters = clusteredMapFeatures(indexMapLocations(groupMapRecords(records)), 0);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].properties.species, 1);
});
