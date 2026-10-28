import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  filterRecords,
  normalizeRecord,
  pointInPolygon,
  unwrapPolygon,
  polygonError,
  summarize,
  taxonomyIndex,
  ebirdSummaryLinks,
} from '../src/model.js';
import {
  groupMapRecords,
  indexMapLocations,
  clusteredMapFeatures,
  renderMapFeatures,
  boundaryMapFeatures,
  formatMapCount,
} from '../src/map-data.js';

const taxonomy = JSON.parse(fs.readFileSync('src/assets/eBird_taxonomy.json', 'utf8'));
const index = taxonomyIndex(taxonomy);
const base = {
  'Submission ID': 'S1',
  'Location ID': 'L1',
  Location: 'Test site',
  Longitude: '6',
  Latitude: '46',
  'State/Province': 'CH-VD',
  Date: '2025-06-01',
  Count: 'X',
};
const row = (taxon, changes = {}) =>
  normalizeRecord({ ...base, 'Scientific Name': taxon.sciName, 'Common Name': taxon.comName, ...changes }, index);
const species = taxonomy.find((taxon) => taxon.speciesCode === 'brant');
const form = taxonomy.find((taxon) => taxon.category === 'form' && taxon.reportAs === species.speciesCode);
const intergrade = taxonomy.find((taxon) => taxon.category === 'intergrade' && taxon.reportAs === species.speciesCode);
const issf = taxonomy.find((taxon) => taxon.category === 'issf' && taxon.reportAs === species.speciesCode);
assert.equal(
  summarize([row(species), row(form), row(intergrade), row(issf)]).species,
  1,
  'Species, forms, subspecies and intergrades must share a species ID',
);
assert.equal(row(species).count, null, 'X is present with unknown abundance');
assert.equal(summarize([row(species)]).observations, 1, 'X still counts as an observation');
for (const category of ['spuh', 'slash', 'hybrid']) {
  const record = row(taxonomy.find((taxon) => taxon.category === category));
  assert.equal(record.species, null, `${category} must not inflate species totals`);
  assert.equal(summarize([record]).observations, 1, `${category} stays in the data`);
}
const domestic = taxonomy.find((taxon) => taxon.category === 'domestic' && taxon.reportAs);
const domesticParent = index.code.get(domestic.reportAs);
for (const exotic of ['', 'N', 'P']) {
  assert.equal(row(domestic, { 'Exotic Code': exotic }).species, domesticParent.speciesCode);
  assert.equal(
    summarize([row(domestic, { 'Exotic Code': exotic })]).species,
    1,
    'Domestic eligibility comes from observation status, not taxonomy category',
  );
  assert.equal(
    summarize([row(domestic, { 'Exotic Code': exotic }), row(domesticParent)]).species,
    1,
    'Domestic and parent species share one ID',
  );
}
assert.equal(summarize([row(domestic, { 'Exotic Code': 'X' })]).species, 0);
assert.equal(summarize([row(domestic)]).species, 1, 'Missing status is included in the qualified taxonomy total');
assert.equal(row(domestic).exotic, null, 'Absent status is unknown');
assert.equal(row(domestic, { 'Exotic Code': '' }).exotic, '', 'Blank status in a supplied column represents native');
assert.equal(
  row(taxonomy.find((taxon) => taxon.category === 'domestic' && !taxon.reportAs)).species,
  null,
  'Ambiguous domestic groups must not imply a species',
);
const unmatched = row({ sciName: 'Unmatched test taxon', comName: 'Unmatched test' });
assert.equal(unmatched.category, 'unmatched');
assert.equal(unmatched.species, null);
assert.equal(summarize([unmatched]).observations, 1);
assert.equal(summarize([row(species, { Count: '0' })]).species, 0, 'Zero-count records do not imply presence');
assert.equal(summarize([row(species, { Count: '0' })]).checklists, 1, 'A zero-count checklist is retained');
assert.equal(
  filterRecords([row(species, { Count: '0' })], { code: species.speciesCode, additional: true }).length,
  0,
  'A zero count must not become a sighting when selecting a species',
);
assert.equal(summarize([row(species, { 'Exotic Code': 'X' })]).species, 0, 'Known escapees do not add species');
assert.equal(summarize([row(species, { 'Exotic Code': 'P' })]).species, 1, 'Provisional records remain countable');
const regionalRecords = [
  row(domestic, { 'Exotic Code': 'X', 'Location ID': 'escapee', Longitude: '6', 'State/Province': 'FR-IDF' }),
  row(domestic, { 'Exotic Code': 'N', 'Location ID': 'naturalized', Longitude: '7', 'State/Province': 'FR-IDF' }),
  row(domesticParent, { 'Exotic Code': 'P', 'Location ID': 'provisional', Longitude: '8', 'State/Province': 'CH-VD' }),
];
assert.equal(summarize(regionalRecords).species, 1);
assert.equal(
  summarize(filterRecords(regionalRecords, { locationId: 'escapee', additional: true })).species,
  0,
  'An eligible sighting elsewhere must not make an escapee location countable',
);
assert.equal(
  summarize(
    regionalRecords.filter((record) =>
      pointInPolygon(
        [record.longitude, record.latitude],
        [
          [5.5, 45],
          [6.5, 45],
          [6.5, 47],
          [5.5, 47],
        ],
      ),
    ),
  ).species,
  0,
);
assert.equal(
  groupMapRecords(regionalRecords, 'region').find((point) => point.properties.id === 'FR-IDF').properties.species,
  1,
  'Mixed statuses in a region count an eligible species once',
);
assert.equal(groupMapRecords(regionalRecords).find((point) => point.properties.id === 'escapee').properties.species, 0);
assert.equal(
  filterRecords(regionalRecords, { additional: false }).length,
  2,
  'Known escapees may be hidden without removing eligible domestic sightings',
);
assert.equal(
  pointInPolygon(
    [0.3, 0.3],
    [
      [0, 0],
      [2, 0],
      [0, 2],
    ],
  ),
  true,
);
assert.equal(
  pointInPolygon(
    [1.8, 1.8],
    [
      [0, 0],
      [2, 0],
      [0, 2],
    ],
  ),
  false,
  'Polygon containment must not use just its bounding box',
);
for (const point of [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
])
  assert.equal(
    pointInPolygon(point, [
      [0, 0],
      [2, 0],
      [0, 2],
    ]),
    true,
    'Polygon boundaries are included',
  );
