import assert from 'node:assert/strict';
import fs from 'node:fs';

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
assert(
  !/\.local\.(json|csv)|window\.designMap|src\/App\.vue/.test(code),
  'Development data paths and globals must not ship',
);
assert(code.includes('/myebirdmap/assets/'), 'Assets must use the production base path');
console.log('Passed: production entry, worker, demo, taxonomy, boundaries, base path, and private-file exclusion.');
