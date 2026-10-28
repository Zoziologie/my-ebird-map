import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { boundaryMapFeatures, groupMapRecords, groupMapDisplayRecords } from '../src/map-data.js';
import { regionIllustrationCells } from '../scripts/region-illustrations.mjs';
import { pointInPolygon } from '../src/model.js';

const provenance = JSON.parse(fs.readFileSync('src/assets/regions-source.json', 'utf8'));
const names = JSON.parse(fs.readFileSync('src/assets/region-names.json', 'utf8'));
const boundaries = new Map();
for (const country of Object.keys(provenance.countries)) {
  if (!provenance.countries[country].regions) continue;
  const data = JSON.parse(fs.readFileSync(`src/assets/regions-v1/${country}.json`, 'utf8'));
  for (const feature of data.features) {
    assert.ok(!boundaries.has(feature.properties.code), 'Region codes must be unique across country files');
    boundaries.set(feature.properties.code, feature);
  }
}

function contains(feature, point) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return polygons.some(
    ([outer, ...holes]) => pointInPolygon(point, outer) && !holes.some((hole) => pointInPolygon(point, hole)),
  );
}

test('prepared regions have eBird codes, source mappings, closed rings and labels inside their boundaries', () => {
  assert.equal(
    boundaries.size,
    Object.values(provenance.countries).reduce((n, country) => n + country.regions, 0),
  );
  for (const [code, feature] of boundaries) {
    assert.ok(names[code], `${code} needs an exact eBird name`);
    assert.ok(provenance.mappings[code].length, `${code} needs source provenance`);
    assert.ok(contains(feature, feature.properties.label), `${code} label must lie on its land area`);
    const polygons =
      feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon) {
        assert.deepEqual(ring[0], ring.at(-1), `${code} ring must close`);
        assert.ok(new Set(ring.map((point) => point.join(','))).size >= 3, `${code} ring must not collapse`);
        assert.ok(
          ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90),
        );
      }
  }
});

test('country-specific merges cover representative cities, Alaska and island groups', () => {
  for (const [code, point] of [
    ['US-CA', [-121.49, 38.58]],
    ['US-AK', [-149.9, 61.22]],
    ['US-HI', [-157.86, 21.31]],
    ['FR-ARA', [4.8357, 45.764]],
    ['FR-IDF', [2.35, 48.85]],
    ['FR-COR', [9.15, 42.3]],
    ['IT-25', [9.19, 45.464]],
    ['IT-82', [13.36, 38.115]],
    ['ES-CT', [2.17, 41.39]],
    ['ES-CN', [-15.43, 28.1]],
    ['BE-VLG', [3.72, 51.05]],
    ['BE-WAL', [4.87, 50.47]],
    ['GB-ENG', [-0.1276, 51.5072]],
    ['GB-SCT', [-3.1883, 55.9533]],
    ['GB-WLS', [-3.1791, 51.4816]],
    ['GB-NIR', [-5.9301, 54.5973]],
    ['CH-VD', [6.63, 46.52]],
  ])
    assert.ok(contains(boundaries.get(code), point), `${code} must contain ${point}`);
  assert.equal(provenance.mappings['FR-ARA'].length, 12, 'All twelve departments form Auvergne-Rhône-Alpes');
  assert.equal(provenance.mappings['IT-25'].length, 12, 'All twelve source provinces form Lombardia');
});

test('the global inventory accounts for every eBird region and never reuses a source part for two codes', () => {
  const accounted = new Set(boundaries.keys());
  const sourceIds = new Set();
  for (const [country, coverage] of Object.entries(provenance.countries)) {
    assert.equal(coverage.expected, Object.keys(names).filter((code) => code.startsWith(`${country}-`)).length);
    assert.equal(coverage.expected, coverage.regions + coverage.missing.length);
    for (const code of coverage.missing) {
      assert.ok(!accounted.has(code));
      accounted.add(code);
    }
  }
  assert.deepEqual([...accounted].sort(), Object.keys(names).sort());
  for (const ids of Object.values(provenance.mappings))
    for (const id of ids) {
      assert.ok(!sourceIds.has(id), `${id} must not colour two eBird regions`);
      sourceIds.add(id);
    }
});

