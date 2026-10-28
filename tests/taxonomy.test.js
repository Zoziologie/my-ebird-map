import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { normalizeRecord, taxonomyIndex } from '../src/model.js';

const content = fs.readFileSync(new URL('../src/assets/eBird_taxonomy.json', import.meta.url));
const taxonomy = JSON.parse(content);
const metadata = JSON.parse(fs.readFileSync(new URL('../src/assets/taxonomy-source.json', import.meta.url)));

test('bundled taxonomy matches its pinned official release metadata', () => {
  assert.equal(metadata.version, 2026);
  assert.equal(metadata.url, 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&version=2026');
  assert.equal(taxonomy.length, metadata.taxa);
  assert.equal(createHash('sha256').update(content).digest('hex'), metadata.sha256);
});

test('v2026 resolves new species and retains unresolved split identifications as additional taxa', () => {
  const index = taxonomyIndex(taxonomy);
  const base = { 'State/Province': 'US-TX', Count: '1' };
  for (const scientific of ['Eudyptes filholi', 'Vireo swainsoni', 'Cistothorus paludicola', 'Tringa inornata']) {
    assert.equal(normalizeRecord({ ...base, 'Scientific Name': scientific }, index).category, 'species');
  }
  const unresolved = normalizeRecord({ ...base, 'Scientific Name': 'Cistothorus paludicola/palustris' }, index);
  assert.equal(unresolved.category, 'slash');
  assert.equal(unresolved.species, null);
});
