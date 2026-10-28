import test from 'node:test';
import assert from 'node:assert/strict';
import { geometryBounds } from '../src/map-data.js';

test('polygon fitting covers complete boundaries, holes and every multipolygon part', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [1, 2],
        [8, 2],
        [8, 9],
        [1, 2],
      ],
      [
        [2, 3],
        [3, 4],
        [2, 3],
      ],
    ],
  };
  assert.deepEqual(geometryBounds(polygon), [
    [1, 2],
    [8, 9],
  ]);
  assert.equal(geometryBounds(polygon), geometryBounds(polygon), 'Immutable boundary bounds are cached');
  assert.deepEqual(
    geometryBounds({
      type: 'MultiPolygon',
      coordinates: [
        polygon.coordinates,
        [
          [
            [12, -5],
            [18, -5],
            [12, 2],
            [12, -5],
          ],
        ],
      ],
    }),
    [
      [1, -5],
      [18, 9],
    ],
  );
  assert.deepEqual(geometryBounds({ type: 'Point', coordinates: [6, 46] }), [
    [6, 46],
    [6, 46],
  ]);
});
