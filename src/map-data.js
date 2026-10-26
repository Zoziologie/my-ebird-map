import Supercluster from 'supercluster';
import { summarize } from './model.js';

// Keep original records together until distinct species/checklist counts are computed.
export function groupMapRecords(records, grouping = 'auto') {
  const groups = new Map();
  for (const record of records) {
    if (grouping === 'region' && !record.region.split('-')[1]) continue;
    const key = grouping === 'country' ? record.country : grouping === 'region' ? record.region : record.locationId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups].map(([id, rows]) => {
    const locations = new Map(rows.map((record) => [record.locationId, record]));
    let x = 0,
      y = 0,
      z = 0;
    // A spherical mean also places groups correctly across the antimeridian.
    for (const { longitude, latitude } of locations.values()) {
      const lon = (longitude * Math.PI) / 180,
        lat = (latitude * Math.PI) / 180;
      x += Math.cos(lat) * Math.cos(lon);
      y += Math.cos(lat) * Math.sin(lon);
      z += Math.sin(lat);
    }
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI],
      },
      properties: {
        id,
        name: grouping === 'country' || grouping === 'region' ? id : rows[0].location,
        grouping,
        ...summarize(rows),
        speciesIds: [
          ...new Set(
            rows
              .filter((record) => record.count !== 0 && record.species && record.exotic !== 'X')
              .map((record) => record.species),
          ),
        ],
        checklistIds: [...new Set(rows.map((record) => record.checklist))],
      },
    };
  });
}

export function indexMapLocations(points) {
  return new Supercluster({
    radius: 44,
    maxZoom: 14,
    map: (props) => ({
      speciesIds: new Set(props.speciesIds),
      checklistIds: new Set(props.checklistIds),
      observations: props.observations,
      locations: props.locations,
    }),
    reduce(accumulated, props) {
      // Copy sets: Supercluster may shallow-copy a child cluster's properties.
      accumulated.speciesIds = new Set([...accumulated.speciesIds, ...props.speciesIds]);
      accumulated.checklistIds = new Set([...accumulated.checklistIds, ...props.checklistIds]);
      accumulated.observations += props.observations;
      accumulated.locations += props.locations;
    },
  }).load(points);
}

export function clusteredMapFeatures(index, zoom) {
  return index.getClusters([-180, -90, 180, 90], Math.floor(zoom)).map((feature) => {
    const p = feature.properties;
    if (!p.cluster) return feature;
    return {
      ...feature,
      properties: {
        cluster: true,
        cluster_id: p.cluster_id,
        point_count: p.point_count,
        species: p.speciesIds.size,
        checklists: p.checklistIds.size,
        observations: p.observations,
        locations: p.locations,
      },
    };
  });
}

export function formatMapObservation(value) {
  if (value >= 999950) return `${Math.round(value / 100000) / 10}M`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

// ID sets stay in the counting index, not in Mapbox's rendering payload.
export function renderMapFeatures(features) {
  return features.map(({ properties: { speciesIds, checklistIds, ...properties }, ...feature }) => ({
    ...feature,
    properties: { ...properties, observationLabel: formatMapObservation(properties.observations) },
  }));
}

// Join by exported country code; boundary geometry never determines group membership.
export function countryMapFeatures(points, boundaries) {
  const polygons = [],
    circles = [],
    labels = [];
  for (const point of renderMapFeatures(points)) {
    const boundary = boundaries.get(point.properties.id);
    if (!boundary) {
      circles.push(point);
      continue;
    }
    polygons.push({ type: 'Feature', geometry: boundary.geometry, properties: point.properties });
    labels.push({ ...point, geometry: { type: 'Point', coordinates: boundary.properties.label } });
  }
  return { polygons, circles, labels };
}
