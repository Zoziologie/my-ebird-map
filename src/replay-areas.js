import { mapMetricColor } from './map-colors.js';
import { formatMapCount } from './map-data.js';

// Ease display-only values toward the exact cumulative total over 400 ms.
export function replayCounterValue(from, to, elapsed) {
  const fraction = Math.min(1, Math.max(0, elapsed / 400));
  return from + (to - from) * (1 - (1 - fraction) ** 2);
}

// Boundaries remain static; feature state and visible counters advance independently.
export function createAreaReplay(map, data, reducedMotion) {
  const palette = getComputedStyle(document.body);
  const green = palette.getPropertyValue('--green').trim(),
    gray = palette.getPropertyValue('--replay-history').trim();
  let metric = 'checklists',
    dirty = true;
  const values = new Map(),
    counters = new Map(),
    markers = new Map();
  let layoutDirty = true;
  map.addSource('replay-areas', {
    type: 'geojson',
    promoteId: 'id',
    data: { type: 'FeatureCollection', features: [...data.geometry.polygons, ...data.geometry.circles] },
  });
  map.addLayer({
    id: 'replay-area-fill',
    type: 'fill',
    source: 'replay-areas',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': gray,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'seen'], false], 0.72, 0],
      'fill-color-transition': { duration: reducedMotion ? 0 : 180 },
    },
  });
  map.addLayer({
    id: 'replay-area-borders',
    type: 'line',
    source: 'replay-areas',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': palette.getPropertyValue('--muted').trim(),
      'line-width': 1,
      'line-opacity': ['case', ['boolean', ['feature-state', 'seen'], false], 0.7, 0],
    },
  });
  map.addLayer({
    id: 'replay-area-pulse',
    type: 'line',
    source: 'replay-areas',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'line-color': green, 'line-width': 2.5, 'line-opacity': 0, 'line-opacity-transition': { duration: 0 } },
  });
  map.addLayer({
    id: 'replay-area-points',
    type: 'circle',
    source: 'replay-areas',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 15,
      'circle-color': gray,
      'circle-opacity': ['case', ['boolean', ['feature-state', 'seen'], false], 0.9, 0],
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'seen'], false], 1, 0],
      'circle-stroke-color': ['case', ['==', ['get', 'highSeas'], true], '#087db5', green],
      'circle-color-transition': { duration: reducedMotion ? 0 : 180 },
    },
  });
  // Visible HTML labels bypass asynchronous symbol placement; keep their number bounded in region view.
  function labelValue(id, now) {
    const counter = counters.get(id);
    if (!counter) return values.get(id)[metric];
    return replayCounterValue(counter.from, counter.to, now - counter.start);
  }

  function layoutLabels() {
    const occupied = [];
    const visible = new Set();
    const { width, height } = map.getContainer().getBoundingClientRect();
    for (const point of data.geometry.labels) {
      if (!values.has(point.id)) continue;
      const projected = map.project(point.geometry.coordinates);
      if (projected.x < 12 || projected.x > width - 12 || projected.y < 12 || projected.y > height - 12) continue;
      const text = formatMapCount(
        values.get(point.id)[metric],
        metric === 'individuals' ? values.get(point.id).observations : 0,
      );
      const halfWidth = Math.max(14, text.length * 4.5 + 4);
      if (occupied.some(([x, y, w]) => Math.abs(x - projected.x) < w + halfWidth && Math.abs(y - projected.y) < 24))
        continue;
      occupied.push([projected.x, projected.y, halfWidth]);
      visible.add(point.id);
      if (!markers.has(point.id)) {
        const element = document.createElement('span');
        element.className = 'replay-area-counter';
        element.dataset.area = point.id;
        element.setAttribute('aria-hidden', 'true');
        const marker = new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat(point.geometry.coordinates)
          .addTo(map);
        markers.set(point.id, marker);
      }
      if (visible.size >= 150) break;
    }
    for (const [id, marker] of markers)
      if (!visible.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    layoutDirty = false;
  }
  function moved() {
    layoutDirty = true;
    paint(performance.now());
  }
  map.on('move', moved);

  function paint(now) {
    if (layoutDirty) layoutLabels();
    for (const [id, marker] of markers) {
      const state = values.get(id);
      const element = marker.getElement();
      const label = formatMapCount(Math.round(labelValue(id, now)), metric === 'individuals' ? state.observations : 0);
      if (element.textContent !== label) element.textContent = label;
    }
    for (const [id, counter] of counters) if (now - counter.start >= 400) counters.delete(id);
  }

  function update(day) {
    for (const area of day.areas) {
      const now = performance.now();
      const previous = values.get(area.id);
      const from = previous ? labelValue(area.id, now) : 0;
      if (!previous || formatMapCount(previous[metric]).length !== formatMapCount(area.totals[metric]).length)
        layoutDirty = true;
      if (!reducedMotion) counters.set(area.id, { from, to: area.totals[metric], start: now });
      const state = { ...area.totals, seen: true, at: day.at, date: day.date };
      values.set(area.id, state);
      map.setFeatureState({ source: 'replay-areas', id: area.id }, state);
      dirty = true;
    }
  }

  return {
    update,
    seek(index) {
      values.clear();
      map.removeFeatureState({ source: 'replay-areas' });
      for (const day of data.days.slice(0, index)) update(day);
      counters.clear();
      layoutDirty = true;
      dirty = true;
    },
    settle(position) {
      counters.clear();
      dirty = true;
      this.paint(position);
    },
    setMetric(value) {
      metric = value;
      counters.clear();
      layoutDirty = true;
      const color = mapMetricColor(['coalesce', ['feature-state', metric], 0], data.grouping, data.scales, metric);
      map.setPaintProperty('replay-area-fill', 'fill-color', color);
      map.setPaintProperty('replay-area-points', 'circle-color', color);
      dirty = true;
    },
    paint(position) {
      if (!reducedMotion) {
        const age = ['-', position, ['coalesce', ['feature-state', 'at'], -100000]];
        map.setPaintProperty('replay-area-pulse', 'line-opacity', [
          'case',
          ['boolean', ['feature-state', 'seen'], false],
          ['interpolate', ['linear'], age, 0, 0.9, 1200, 0],
          0,
        ]);
      }
      if (dirty || counters.size || layoutDirty) paint(performance.now());
      dirty = false;
    },
    featureAt(point) {
      return map
        .queryRenderedFeatures(point, { layers: ['replay-area-points', 'replay-area-fill'] })
        .find((feature) => values.has(feature.id));
    },
    destroy() {
      map.off('move', moved);
      for (const marker of markers.values()) marker.remove();
      for (const id of ['replay-area-points', 'replay-area-pulse', 'replay-area-borders', 'replay-area-fill'])
        map.removeLayer(id);
      map.removeSource('replay-areas');
    },
  };
}