const concave = [
  [0, 0],
  [4, 0],
  [4, 4],
  [2, 2],
  [0, 4],
];
assert.equal(pointInPolygon([2, 3], concave), false);
assert.equal(pointInPolygon([1, 1], concave), true);
assert.equal(polygonError(concave), null);
assert.ok(
  polygonError([
    [0, 0],
    [2, 2],
    [0, 2],
    [2, 0],
  ]),
  'Crossed edges must be rejected',
);
assert.ok(
  polygonError([
    [0, 0],
    [1, 1],
    [2, 2],
  ]),
  'Collinear corners must be rejected',
);
assert.ok(
  polygonError([
    [0, 0],
    [1, 1],
  ]),
);
const datelinePolygon = unwrapPolygon([
  [178, -10],
  [-178, -10],
  [-178, 10],
  [178, 10],
]);
assert.equal(polygonError(datelinePolygon), null);
for (const longitude of [-179, 179, 180, -180]) assert.equal(pointInPolygon([longitude, 0], datelinePolygon), true);
assert.equal(pointInPolygon([0, 0], datelinePolygon), false);
assert.equal(filterRecords([row(species)], { from: '2024-01', to: '2024-12', additional: true }).length, 0);
assert.equal(filterRecords([row(species)], { from: '2025-06', to: '2025-06', additional: true }).length, 1);
assert.equal(filterRecords([row(species), unmatched], { additional: false }).length, 1);
console.log(
  'Passed: taxonomy roll-up, all additional categories, unmatched taxa, X/zero counts, exotic status, polygon containment, and combined filters.',
);

