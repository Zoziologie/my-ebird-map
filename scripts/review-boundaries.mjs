import fs from 'node:fs';
import Papa from 'papaparse';
import { once } from 'node:events';

// Audit exact administrative-code joins; no guesses from names or bird coordinates.
const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const sources = ['ne_50m_admin_0_countries', 'ne_10m_admin_1_states_provinces'];
fs.mkdirSync('output/review', { recursive: true });
const boundaries = await Promise.all(
  sources.map(async (name) => {
    const path = `output/review/${name}.geojson`;
    if (!fs.existsSync(path)) {
      const response = await fetch(
        `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/${name}.geojson`,
      );
      if (!response.ok) throw new Error(`Boundary download failed: ${response.status}`);
      fs.writeFileSync(path, await response.text());
    }
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  }),
);
const countries = new Set(),
  regions = new Set();
const parser = fs
  .createReadStream(process.argv[2] || 'local/MyEBirdData.local.csv')
  .pipe(Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true }));
parser.on('data', (row) => {
  regions.add(row['State/Province']);
  countries.add(row['State/Province'].split('-')[0]);
});
await once(parser, 'end');
const countryCodes = new Set(
  boundaries[0].features
    .flatMap((feature) => [feature.properties.ISO_A2_EH, feature.properties.ISO_A2])
    .filter((code) => code && code !== '-99'),
);
const regionCodes = new Set(boundaries[1].features.map((feature) => feature.properties.iso_3166_2));
const result = {
  source: 'Natural Earth',
  revision,
  countries: {
    total: countries.size,
    matched: [...countries].filter((code) => countryCodes.has(code)).length,
    unmatched: [...countries].filter((code) => !countryCodes.has(code)).sort(),
  },
  regions: {
    total: regions.size,
    matched: [...regions].filter((code) => regionCodes.has(code)).length,
    unmatched: [...regions].filter((code) => !regionCodes.has(code)).sort(),
  },
  files: sources.map((name, i) => ({
    name,
    features: boundaries[i].features.length,
    bytes: fs.statSync(`output/review/${name}.geojson`).size,
  })),
};
fs.writeFileSync('output/review/boundary-code-review.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