test('global rekeys, historical unions and supplementary sources cover representative locations', () => {
  for (const [code, point] of [
    ['BR-SP', [-46.63, -23.55]],
    ['ZA-GT', [28.19, -25.75]],
    ['AO-LUA', [13.23, -8.84]],
    ['AU-NSW', [151.2, -33.87]],
    ['JP-13', [139.69, 35.69]],
    ['CN-11', [116.4, 39.9]],
    ['PR-SJ', [-66.06, 18.4]],
    ['NP-3', [85.3, 27.7]],
    ['IE-M', [-8.47, 51.9]],
    ['KR-50', [126.53, 33.47]],
    ['KR-36', [127.29, 36.48]],
    ['AF-PIA', [69.23, 33.6]],
    ['AF-PKA', [68.73, 33.17]],
    ['KZ-ALA', [76.9, 43.24]],
    ['TZ-14', [33.45, -8.91]],
    ['TZ-30', [32.93, -9.11]],
    ['TZ-29', [31.04, -6.34]],
    ['TZ-28', [33.99, -2.8]],
    ['TZ-31', [34.77, -9.33]],
    ['VN-01', [105.84, 21.03]],
    ['VN-79', [106.7, 10.78]],
  ]) {
    assert.ok(boundaries.has(code), `${code} needs a prepared boundary`);
    assert.ok(contains(boundaries.get(code), point), `${code} must contain ${point}`);
  }
  assert.ok(!contains(boundaries.get('KZ-ALM'), [76.9, 43.24]), 'Almaty city must not also colour Almaty province');
  assert.equal(provenance.mappings['MK-307'].length, 5, 'Kicevo includes its four former neighbouring municipalities');
  assert.equal(Object.keys(provenance.mappings).filter((code) => code.startsWith('VN-')).length, 34);
});

test('country coverage follows eBird territory codes and separates overseas territories', () => {
  const countryNames = JSON.parse(fs.readFileSync('src/assets/country-names.json', 'utf8'));
  const countries = JSON.parse(fs.readFileSync('src/assets/countries-v1.json', 'utf8')).features;
  const index = new Map(countries.map((f) => [f.properties.code, f]));
  assert.deepEqual(
    [...index.keys()].sort(),
    Object.keys(countryNames)
      .filter((code) => code !== 'XX')
      .sort(),
  );
  assert.equal(countryNames.AC, 'Ashmore and Cartier Islands');
  assert.equal(countryNames.CS, 'Coral Sea Islands');
  assert.equal(countryNames.XX, 'High Seas');
  assert.ok(contains(index.get('RE'), [55.5, -21.1]));
  assert.ok(!contains(index.get('FR'), [55.5, -21.1]), 'Reunion must not colour France as well');
  assert.ok(contains(index.get('GF'), [-53, 4]));
  assert.ok(!contains(index.get('FR'), [-53, 4]));
  assert.ok(contains(index.get('SJ'), [16, 78.5]));
  assert.ok(!contains(index.get('NO'), [16, 78.5]));
  assert.ok(contains(index.get('FI'), [19.96, 60.2]), 'Aland belongs to Finland in eBird');
});

test('a mixed polygon/circle region view preserves distinct counts and exported membership', () => {
  const records = [
    {
      region: 'FR-ARA',
      country: 'FR',
      locationId: 'L1',
      longitude: 0,
      latitude: 0,
      species: 'bird1',
      checklist: 'S1',
      count: 1,
    },
    {
      region: 'FR-ARA',
      country: 'FR',
      locationId: 'L1',
      longitude: 0,
      latitude: 0,
      species: 'bird1',
      checklist: 'S1',
      count: 2,
    },
    {
      region: 'FR-ARA',
      country: 'FR',
      locationId: 'L2',
      longitude: 1,
      latitude: 1,
      species: 'bird2',
      checklist: 'S2',
      count: 1,
    },
    {
      region: 'ZZ-01',
      country: 'ZZ',
      locationId: 'L3',
      longitude: 12,
      latitude: 55,
      species: 'bird1',
      checklist: 'S3',
      count: 1,
    },
  ];
  const points = groupMapRecords(records, 'region');
  const view = boundaryMapFeatures(points, boundaries);
  assert.deepEqual(
    view.polygons.map((f) => f.properties.id),
    ['FR-ARA'],
  );
  assert.deepEqual(
    view.circles.map((f) => f.properties.id),
    ['ZZ-01'],
  );
  assert.equal(view.polygons[0].properties.species, 2);
  assert.equal(view.polygons[0].properties.checklists, 2);
  for (const feature of [...view.polygons, ...view.circles]) {
    const original = points.find((point) => point.properties.id === feature.properties.id);
    for (const metric of ['species', 'checklists', 'observations', 'locations'])
      assert.equal(feature.properties[metric], original.properties[metric]);
    assert.equal(feature.properties.speciesIds, undefined);
    assert.equal(feature.properties.checklistIds, undefined);
  }
  assert.equal(
    boundaryMapFeatures(points, new Map()).circles.length,
    points.length,
    'Unavailable downloads leave every group visible',
  );
  assert.equal(boundaries.get('DK-01').properties.approximate, true);
  assert.ok(boundaries.has('IE-L'));
  assert.deepEqual(provenance.countries.FI.missing, []);
});

