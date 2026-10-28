import assert from 'node:assert/strict';
import test from 'node:test';
import { clusteredMapFeatures, indexMapLocations, indexLocationHighlights } from '../src/map-data.js';

test('table locations resolve to their displayed cluster and to individual markers after zooming in', () => {
  const points = [
    [0, 0],
    [0.0001, 0],
    [100, 50],
  ].map((coordinates, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      id: `L${i}`,
      speciesIds: ['bird'],
      checklistIds: [`S${i}`],
      observations: 1,
      individuals: 1,
      locations: 1,
    },
  }));
  const index = indexMapLocations(points);
  const features = clusteredMapFeatures(index, 0);
  const highlights = indexLocationHighlights(features, index);
  assert.equal(highlights.get('L0'), highlights.get('L1'));
  assert.equal(highlights.get('L0').properties.point_count, 2);
  assert.equal(highlights.get('L2').properties.id, 'L2');
  const clusterId = highlights.get('L0').properties.cluster_id;
  assert.equal(highlights.get(`cluster:${clusterId}`), highlights.get('L0'));
  const zoomed = indexLocationHighlights(clusteredMapFeatures(index, 15), index);
  for (const point of points) assert.equal(zoomed.get(point.properties.id).properties.id, point.properties.id);
});

test('region markers and country polygons retain their exact geometry for highlighting', () => {
  const region = { geometry: { type: 'Point', coordinates: [6, 46] }, properties: { id: 'CH-VD' } };
  const country = { geometry: { type: 'MultiPolygon', coordinates: [] }, properties: { id: 'CH' } };
  const highlights = indexLocationHighlights([region, country]);
  assert.equal(highlights.get('CH-VD'), region);
  assert.equal(highlights.get('CH'), country);
  assert.equal(highlights.get('unknown'), undefined);
});
