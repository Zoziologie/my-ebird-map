import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { normalizeRecord, taxonomyIndex, filterRecords, pointInPolygon } from '../src/model.js';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function loadExportManifest() {
  const manifest = JSON.parse(fs.readFileSync('local/export-cases/manifest.json', 'utf8'));
  assert.equal(
    sha256(fs.readFileSync('src/assets/eBird_taxonomy.json')),
    manifest.taxonomySha256,
    'Taxonomy changed; regenerate export cases',
  );
  return manifest;
}

export function readExport(path) {
  const index = taxonomyIndex(JSON.parse(fs.readFileSync('src/assets/eBird_taxonomy.json', 'utf8')));
  const csv = fs.readFileSync(path, 'utf8');
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: 'greedy' });
  // eBird rows can omit trailing optional fields; match the import worker’s policy.
  assert.deepEqual(
    parsed.errors.filter((error) => error.type !== 'FieldMismatch'),
    [],
    'CSV syntax must parse without errors',
  );
  return parsed.data.map((row) => normalizeRecord(row, index));
}

export function scenarioRecords(records, scenario) {
  const filtered = filterRecords(records, scenario.filters);
  return scenario.polygon
    ? filtered.filter((record) => pointInPolygon([record.longitude, record.latitude], scenario.polygon))
    : filtered;
}
