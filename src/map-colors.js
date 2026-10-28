import { groupMapRecords, groupMapDisplayRecords, indexMapLocations, clusteredMapFeatures } from './map-data.js';

const metrics = ['species', 'checklists', 'observations', 'individuals', 'locations'];

export function datasetMapScales(records, selectedCodes = new Set()) {
  if (selectedCodes.size)
    records = records.filter(
      (record) => record.count !== 0 && (selectedCodes.has(record.code) || selectedCodes.has(record.species)),
    );
  const locations = groupMapRecords(records, 'off');
  // A fixed reference zoom keeps nearby-cluster colors stable at every display zoom.
  const clusters = clusteredMapFeatures(indexMapLocations(locations), 7);
  const features = {
    off: locations,
    auto: clusters,
    region: groupMapDisplayRecords(records, 'region'),
    country: groupMapDisplayRecords(records, 'country'),
  };
  return {
    maxima: Object.fromEntries(
      Object.entries(features).map(([key, points]) => [
        key,
        Object.fromEntries(
          metrics.map((metric) => [
            metric,
            points.reduce((maximum, point) => Math.max(maximum, point.properties[metric]), 0),
          ]),
        ),
      ]),
    ),
  };
}

export const mapPalette = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];

export function continuousMapColor(count, maximum) {
  if (maximum <= 1) return ['case', ['>', count, 0], mapPalette.at(-1), '#87939b'];
  return [
    'case',
    ['<=', count, 0],
    '#87939b',
    [
      'interpolate',
      ['linear'],
      ['ln', ['+', count, 1]],
      ...mapPalette.flatMap((color, i) => [
        i === 5 ? Math.log(maximum + 1) : Math.log(2) + ((Math.log(maximum + 1) - Math.log(2)) * i) / 5,
        color,
      ]),
    ],
  ];
}

// The canvas fallback uses the same RGB interpolation as the polygon paint expression.
export function continuousMapColorValue(value, maximum) {
  if (value <= 0) return '#87939b';
  const position =
    maximum <= 1
      ? 5
      : Math.min(5, Math.max(0, ((Math.log(value + 1) - Math.log(2)) / (Math.log(maximum + 1) - Math.log(2))) * 5));
  const index = Math.min(4, Math.floor(position));
  const start = mapPalette[index].match(/\w\w/g).map((part) => parseInt(part, 16));
  const end = mapPalette[index + 1].match(/\w\w/g).map((part) => parseInt(part, 16));
  return `rgb(${start.map((channel, i) => Math.round(channel + (end[i] - channel) * (position - index))).join(', ')})`;
}

export function mapMetricColor(count, grouping, scales, metric) {
  return continuousMapColor(count, scales.maxima[grouping][metric]);
}
