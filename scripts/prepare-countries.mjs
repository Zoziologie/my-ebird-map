import fs from 'node:fs';
import { gzipSync } from 'node:zlib';

// Natural Earth's 1:50m cartographic boundaries are already generalized for overview maps.
const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_50m_admin_0_countries.geojson`;
const source = await (await fetch(url)).json();
const countries = new Map();
for (const feature of source.features) {
  const code = feature.properties.ISO_A2_EH;
  if (!/^[A-Z]{2}$/.test(code)) continue;
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  if (!countries.has(code)) countries.set(code, { polygons: [], label: feature.properties });
  const country = countries.get(code);
  country.polygons.push(...polygons);
  if (feature.properties.LABELRANK < country.label.LABELRANK) country.label = feature.properties;
}
const features = [...countries].map(([code, country]) => ({
  type: 'Feature',
  properties: { code, label: [country.label.LABEL_X, country.label.LABEL_Y] },
  geometry: { type: 'MultiPolygon', coordinates: country.polygons },
}));
// Round coordinates to ~1 km and remove properties unrelated to map display.
const text = JSON.stringify({ type: 'FeatureCollection', features }, (key, value) =>
  typeof value === 'number' ? Math.round(value * 100) / 100 : value,
);
fs.mkdirSync('src/assets', { recursive: true });
fs.writeFileSync('src/assets/countries-v1.json', text);
fs.writeFileSync(
  'src/assets/countries-source.json',
  JSON.stringify(
    {
      source: 'Natural Earth',
      scale: '1:50m',
      revision,
      url,
      license: 'Public domain',
      precisionDegrees: 0.01,
      features: features.length,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ countries: features.length, bytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length }),
);
