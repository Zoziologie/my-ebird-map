import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { csvFromExport } from '../src/archive.js';

async function archive(entries) {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
  for (const [name, content] of entries) await writer.add(name, new TextReader(content));
  return new File([await writer.close()], 'export.zip', { type: 'application/zip' });
}

const csv = 'Submission ID,Location ID,Scientific Name,Count\nS1,L1,Anas platyrhynchos,X';
test('CSV input is returned unchanged, including a missing final newline', async () => {
  const file = new File([csv], 'myebird.csv', { type: 'text/csv' });
  assert.equal(await csvFromExport(file), file);
});

test('eBird ZIP selects MyEBirdData.csv and ignores Mac metadata/other CSVs', async () => {
  const file = await archive([
    ['notes.csv', 'ignore'],
    ['__MACOSX/._MyEBirdData.csv', 'ignore'],
    ['folder/MyEBirdData.csv', csv],
  ]);
  const extracted = await csvFromExport(file);
  assert.equal(extracted.name, 'MyEBirdData.csv');
  assert.equal(await extracted.text(), csv);
});

test('a single differently named CSV can be imported', async () => {
  const file = await archive([['myebird.csv', csv]]);
  assert.equal(await (await csvFromExport(file)).text(), csv);
});

test('an ambiguous ZIP is rejected', async () => {
  const file = await archive([
    ['first.csv', csv],
    ['second.csv', csv],
  ]);
  await assert.rejects(csvFromExport(file), /Choose the ZIP from eBird/);
});

test('ZIP without a CSV is rejected', async () => {
  const file = await archive([['readme.txt', 'No observations here']]);
  await assert.rejects(csvFromExport(file), /Choose the ZIP from eBird/);
});

test('a damaged archive fails instead of importing incomplete data', async () => {
  const file = await archive([['MyEBirdData.csv', csv]]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await assert.rejects(csvFromExport(new File([bytes.slice(0, 16)], 'damaged.zip')));
});
