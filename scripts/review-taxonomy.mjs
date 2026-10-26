import fs from 'node:fs';

// node --env-file=.env scripts/review-taxonomy.mjs
// Taxonomy is public reference data. The eBird API token stays in the Node process.
const headers = { 'X-eBirdApiToken': process.env.EBIRD_API_TOKEN };
const versionsResponse = await fetch('https://api.ebird.org/v2/ref/taxonomy/versions', { headers });
if (!versionsResponse.ok) throw new Error(`Taxonomy versions request failed: ${versionsResponse.status}`);
const versions = await versionsResponse.json();
const version = versions.find((item) => item.latest).authorityVer;
const response = await fetch(`https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&version=${version}`, { headers });
if (!response.ok) throw new Error(`Taxonomy request failed: ${response.status}`);
const taxonomy = await response.json();
fs.mkdirSync('output/review', { recursive: true });
fs.mkdirSync('local', { recursive: true });
fs.writeFileSync(`output/review/taxonomy-${version}-api.json`, JSON.stringify(taxonomy));
fs.writeFileSync('output/review/taxonomy-versions.json', JSON.stringify(versions));
fs.writeFileSync('local/taxonomy.local.json', JSON.stringify(taxonomy));
fs.writeFileSync(
  'local/taxonomy-meta.local.json',
  JSON.stringify({ version, source: `eBird API v${version}`, taxa: taxonomy.length }),
);
console.log(`Downloaded eBird taxonomy v${version}: ${taxonomy.length} taxa. The production snapshot is unchanged.`);
