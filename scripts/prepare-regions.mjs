import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import mapshaper from 'mapshaper';
import { regionIllustrationCells } from './region-illustrations.mjs';

// Pin the same source revision as country boundaries; cache downloads outside the deployed app.
const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_10m_admin_1_states_provinces.geojson`;
const cache = `output/review/regions/${revision}.geojson`;
fs.mkdirSync('output/review/regions', { recursive: true });
if (!fs.existsSync(cache)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Region boundary download failed: ${response.status}`);
  fs.writeFileSync(cache, await response.text());
}
const source = fs.readFileSync(cache);
const sources = [
  {
    id: 'Natural Earth admin-1',
    url,
    revision,
    license: 'Public domain',
    sha256: createHash('sha256').update(source).digest('hex'),
  },
];
const names = JSON.parse(fs.readFileSync('src/assets/region-names.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync('scripts/region-boundary-rules.json', 'utf8'));
const mappings = new Map();
const features = [];
const replacedCountries = new Set(rules.supplements.filter((s) => s.mode !== 'fill').map((s) => s.country));

// Optional live audit; normal regeneration needs no API key and uses the reviewed name snapshot.
if (process.argv.includes('--verify-ebird')) {
  assert.ok(process.env.EBIRD_API_TOKEN, 'Set EBIRD_API_TOKEN or run with --env-file=.env for the live eBird audit');
  // Limit concurrency for the worldwide inventory audit.
  const inventory = Object.keys(rules.countries);
  for (let offset = 0; offset < inventory.length; offset += 6) {
    const results = await Promise.allSettled(
      inventory.slice(offset, offset + 6).map(async (country) => {
        const response = await fetch(`https://api.ebird.org/v2/ref/region/list/subnational1/${country}`, {
          headers: { 'X-eBirdApiToken': process.env.EBIRD_API_TOKEN },
        });
        if (!response.ok) throw new Error(`eBird region list for ${country} failed: ${response.status}`);
        const regions = await response.json();
        assert.deepEqual(
          regions.map(({ code, name }) => [code, name]).sort(([a], [b]) => a.localeCompare(b, 'en')),
          Object.entries(names)
            .filter(([code]) => code.startsWith(`${country}-`))
            .sort(([a], [b]) => a.localeCompare(b, 'en')),
          `Refresh and review the region-name snapshot for ${country}`,
        );
        return { country, regions: regions.length };
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      console.log(`eBird ${result.value.country}: ${result.value.regions} codes/names verified`);
    }
  }
}

// An explicit country rule selects the right administrative level; never guess from a similar name.
for (const feature of JSON.parse(source).features) {
  const sourceId = feature.properties.adm1_code;
  if (replacedCountries.has(feature.properties.iso_a2)) continue;
  if (rules.parts[sourceId]) {
    const parts = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const [code, indexes] of Object.entries(rules.parts[sourceId]))
      for (const index of indexes) {
        if (!mappings.has(code)) mappings.set(code, []);
        mappings.get(code).push(`${sourceId}:part:${index}`);
        features.push({
          type: 'Feature',
          properties: { code },
          geometry: { type: 'Polygon', coordinates: parts[index] },
        });
      }
    continue;
  }
  if (rules.excluded.includes(sourceId)) continue;
  const country = feature.properties.iso_a2;
  const rule = rules.countries[country];
  const value = feature.properties[rule?.field]?.trim();
  const code = rules.overrides[sourceId] || (rule?.codes ? rule.codes[value] : value);
  if (!names[code]) continue;
  if (!mappings.has(code)) mappings.set(code, []);
  mappings.get(code).push(sourceId);
  features.push({ type: 'Feature', properties: { code }, geometry: feature.geometry });
}

// Puerto Rico municipios come from the public-domain admin-2 layer, using explicit source IDs.
const countyUrl = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_10m_admin_2_counties.geojson`;
const countyCache = `output/review/regions/${revision}-admin2.geojson`;
if (!fs.existsSync(countyCache)) {
  const response = await fetch(countyUrl);
  if (!response.ok) throw new Error(`County boundary download failed: ${response.status}`);
  fs.writeFileSync(countyCache, await response.text());
}
const countySource = fs.readFileSync(countyCache);
sources.push({
  id: 'Natural Earth admin-2',
  url: countyUrl,
  revision,
  license: 'Public domain',
  sha256: createHash('sha256').update(countySource).digest('hex'),
});
for (const feature of JSON.parse(countySource).features) {
  const sourceId = `adm2:${feature.properties.ADM2_CODE}`;
  const code = rules.overrides[sourceId];
  if (!code) continue;
  mappings.set(code, [sourceId]);
  features.push({ type: 'Feature', properties: { code }, geometry: feature.geometry });
}

// These pinned, attributed sources replace incompatible administrative schemes as complete country layers.
for (const supplement of rules.supplements) {
  const path = supplement.snapshot || `output/review/regions/${supplement.id}-${supplement.sha256}.geojson`;
  if (!fs.existsSync(path)) {
    const response = await fetch(supplement.url);
    if (!response.ok) throw new Error(`Supplementary boundary download failed: ${response.status}`);
    fs.writeFileSync(path, await response.text());
  }
  const data = fs.readFileSync(path);
  assert.equal(
    createHash('sha256').update(data).digest('hex'),
    supplement.sha256,
    'Supplement checksum must match the reviewed version',
  );
  sources.push(supplement);
  for (const feature of JSON.parse(data).features) {
    const value = feature.properties[supplement.field];
    const code = supplement.codes?.[value] || value;
    assert.ok(names[code] && code.startsWith(`${supplement.country}-`), `Unmapped supplementary feature ${value}`);
    if (!mappings.has(code)) mappings.set(code, []);
    mappings.get(code).push(`${supplement.id}:${feature.properties.shapeID}`);
    features.push({ type: 'Feature', properties: { code }, geometry: feature.geometry });
  }
}

// Build shared topology before simplifying. Explode first so even small island parts survive.
const output = await mapshaper.applyCommands(
  '-i input.json -dissolve code -explode -simplify dp interval=1000 keep-shapes -dissolve code ' +
    '-o regions.json format=geojson precision=0.00001 -points inner -o labels.json format=geojson precision=0.00001',
  { 'input.json': JSON.stringify({ type: 'FeatureCollection', features }) },
);
const polygons = JSON.parse(output['regions.json']).features;
fs.writeFileSync('output/review/regions/prepared-regions.geojson', output['regions.json']);
fs.writeFileSync('output/review/regions/prepared-labels.geojson', output['labels.json']);
const labels = new Map(
  JSON.parse(output['labels.json']).features.map((f) => [f.properties.code, f.geometry.coordinates]),
);
const illustrations = {};
const boundsSnapshot = JSON.parse(fs.readFileSync('scripts/data/ebird-region-bounds-2026-10-28.json', 'utf8'));
const countryGeometry = JSON.parse(fs.readFileSync('src/assets/countries-v1.json', 'utf8'));
for (const country of rules.illustrations.partitionCountries) {
  const land = countryGeometry.features.find((f) => f.properties.code === country);
  const coordinates = land.geometry.coordinates.flat(Infinity);
  const xs = coordinates.filter((_, i) => i % 2 === 0),
    ys = coordinates.filter((_, i) => i % 2 === 1);
  const extent = [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1];
  const seeds = Object.keys(names)
    .filter((code) => code.startsWith(`${country}-`))
    .map((code) => {
      const b = boundsSnapshot.regions[code].bounds;
      const coordinates = rules.illustrations.seedOverrides[code]?.coordinates || [
        (b.minX + b.maxX) / 2,
        (b.minY + b.maxY) / 2,
      ];
      illustrations[code] = {
        method: 'nearest-centre land partition',
        seed: coordinates,
        source: rules.illustrations.seedOverrides[code]?.source || boundsSnapshot.source,
      };
      return { code, coordinates };
    });
  const cells = regionIllustrationCells(seeds, extent);
  const prepared = await mapshaper.applyCommands(
    '-i cells.json -clip land.json -o regions.json format=geojson precision=0.00001 -points inner -o labels.json format=geojson precision=0.00001',
    {
      'cells.json': JSON.stringify({ type: 'FeatureCollection', features: cells }),
      'land.json': JSON.stringify({ type: 'FeatureCollection', features: [land] }),
    },
  );
  const regions = JSON.parse(prepared['regions.json']).features;
  const points = JSON.parse(prepared['labels.json']).features;
  for (const feature of regions) {
    assert.ok(feature.geometry, `${feature.properties.code}: illustration must intersect land`);
    feature.properties.approximate = true;
    feature.properties.boundaryMethod = 'nearest-centre land partition';
    polygons.push(feature);
    mappings.set(feature.properties.code, [`illustration:${feature.properties.code}`]);
  }
  for (const point of points) labels.set(point.properties.code, point.geometry.coordinates);
}
for (const code of rules.illustrations.boundsRegions) {
  const b = boundsSnapshot.regions[code].bounds;
  const ring = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.maxX, b.maxY],
    [b.minX, b.maxY],
    [b.minX, b.minY],
  ];
  polygons.push({
    type: 'Feature',
    properties: { code, approximate: true, boundaryMethod: 'eBird bounding box' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  });
  labels.set(code, [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
  mappings.set(code, [`illustration:${code}`]);
  illustrations[code] = { method: 'eBird bounding box', source: boundsSnapshot.source, bounds: b };
}
const destination = 'src/assets/regions-v1';
fs.mkdirSync(destination, { recursive: true });
for (const file of fs.readdirSync(destination))
  if (/^[A-Z]{2}\.json$/.test(file) && !rules.countries[file.slice(0, 2)]) fs.unlinkSync(`${destination}/${file}`);
const countries = {};
for (const country of Object.keys(rules.countries).sort()) {
  const selected = polygons.filter((f) => f.properties.code.startsWith(`${country}-`));
  for (const feature of selected) feature.properties.label = labels.get(feature.properties.code);
  selected.sort((a, b) => a.properties.code.localeCompare(b.properties.code, 'en'));
  const text = JSON.stringify({ type: 'FeatureCollection', features: selected });
  if (selected.length) fs.writeFileSync(`${destination}/${country}.json`, text);
  else if (fs.existsSync(`${destination}/${country}.json`)) fs.unlinkSync(`${destination}/${country}.json`);
  countries[country] = {
    expected: Object.keys(names).filter((code) => code.startsWith(`${country}-`)).length,
    regions: selected.length,
    illustrations: selected.filter((f) => f.properties.approximate).length,
    bytes: selected.length ? Buffer.byteLength(text) : 0,
    gzipBytes: selected.length ? gzipSync(text).length : 0,
    missing: Object.keys(names).filter((code) => code.startsWith(`${country}-`) && !mappings.has(code)),
  };
  console.log(`${country}: ${selected.length} regions, ${Math.round(gzipSync(text).length / 1024)} KiB gzip`);
}
fs.writeFileSync(
  'src/assets/regions-source.json',
  JSON.stringify(
    {
      source: 'Natural Earth with reviewed supplementary boundaries',
      scale: '1:10m',
      revision,
      url,
      sha256: createHash('sha256').update(source).digest('hex'),
      license: 'Natural Earth is public domain; supplementary datasets retain their individual licences (see sources).',
      simplification: {
        method: 'Douglas-Peucker',
        intervalMeters: 1000,
        preserveIslandParts: true,
        precisionDegrees: 0.00001,
      },
      mapshaperVersion: JSON.parse(fs.readFileSync('node_modules/mapshaper/package.json', 'utf8')).version,
      sources,
      illustrations,
      illustrationSource: boundsSnapshot,
      summary: {
        expected: Object.keys(names).length,
        regions: polygons.length,
        boundaryPolygons: polygons.filter((f) => !f.properties.approximate).length,
        illustrations: Object.keys(illustrations).length,
        countries: Object.values(countries).filter((c) => c.regions > 0).length,
        completeCountries: Object.values(countries).filter((c) => c.missing.length === 0).length,
        bytes: Object.values(countries).reduce((total, c) => total + c.bytes, 0),
        gzipBytes: Object.values(countries).reduce((total, c) => total + c.gzipBytes, 0),
      },
      countries,
      mappings: Object.fromEntries([...mappings].sort(([a], [b]) => a.localeCompare(b, 'en'))),
      notes: rules.notes,
      deferred: rules.deferred,
    },
    null,
    2,
  ) + '\n',
);

// Keep the public gap list and source credits in sync with each reference-data release.
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const missing = Object.values(countries).flatMap((c) => c.missing);
fs.writeFileSync(
  'docs/region-boundary-coverage.md',
  [
    '# Global region boundary coverage',
    '',
    'Generated by `npm run prepare:regions`. Source boundaries and synthetic illustrations are distinguished below. They are not certified eBird boundary exports. Countries with no eBird subnational1 inventory are outside this table.',
    '',
    `${polygons.filter((f) => !f.properties.approximate).length} regions have source boundary polygons; ${Object.keys(illustrations).length} have explicitly marked synthetic illustrations. ${missing.length} remain circles. Every illustration is metadata-driven and does not assign observations.`,
    '',
    '| Country/territory | Code | Polygons | Synthetic illustrations | eBird regions | Remaining codes |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...Object.entries(countries).map(
      ([code, c]) =>
        `| ${countryNames.of(code)} | ${code} | ${c.regions} | ${c.illustrations} | ${c.expected} | ${c.missing.join(', ') || '—'} |`,
    ),
    '',
    '## Unresolved regions',
    '',
    '| Code | eBird name | Reason |',
    '| --- | --- | --- |',
    ...missing.map(
      (code) =>
        `| ${code} | ${names[code]} | ${rules.deferred[code.split('-')[0]] || 'A verified polygon is absent from the prepared sources.'} |`,
    ),
    '',
  ].join('\n'),
);

const html = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
fs.writeFileSync(
  'public/boundary-sources.html',
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Boundary sources — My eBird Map</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:55rem;margin:3rem auto;padding:0 1.5rem;color:#173e54}a{color:#0879b0}li{margin-bottom:1rem}</style></head><body>
<h1>Boundary sources</h1><p>These are approximate map illustrations, adapted by merging, rekeying and simplifying boundaries. Observation membership and counts follow the eBird export. All polygons are simplified at 1,000 m while preserving source island parts.</p>
<h2>Synthetic illustrations</h2><p>Denmark, Libya and Qatar use nearest-centre partitions clipped to country land, with centres derived from eBird region bounds. These are not administrative boundaries. Jaghbub and Al Qatrun seed coordinates credit <a href="https://www.geonames.org/">GeoNames</a> under CC BY 4.0. Perseverance and Kingman Reef show eBird bounding boxes, not land or reef outlines. The app marks synthetic areas with dashed borders and a popup explanation.</p>
<h2>Natural Earth</h2><p>Most boundaries use <a href="https://www.naturalearthdata.com/">Natural Earth</a> public-domain admin-1 and country data. Puerto Rico uses its admin-2 municipios.</p>
<h2>Supplementary sources</h2><p>geoBoundaries is credited under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Original source licences are retained as listed below, including <a href="https://creativecommons.org/licenses/by/3.0/igo/">CC BY 3.0 IGO</a>, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a> and public-domain data.</p>
<p>Country boundary files derived from <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> are provided under <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>. They remain separate country datasets. The preparation scripts and mapping rules linked below document the alterations.</p>
<ul>${rules.supplements.map((s) => `<li><strong>${html(countryNames.of(s.country))}</strong> (${html(s.year)}): ${html(s.source)}. Original licence: ${html(s.license)}. <a href="${html(s.url)}">Source</a>.</li>`).join('\n')}</ul>
<p>Runfola, D. et al. (2020). <a href="https://doi.org/10.1371/journal.pone.0231866">geoBoundaries: A global database of political administrative boundaries</a>. PLoS ONE 15(4): e0231866.</p>
<p><a href="https://github.com/Zoziologie/my-ebird-map/blob/main/scripts/prepare-regions.mjs">Preparation method</a> · <a href="https://github.com/Zoziologie/my-ebird-map/blob/main/scripts/region-boundary-rules.json">Mapping rules</a> · <a href="https://github.com/Zoziologie/my-ebird-map/blob/main/src/assets/regions-source.json">Revisions, checksums and provenance</a> · <a href="https://github.com/Zoziologie/my-ebird-map/blob/main/docs/region-boundary-coverage.md">Coverage and gaps</a></p><p><a href="./">Return to My eBird Map</a></p></body></html>\n`,
);