const mallard = taxonomy.find((taxon) => taxon.sciName === 'Anas platyrhynchos' && taxon.category === 'species');
const clusterRows = [
  row(species, { Count: '5', 'Location ID': 'L1', Longitude: '6' }),
  row(species, { 'Submission ID': 'S2', 'Location ID': 'L2', Longitude: '6.01' }),
  row(mallard, { Count: '2', 'Submission ID': 'S2', 'Location ID': 'L2', Longitude: '6.01' }),
  row(species, { 'Location ID': 'L3', Longitude: '6.02' }),
  row(species, { Count: '0', 'Submission ID': 'S4', 'Location ID': 'L4', Longitude: '6.03' }),
  row(
    taxonomy.find((taxon) => taxon.category === 'hybrid'),
    { 'Submission ID': 'S3', 'Location ID': 'L3', Longitude: '6.02', 'State/Province': 'CH-GE' },
  ),
];
const points = groupMapRecords(clusterRows);
assert.equal(points.length, 4);
assert.equal(groupMapRecords(clusterRows, 'country').length, 1);
assert.equal(groupMapRecords(clusterRows, 'region').length, 2);
const rendered = renderMapFeatures(points);
assert.equal(rendered.length, points.length, 'Unclustered rendering must retain every location');
for (let i = 0; i < rendered.length; i++) {
  assert.equal(rendered[i].properties.speciesIds, undefined, 'Large ID sets stay out of the rendering payload');
  assert.equal(rendered[i].properties.checklistIds, undefined);
  for (const key of ['id', 'species', 'checklists', 'observations', 'individuals', 'locations'])
    assert.equal(rendered[i].properties[key], points[i].properties[key]);
}
assert.ok(points[0].properties.speciesIds, 'Rendering must not mutate counting data');
const clusterIndex = indexMapLocations(points);
const root = clusteredMapFeatures(clusterIndex, 0)[0].properties;
assert.equal(root.species, 2, 'A shared species is counted once across locations');
assert.equal(root.checklists, 4, 'Repeated checklist IDs are counted once across locations');
assert.equal(root.observations, 5, 'Observation records include X but exclude zeros');
assert.equal(root.individuals, 7, 'Numeric counts are summed; X and zeros add nothing');
assert.equal(summarize(clusterRows).individuals, 7);
assert.equal(root.locations, 4, 'Zero-only locations are retained');
for (const zoom of [0, 5, 10, 14, 16]) {
  for (const feature of clusteredMapFeatures(clusterIndex, zoom)) {
    const members = feature.properties.cluster
      ? clusterIndex.getLeaves(feature.properties.cluster_id, Infinity)
      : [feature];
    const ids = new Set(members.map((point) => point.properties.id));
    const expected = summarize(clusterRows.filter((record) => ids.has(record.locationId)));
    for (const key of ['species', 'checklists', 'observations', 'individuals', 'locations'])
      assert.equal(feature.properties[key], expected[key], `${key} at zoom ${zoom} must match its own cluster members`);
  }
}
const dateline = groupMapRecords(
  [
    row(species, { 'Location ID': 'west', Longitude: '-179' }),
    row(species, { 'Location ID': 'east', Longitude: '179' }),
  ],
  'country',
);
assert.ok(
  Math.abs(dateline[0].geometry.coordinates[0]) > 179,
  'Administrative groups spanning the dateline must not be placed near Greenwich',
);
console.log(
  'Passed: exact cluster unions across zoom levels, country/region grouping, observation/location metrics, and dateline centroid.',
);

if (fs.existsSync('local/data.local.json')) {
  const sample = JSON.parse(fs.readFileSync('local/data.local.json', 'utf8'));
  const actual = summarize(sample.records);
  for (const key of ['species', 'checklists', 'locations', 'countries', 'observations', 'additional'])
    assert.equal(actual[key], sample.profile.sample[key], `Sample ${key} must reconcile with the full-file profiler`);
  console.log(
    `Private sample reconciled: ${sample.records.length} raw rows, ${actual.checklists} complete checklists, ${actual.locations} locations.`,
  );
}

