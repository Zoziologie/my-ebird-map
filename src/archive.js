import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';

export async function csvFromExport(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) return file;
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false, checkSignature: true });
  try {
    const entries = (await reader.getEntries()).filter(
      (entry) => !entry.directory && !entry.filename.startsWith('__MACOSX/') && /\.csv$/i.test(entry.filename),
    );
    const csv =
      entries.find((entry) => /(^|\/)MyEBirdData\.csv$/i.test(entry.filename)) ||
      (entries.length === 1 ? entries[0] : null);
    if (!csv) throw new Error('Choose the ZIP from eBird containing MyEBirdData.csv, or load the CSV directly.');
    return new File([await csv.getData(new BlobWriter('text/csv'))], csv.filename.split('/').at(-1), {
      type: 'text/csv',
    });
  } finally {
    await reader.close();
  }
}
