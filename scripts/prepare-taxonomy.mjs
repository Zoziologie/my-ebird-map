import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { format } from 'prettier';

// node --env-file=.env scripts/prepare-taxonomy.mjs 2026
// Preserve the complete official response; do not add aliases or edit taxon identities.
const version = Number(process.argv[2] || 2026);
const url = `https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&version=${version}`;
const response = await fetch(url, { headers: { 'X-eBirdApiToken': process.env.EBIRD_API_TOKEN } });
if (!response.ok) throw new Error(`Taxonomy request failed: ${response.status}`);
const taxonomy = await response.json();
const content = await format(JSON.stringify(taxonomy), { parser: 'json' });
const metadata = {
  version,
  source: `eBird API v${version}`,
  url,
  fetchedAt: new Date().toISOString(),
  taxa: taxonomy.length,
  sha256: createHash('sha256').update(content).digest('hex'),
};
fs.writeFileSync('src/assets/eBird_taxonomy.json', content);
fs.writeFileSync('src/assets/taxonomy-source.json', await format(JSON.stringify(metadata), { parser: 'json' }));
console.log(`Prepared ${metadata.source}: ${metadata.taxa} taxa; SHA-256 ${metadata.sha256}.`);
