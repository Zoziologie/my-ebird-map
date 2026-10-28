import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';

const files = fs.readdirSync('dist', { recursive: true }).filter((file) => fs.statSync(`dist/${file}`).isFile());
assert(files.includes('index.html') && files.includes('favicon.ico'), 'App entry and favicon must be packaged');
for (const name of ['import.worker-', 'countries-v1-', 'eBird_taxonomy-', 'exotic-rules-', 'demo-']) {
  assert(
    files.some((file) => file.startsWith(`assets/${name}`)),
    `${name} must be packaged`,
  );
}
assert(
  !files.some((file) => /local|\.csv$|\.env|profile|design\//i.test(file)),
  'Private development files must not be packaged',
);
const code = files
  .filter((file) => /\.(html|js|css)$/.test(file))
  .map((file) => fs.readFileSync(`dist/${file}`, 'utf8'))
  .join('\n');
const regions = JSON.parse(fs.readFileSync('src/assets/regions-source.json', 'utf8'));
for (const [country, coverage] of Object.entries(regions.countries).filter(([, coverage]) => coverage.regions))
  assert(
    files.some((file) => file.startsWith(`assets/${country}-`) && file.endsWith('.json')),
    `${country}'s ${coverage.regions} region boundaries must be packaged as a separate asset`,
  );
assert(files.includes('boundary-sources.html'), 'Boundary source attribution must be packaged');
assert(!code.includes('mapshaper'), 'Boundary preparation dependencies must not ship in the app');
assert(
  !/\.local\.(json|csv)|window\.designMap|src\/App\.vue/.test(code),
  'Development data paths and globals must not ship',
);
assert(code.includes('/my-ebird-map/assets/'), 'Assets must use the production base path');
console.log('Passed: production entry, worker, demo, taxonomy, boundaries, base path, and private-file exclusion.');

// Compressed local assets; external Mapbox code/tiles are measured separately in browser runs.
for (const [pattern, limitKiB] of [
  [/^assets\/index-.*\.js$/, 80],
  [/^assets\/index-.*\.css$/, 35],
  [/^assets\/import\.worker-.*\.js$/, 100],
]) {
  const asset = files.find((file) => pattern.test(file));
  assert(asset, `Missing budgeted asset: ${pattern}`);
  const sizeKiB = gzipSync(fs.readFileSync(`dist/${asset}`)).length / 1024;
  assert(sizeKiB <= limitKiB, `${asset}: ${sizeKiB.toFixed(1)} KiB gzip exceeds the ${limitKiB} KiB budget`);
  console.log(`Bundle budget: ${asset}: ${sizeKiB.toFixed(1)} / ${limitKiB} KiB gzip`);
}
