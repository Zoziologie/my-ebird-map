import assert from 'node:assert/strict';
import test from 'node:test';
import { readUrlSettings, writeUrlSettings } from '../src/url-state.js';

test('URL settings override saved preferences while preserving unspecified settings', () => {
  const state = readUrlSettings(
    'https://example.com/?lat=46&lon=6&zoom=8&mapview=region&species=mallar3,brant&additional=0&yearFrom=2024',
    { mapStyle: 'satellite', grouping: 'country', clustering: 'country', camera: { pitch: 30 }, additional: true },
  );
  assert.deepEqual(state.camera, { center: [6, 46], zoom: 8, pitch: 30 });
  assert.equal(state.mapStyle, 'satellite');
  assert.equal(state.grouping, 'region');
  assert.equal(state.clustering, 'region');
  assert.equal(state.additional, false);
  assert.equal(state.yearFrom, '2024');
  assert.deepEqual(state.species, ['mallar3', 'brant']);
});

test('view settings round-trip and preserve unrelated query parameters and hash', () => {
  const state = {
    camera: { center: [-179.123456, 46.543219], zoom: 7.123, bearing: 12.345, pitch: 30 },
    grouping: 'polygon',
    mapStyle: 'outdoors',
    projection: 'globe',
    metric: 'checklists',
    theme: 'night',
    yearFrom: '2024',
    yearTo: '2025',
    monthFrom: '12',
    monthTo: '02',
    followMap: false,
    additional: true,
    species: ['mallar3', 'brant'],
    polygon: [
      [6, 46],
      [7, 46],
      [6, 47],
    ],
  };
  const url = writeUrlSettings('https://example.com/map/?source=test#map', state);
  const restored = readUrlSettings(url);
  assert.equal(new URL(url).searchParams.get('source'), 'test');
  assert.equal(new URL(url).hash, '#map');
  assert.deepEqual(restored, {
    ...state,
    clustering: 'off',
    camera: { center: [-179.12346, 46.54322], zoom: 7.12, bearing: 12.35, pitch: 30 },
  });
  assert.equal(writeUrlSettings(url, restored), url);
});

test('empty filters in shared links clear saved filters', () => {
  const url = writeUrlSettings('https://example.com/', {
    species: [],
    polygon: null,
    followMap: true,
    additional: true,
  });
  const state = readUrlSettings(url, {
    yearFrom: '2024',
    yearTo: '2025',
    monthFrom: '01',
    monthTo: '06',
    species: ['brant'],
    polygon: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  });
  for (const key of ['yearFrom', 'yearTo', 'monthFrom', 'monthTo']) assert.equal(state[key], '');
  assert.deepEqual(state.species, []);
  assert.equal(state.polygon, null);
});

test('partial camera settings keep the saved camera', () => {
  assert.deepEqual(
    readUrlSettings('https://example.com/?lat=0&zoom=0', {
      camera: { center: [6, 46], zoom: 8, bearing: 20 },
    }).camera,
    { center: [6, 0], zoom: 0, bearing: 20 },
  );
});