const boundaries = JSON.parse(fs.readFileSync('src/assets/countries-v1.json', 'utf8'));
const boundaryIndex = new Map(boundaries.features.map((feature) => [feature.properties.code, feature]));
assert.equal(boundaryIndex.size, boundaries.features.length, 'Each country code has exactly one boundary feature');
for (const feature of boundaries.features) {
  assert.ok(feature.properties.label.every(Number.isFinite));
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons)
    for (const ring of polygon) {
      assert.deepEqual(ring[0], ring.at(-1), 'Boundary rings must close');
      assert.ok(
        new Set(ring.map((point) => point.join(','))).size >= 3,
        'Low-precision boundaries must retain a real ring',
      );
    }
}
const countryPoints = groupMapRecords(clusterRows, 'country');
const missingCountry = { ...countryPoints[0], properties: { ...countryPoints[0].properties, id: 'XX' } };
const countryView = boundaryMapFeatures([...countryPoints, missingCountry], boundaryIndex);
assert.equal(countryView.polygons.length, 1);
assert.equal(countryView.circles.length, 1);
assert.equal(countryView.circles[0].properties.id, 'XX', 'Missing countries retain their circle and exact counts');
assert.equal(countryView.labels.length, 1);
for (const key of ['species', 'checklists', 'observations', 'individuals', 'locations'])
  assert.equal(
    countryView.polygons[0].properties[key],
    countryPoints[0].properties[key],
    'The visual boundary join must not change totals',
  );
assert.equal(countryView.polygons[0].properties.speciesIds, undefined);
assert.equal(
  boundaryMapFeatures(countryPoints, new Map()).circles.length,
  countryPoints.length,
  'Unavailable boundaries fall back to circles',
);
console.log(
  `Passed: ${boundaryIndex.size} valid country boundaries, country-code joins, exact metric totals, and missing-boundary fallbacks.`,
);

const dateRows = ['2024-12-31', '2025-01-01', '2025-01-31', '2025-02-01', '2025-12-31', '2026-01-01'].map((date, i) =>
  row(species, { Date: date, 'Submission ID': `DATE-${i}`, 'Location ID': `DATE-L${i}` }),
);
assert.equal(
  filterRecords(dateRows, { from: '2025-01', to: '2025-01', additional: true }).length,
  2,
  'A month range includes its first and last days',
);
assert.equal(
  filterRecords(dateRows, { from: '2024-12', to: '2025-01', additional: true }).length,
  3,
  'Ranges cross year boundaries',
);
assert.equal(filterRecords(dateRows, { from: '2025-12', additional: true }).length, 2, 'From-only is open ended');
assert.equal(filterRecords(dateRows, { to: '2025-01', additional: true }).length, 3, 'To-only includes earlier dates');
assert.equal(filterRecords(dateRows, { additional: true }).length, dateRows.length, 'Blank bounds include all dates');
assert.equal(summarize(filterRecords(dateRows, { from: '2025-01', to: '2025-01', additional: true })).checklists, 2);
assert.equal(
  groupMapRecords(filterRecords(dateRows, { from: '2025-01', to: '2025-01', additional: true })).length,
  2,
  'The map uses the date-filtered locations',
);
console.log('Passed: inclusive month/year ranges, year boundaries, open bounds, and filtered map/checklist totals.');

for (const [value, expected] of [
  [0, '0'],
  [999, '999'],
  [1000, '1K'],
  [1250, '1.3K'],
  [999949, '999.9K'],
  [999950, '1M'],
  [1000000, '1M'],
  [2450000, '2.5M'],
])
  assert.equal(formatMapCount(value), expected);
