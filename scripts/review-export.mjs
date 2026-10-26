import fs from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { normalizeRecord, taxonomyIndex, summarize } from '../src/model.js';

// Run from the project root: node scripts/review-export.mjs /path/to/MyEBirdData.csv
const source = process.argv[2];
const taxonomyPath = process.argv[3] || 'src/assets/eBird_taxonomy.json';
const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
const taxonomySource = process.argv[4] || 'Existing repository snapshot; release version unknown';
const index = taxonomyIndex(taxonomy);
const started = performance.now();
const categories = {},
  unknown = new Map(),
  exotic = {},
  years = new Set(),
  countries = new Set();
const species = new Set(),
  checklists = new Set(),
  locations = new Set(),
  rawTaxa = new Set();
const allChecklists = new Set(),
  allLocations = new Set();
const sampleChecklistIds = new Set(),
  strata = new Set();
let rows = 0,
  unknownCounts = 0,
  zeros = 0,
  firstDate = '9999',
  lastDate = '';
const fields = [];

// First pass: profile the complete export and select complete checklists by country/year and taxonomic edge cases.
const parser = fs.createReadStream(source).pipe(
  Papa.parse(Papa.NODE_STREAM_INPUT, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header, index) => {
      fields[index] = header;
      return header;
    },
  }),
);
parser.on('data', (row) => {
  const record = normalizeRecord(row, index);
  rows++;
  allChecklists.add(record.checklist);
  allLocations.add(record.locationId);
  categories[record.category] = (categories[record.category] || 0) + 1;
  exotic[record.exotic || '(not supplied)'] = (exotic[record.exotic || '(not supplied)'] || 0) + 1;
  if (record.category === 'unmatched') unknown.set(record.scientific, (unknown.get(record.scientific) || 0) + 1);
  if (record.count === null) unknownCounts++;
  if (record.count === 0) zeros++;
  years.add(record.date.slice(0, 4));
  if (record.date < firstDate) firstDate = record.date;
  if (record.date > lastDate) lastDate = record.date;
  if (record.count !== 0) {
    if (record.species && record.exotic !== 'X') species.add(record.species);
    checklists.add(record.checklist);
    locations.add(record.locationId);
    if (record.country !== 'XX') countries.add(record.country);
    rawTaxa.add(record.code);
  }
  const stratum = `${record.country}-${record.date.slice(0, 4)}`;
  const edge = `${record.category}-${record.exotic}-${record.count === null ? 'X' : 'numeric'}`;
  if (!strata.has(stratum) || !strata.has(edge)) sampleChecklistIds.add(record.checklist);
  strata.add(stratum);
  strata.add(edge);
});
await once(parser, 'end');
const profileSeconds = (performance.now() - started) / 1000;

const sampleRows = [],
  records = [];
const sampleParser = fs
  .createReadStream(source)
  .pipe(Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true }));
sampleParser.on('data', (row) => {
  if (sampleChecklistIds.has(row['Submission ID'])) {
    sampleRows.push(row);
    records.push(normalizeRecord(row, index));
  }
});
await once(sampleParser, 'end');
const hash = createHash('sha256');
const input = fs.createReadStream(source);
input.on('data', (chunk) => hash.update(chunk));
await once(input, 'end');
const profile = {
  source: 'MyEBirdData.csv',
  bytes: fs.statSync(source).size,
  sha256: hash.digest('hex'),
  rows,
  firstDate,
  lastDate,
  years: [...years].sort(),
  countries: [...countries].sort(),
  species: species.size,
  checklists: allChecklists.size,
  locations: allLocations.size,
  presenceChecklists: checklists.size,
  presenceLocations: locations.size,
  rawTaxa: rawTaxa.size,
  categories,
  exotic,
  unknownCounts,
  zeros,
  fields,
  unmatchedTaxa: [...unknown].map(([name, count]) => ({ name, count })),
  taxonomy: {
    source: taxonomySource,
    sha256: createHash('sha256').update(JSON.stringify(taxonomy)).digest('hex'),
    taxa: taxonomy.length,
  },
  benchmark: {
    node: process.version,
    profileSeconds,
    peakRssMB: process.resourceUsage().maxRSS / 1024,
    note: 'Local Node streaming profile, not browser/mobile import time; excludes sample extraction and SHA-256.',
  },
  sample: {
    method:
      'First complete checklist per country/year, plus first complete checklist per category/exotic/count-type combination',
    ...summarize(records),
  },
  caveat:
    'Not an independently verified eBird life-list count; missing exotic status and any unmatched taxa may change the total.',
};
fs.mkdirSync('output/review', { recursive: true });
fs.mkdirSync('local', { recursive: true });
fs.writeFileSync('output/review/profile.json', JSON.stringify(profile, null, 2));
fs.writeFileSync('output/review/MyEBirdData-small.csv', Papa.unparse({ fields, data: sampleRows }));
fs.writeFileSync(
  'local/data.local.json',
  JSON.stringify({
    kind: 'personal-sample',
    label: 'Your export · representative sample',
    records,
    profile,
    hasExoticStatus: fields.includes('Exotic Code'),
  }),
);
console.log(JSON.stringify(profile, null, 2));
