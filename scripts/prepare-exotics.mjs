import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import Papa from 'papaparse';

// node scripts/prepare-exotics.mjs source.csv [output.json]
const input = fs.readFileSync(process.argv[2]);
const output = process.argv[3] || 'local/exotic-rules.json';
const { data } = Papa.parse(input.toString('utf8'), { header: true, skipEmptyLines: 'greedy' });
const rules = {},
  counties = {};
for (const row of data) {
  // Empty status is an explicit exception; WORLD and world describe the same scope.
  (rules[row.species_code] ||= {})[row.region_code.toLowerCase() === 'world' ? 'world' : row.region_code] =
    row.exotic_category;
  if (row.region_type === 'SUBNATIONAL2' && row.region_name !== '#N/A') {
    const state = row.region_code.slice(0, row.region_code.lastIndexOf('-'));
    (counties[state] ||= {})[row.region_name] = row.region_code;
  }
}
const result = JSON.stringify({
  source: path.basename(process.argv[2]),
  sha256: createHash('sha256').update(input).digest('hex'),
  rules,
  counties,
});
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, result + '\n');

// Report taxonomy drift without discarding rules for newer taxa.
const taxonomy = JSON.parse(fs.readFileSync('src/assets/eBird_taxonomy.json', 'utf8'));
const known = new Set(taxonomy.map((taxon) => taxon.speciesCode));
console.log(
  JSON.stringify(
    {
      output,
      rows: data.length,
      taxa: Object.keys(rules).length,
      countyRules: data.filter((row) => row.region_type === 'SUBNATIONAL2').length,
      unmatchedTaxa: Object.keys(rules).filter((code) => !known.has(code)),
      inputBytes: input.length,
      jsonBytes: Buffer.byteLength(result + '\n'),
      gzipBytes: gzipSync(result + '\n').length,
    },
    null,
    2,
  ),
);