const compactPoint = renderMapFeatures([
  { ...points[0], properties: { ...points[0].properties, observations: 1250, individuals: 2450000 } },
])[0];
assert.equal(compactPoint.properties.observations, 1250, 'Compact labels must not replace numerical totals');
assert.equal(compactPoint.properties.observationLabel, '1.3K');
assert.equal(compactPoint.properties.individuals, 2450000);
assert.equal(compactPoint.properties.individualsLabel, '2.5M');
assert.equal(formatMapCount(0, 1), 'X', 'Presence without numeric counts is displayed as X');
assert.equal(formatMapCount(0, 0), '0', 'Empty and zero-only groups still display zero');
assert.equal(formatMapCount(5, 2), '5', 'Mixed numeric and X observations keep the numeric sum');
for (const grouping of ['off', 'country', 'region']) {
  const unknownPoints = groupMapRecords([row(species)], grouping);
  assert.equal(renderMapFeatures(unknownPoints)[0].properties.individualsLabel, 'X');
  const unknownCluster = clusteredMapFeatures(indexMapLocations(unknownPoints), 0);
  assert.equal(renderMapFeatures(unknownCluster)[0].properties.individualsLabel, 'X');
}

console.log('Passed: K/M map labels, million-boundary rounding, and preservation of exact observation totals.');

const regionLevels = ['FR-', 'FR-ARA', 'CH-VD', 'XX-'].map((region, i) =>
  row(species, { 'State/Province': region, 'Location ID': `LEVEL-${i}`, 'Submission ID': `LEVEL-S${i}` }),
);
assert.deepEqual(
  groupMapRecords(regionLevels, 'region')
    .map((point) => point.properties.id)
    .sort(),
  ['CH-VD', 'FR-ARA'],
);
assert.equal(groupMapRecords(regionLevels, 'off').length, 4, 'Country-only records remain available in location mode');
assert.equal(
  groupMapRecords(regionLevels, 'country').find((point) => point.properties.id === 'FR').properties.checklists,
  2,
  'Country mode still includes country-only records',
);
assert.equal(summarize(regionLevels).checklists, 4, 'Hiding country-level map groups must not alter overall totals');
console.log('Passed: region view hides country-only entries while retaining overall, country, and location counts.');

assert.deepEqual(ebirdSummaryLinks('L5065805', ['S1'], 'mallar3'), {
  species: 'https://ebird.org/lifelist/L5065805?spp=mallar3',
  checklists: 'https://ebird.org/checklist/S1',
});
for (const scope of ['L5065805', 'FR', 'FR-ARA']) {
  assert.equal(ebirdSummaryLinks(scope, ['S1', 'S2'], 'mallar3').checklists, `https://ebird.org/mychecklists/${scope}`);
  assert.equal(
    ebirdSummaryLinks(scope, ['S1', 'S2'], 'mallar3').species,
    `https://ebird.org/lifelist/${scope}?spp=mallar3`,
  );
  assert.equal(ebirdSummaryLinks(scope, ['S1']).species, `https://ebird.org/lifelist/${scope}`);
}

assert.equal(row(species).taxonOrder, species.taxonOrder, 'Species sort in eBird taxonomy order');
assert.equal(row(form).taxonOrder, species.taxonOrder, 'Rolled-up forms use their parent taxonomic position');

const seasonalRecords = ['2023-01-10', '2023-06-10', '2023-12-10', '2024-01-10', '2024-06-10', '2024-12-10'].map(
  (Date) => row(species, { Date }),
);
assert.equal(
  filterRecords(seasonalRecords, { monthFrom: '06', monthTo: '06', additional: true }).length,
  2,
  'A month filter works without selecting years',
);
assert.equal(
  filterRecords(seasonalRecords, { yearFrom: '2024', yearTo: '2024', additional: true }).length,
  3,
  'A year filter works without selecting months',
);
assert.equal(
  filterRecords(seasonalRecords, { yearFrom: '2024', yearTo: '2024', monthFrom: '12', monthTo: '02', additional: true })
    .length,
  2,
  'Winter wraps across December independently of the calendar year filter',
);
for (const taxon of taxonomy.filter((taxon) => ['spuh', 'slash', 'hybrid'].includes(taxon.category)))
  assert.equal(row(taxon).species, null, `${taxon.sciName} must never contribute to the species total`);
console.log(
  'Passed: independent years and recurring seasons, winter wraparound, and exclusion of every spuh, slash, and hybrid.',
);