test('illustrative partitions cover the input rectangle without overlapping interiors', () => {
  const seeds = [
    { code: 'a', coordinates: [1, 1] },
    { code: 'b', coordinates: [3, 1] },
    { code: 'c', coordinates: [2, 3] },
  ];
  const cells = regionIllustrationCells(seeds, [0, 0, 4, 4]);
  const area = cells.reduce((sum, f) => {
    const r = f.geometry.coordinates[0];
    return sum + Math.abs(r.slice(0, -1).reduce((s, [x, y], i) => s + x * r[i + 1][1] - r[i + 1][0] * y, 0)) / 2;
  }, 0);
  assert.ok(Math.abs(area - 16) < 1e-8);
  for (const seed of seeds)
    assert.ok(
      contains(
        cells.find((f) => f.properties.code === seed.code),
        seed.coordinates,
      ),
    );
  for (let x = 0.13; x < 4; x += 0.27)
    for (let y = 0.17; y < 4; y += 0.29) assert.equal(cells.filter((f) => contains(f, [x, y])).length, 1);
  const approximate = [...boundaries.values()].filter((f) => f.properties.approximate);
  assert.equal(approximate.length, 58);
  for (const f of approximate) assert.ok(f.properties.boundaryMethod);
  assert.equal(provenance.summary.boundaryPolygons + provenance.summary.illustrations, Object.keys(names).length);
  assert.equal(provenance.summary.regions, Object.keys(names).length);
  const countries = JSON.parse(fs.readFileSync('src/assets/countries-v1.json', 'utf8')).features;
  for (const country of ['DK', 'LY', 'QA']) {
    const parent = countries.find((f) => f.properties.code === country);
    const children = [...boundaries.values()].filter((f) => f.properties.code.startsWith(`${country}-`));
    for (const child of children)
      assert.ok(contains(parent, child.properties.label), `${child.properties.code} stays on country land`);
    const areas = [[parent], children].map((features) =>
      features.reduce((total, feature) => {
        const parts =
          feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        return (
          total +
          parts.reduce(
            (area, rings) =>
              area +
              rings.reduce((sum, ring, i) => {
                const a =
                  Math.abs(ring.slice(0, -1).reduce((n, [x, y], k) => n + x * ring[k + 1][1] - ring[k + 1][0] * y, 0)) /
                  2;
                return sum + (i === 0 ? a : -a);
              }, 0),
            0,
          )
        );
      }, 0),
    );
    assert.ok(Math.abs(areas[0] - areas[1]) < 0.001, `${country} cells partition the complete country land area`);
  }
});

test('High Seas displays one distinct total at a representative observed site', () => {
  const records = [
    {
      country: 'XX',
      region: 'XX-',
      locationId: 'ship-a',
      location: 'Atlantic cruise',
      longitude: -30,
      latitude: 10,
      species: 'bird',
      checklist: 'S1',
      count: 1,
    },
    {
      country: 'XX',
      region: 'XX-',
      locationId: 'ship-a',
      location: 'Atlantic cruise',
      longitude: -30,
      latitude: 10,
      species: 'bird',
      checklist: 'S1',
      count: 2,
    },
    {
      country: 'XX',
      region: 'XX-',
      locationId: 'ship-b',
      location: 'Pacific cruise',
      longitude: 160,
      latitude: -10,
      species: 'bird',
      checklist: 'S2',
      count: 1,
    },
  ];
  for (const grouping of ['country', 'region']) {
    const display = groupMapDisplayRecords(records, grouping);
    assert.equal(display.length, 1);
    assert.equal(display[0].properties.highSeas, true);
    assert.equal(display[0].properties.id, 'XX');
    assert.equal(display[0].properties.observations, 3);
    assert.equal(display[0].properties.species, 1);
    assert.equal(display[0].properties.checklists, 2);
    assert.equal(display[0].properties.locations, 2);
    assert.ok(
      records.some(
        (r) => r.longitude === display[0].geometry.coordinates[0] && r.latitude === display[0].geometry.coordinates[1],
      ),
    );
  }
  assert.equal(groupMapRecords(records, 'country')[0].properties.id, 'XX', 'Summary aggregation is unchanged');
});
