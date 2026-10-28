import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import mapshaper from 'mapshaper';

// Natural Earth's 1:50m cartographic boundaries are already generalized for overview maps.
const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_50m_admin_0_countries.geojson`;
const source = await (await fetch(url)).json();
const countries = new Map();
for (const feature of source.features) {
  let code = feature.properties.ISO_A2_EH;
  // eBird treats Aland as part of Finland and French overseas territories/Svalbard separately.
  if (code === 'AX') code = 'FI';
  if (code === 'FR' || code === 'NO') continue;
  if (!/^[A-Z]{2}$/.test(code)) continue;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  if (!countries.has(code)) countries.set(code, { polygons: [], label: feature.properties });
  const country = countries.get(code);
  country.polygons.push(...polygons);
  if (feature.properties.LABELRANK < country.label.LABELRANK) country.label = feature.properties;
}
const features = JSON.parse(
  JSON.stringify(
    [...countries].map(([code, country]) => ({
      type: 'Feature',
      properties: { code, label: [country.label.LABEL_X, country.label.LABEL_Y] },
      geometry: { type: 'MultiPolygon', coordinates: country.polygons },
    })),
    (key, value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value),
  ),
);
const detailUrl = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_10m_admin_1_states_provinces.geojson`;
const detail = await (await fetch(detailUrl)).json();
const rules = JSON.parse(fs.readFileSync('scripts/country-boundary-rules.json', 'utf8'));
const assignments = new Map(Object.entries(rules).flatMap(([code, ids]) => ids.map((id) => [id, code])));
const additions = [];
for (const feature of detail.features) {
  const p = feature.properties;
  const code =
    assignments.get(p.adm1_code) ||
    (p.geonunit === 'France'
      ? 'FR'
      : p.iso_a2 === 'NO' && p.iso_3166_2 !== 'NO-21' && p.adm1_code !== 'BVT+00?'
        ? 'NO'
        : null);
  if (code) additions.push({ type: 'Feature', properties: { code }, geometry: feature.geometry });
}
const prepared = await mapshaper.applyCommands(
  '-i input.json -dissolve code -explode -simplify dp interval=1000 keep-shapes -dissolve code -o countries.json format=geojson precision=0.00001 -points inner -o labels.json format=geojson precision=0.00001',
  { 'input.json': JSON.stringify({ type: 'FeatureCollection', features: additions }) },
);
const labels = new Map(
  JSON.parse(prepared['labels.json']).features.map((f) => [f.properties.code, f.geometry.coordinates]),
);
for (const feature of JSON.parse(prepared['countries.json']).features) {
  feature.properties.label = labels.get(feature.properties.code);
  features.push(feature);
}
// Retain coarse overview coordinates in the base layer and finer precision for small territories.
const text = JSON.stringify({ type: 'FeatureCollection', features });
fs.mkdirSync('src/assets', { recursive: true });
fs.writeFileSync('src/assets/countries-v1.json', text);
fs.writeFileSync(
  'src/assets/countries-source.json',
  JSON.stringify(
    {
      source: 'Natural Earth',
      scale: '1:50m with 1:10m territory supplements',
      revision,
      url,
      license: 'Public domain',
      features: features.length,
      additionalSource: detailUrl,
      additionalMappings: rules,
      precisionDegrees: { base: 0.01, supplements: 0.00001 },
      simplificationMeters: 1000,
      bytes: Buffer.byteLength(text),
      gzipBytes: gzipSync(text).length,
      missing: Object.keys(JSON.parse(fs.readFileSync('src/assets/country-names.json', 'utf8'))).filter(
        (code) => !features.some((f) => f.properties.code === code),
      ),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ countries: features.length, bytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length }),
);
