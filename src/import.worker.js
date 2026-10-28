import Papa from 'papaparse';
import { normalizeRecord, taxonomyIndex } from './model.js';
import { csvFromExport } from './archive.js';
import { saveSnapshot } from './storage.js';
import { exoticRulesIndex } from './exotic-rules.js';

self.onmessage = async ({ data: { file: input, origin = 'file', backupAt } }) => {
  try {
    const source =
      typeof input === 'string'
        ? new File([await (await fetch(input)).blob()], 'MyEBirdData.csv', { type: 'text/csv' })
        : input;
    self.postMessage({
      type: 'progress',
      message: source.name.toLowerCase().endsWith('.zip') ? 'Opening ZIP…' : 'Reading CSV…',
    });
    const file = await csvFromExport(source);
    self.postMessage({ type: 'progress', message: 'Loading eBird taxonomy…' });
    const index = taxonomyIndex(await (await fetch(new URL('./assets/eBird_taxonomy.json', import.meta.url))).json());
    const taxonomyMetadata = await (await fetch(new URL('./assets/taxonomy-source.json', import.meta.url))).json();
    const taxonomySource = taxonomyMetadata.source;
    self.postMessage({ type: 'progress', message: 'Loading regional exotic rules…' });
    const exoticData = await (await fetch(new URL('./assets/exotic-rules.json', import.meta.url))).json();
    const exoticIndex = exoticRulesIndex(exoticData.rules, exoticData.counties);
    const records = [],
      started = performance.now();
    let hasExoticStatus = false,
      failed = false;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      chunkSize: 1024 * 1024,
      chunk({ data, meta, errors }, parser) {
        const error = errors.find((error) => error.type !== 'FieldMismatch');
        const missing = [
          'Submission ID',
          'Location ID',
          'Location',
          'Scientific Name',
          'Common Name',
          'Count',
          'Date',
          'State/Province',
          'Latitude',
          'Longitude',
        ].filter((field) => !meta.fields.includes(field));
        if (error || missing.length) {
          failed = true;
          parser.abort();
          self.postMessage({
            type: 'error',
            message: missing.length ? 'Choose your full MyEBirdData.csv export from eBird.' : error.message,
          });
          return;
        }
        hasExoticStatus = meta.fields.includes('Exotic Code');
        for (const row of data) records.push(normalizeRecord(row, index, exoticIndex));
        self.postMessage({ type: 'progress', rows: records.length });
      },
      async complete() {
        if (failed) return;
        if (!records.length) {
          self.postMessage({ type: 'error', message: 'This export contains no observations.' });
          return;
        }
        const metadata = {
          kind: 'import',
          label: source.name,
          filename: source.name,
          importedAt: new Date().toISOString(),
          hasExoticStatus,
          taxonomySource,
          taxonomyVersion: taxonomyMetadata.version,
          taxonomySha256: taxonomyMetadata.sha256,
          exoticRulesSource: exoticData.source,
          exoticRulesSha256: exoticData.sha256,
          exoticNeedsCounty: records.filter((record) => record.exoticNeedsCounty).length,
          origin,
          driveSavedAt: backupAt || null,
        };
        self.postMessage({ type: 'progress', message: 'Saving your observations on this device…' });
        let saved = true;
        try {
          await saveSnapshot(records, source, metadata);
        } catch (error) {
          console.warn('Could not save the observation snapshot:', error);
          saved = false;
        }
        self.postMessage({
          type: 'complete',
          records,
          source,
          metadata,
          saved,
          seconds: (performance.now() - started) / 1000,
        });
      },
      error(error) {
        self.postMessage({ type: 'error', message: error.message });
      },
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
