import { groupMapRecords, indexMapLocations, clusteredMapFeatures } from './map-data.js';

const metrics = ['species', 'checklists', 'observations', 'individuals', 'locations'];

function niceNumber(value, roundUp = false) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 3, 5, 10];
  const scaled = value / magnitude;
  return (
    magnitude *
    (roundUp
      ? steps.find((step) => step >= scaled)
      : steps.reduce((best, step) => (Math.abs(step - scaled) < Math.abs(best - scaled) ? step : best)))
  );
}

export function mapColorBreaks(features) {
  return Object.fromEntries(
    metrics.map((metric) => {
      const maximum = features.reduce((max, feature) => Math.max(max, feature.properties[metric]), 0);
      if (maximum <= 6) return [metric, Array.from({ length: Math.max(0, maximum - 1) }, (_, i) => i + 2)];
      const top = niceNumber(Math.max(6, maximum), true);
      const breaks = [];
      for (const [index, fraction] of [0.05, 0.1, 0.2, 0.4, 1].entries()) {
        const value = Math.round(niceNumber(top * fraction));
        breaks.push(Math.max((breaks.at(-1) || 1) + 1, Math.min(top - (4 - index), value)));
      }
      return [metric, breaks];
    }),
  );
}

export function datasetMapColorBreaks(records, selectedCodes = new Set()) {
  if (selectedCodes.size)
    records = records.filter(
      (record) => record.count !== 0 && (selectedCodes.has(record.code) || selectedCodes.has(record.species)),
    );
  const locations = groupMapRecords(records, 'off');
  // A fixed reference zoom keeps nearby-cluster colors stable at every display zoom.
  const clusters = clusteredMapFeatures(indexMapLocations(locations), 7);
  return {
    off: mapColorBreaks(locations),
    auto: mapColorBreaks(clusters),
    region: mapColorBreaks(groupMapRecords(records, 'region')),
    country: mapColorBreaks(groupMapRecords(records, 'country')),
  };
}
