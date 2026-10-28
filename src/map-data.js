import Supercluster from 'supercluster';

// Accumulate distinct identities directly instead of retaining per-group record arrays.
export function groupMapRecords(records, grouping = 'auto') {
  const groups = new Map();
  for (const record of records) {
    if (grouping === 'region' && !record.region.split('-')[1]) continue;
    const key = grouping === 'country' ? record.country : grouping === 'region' ? record.region : record.locationId;
    if (!groups.has(key))
      groups.set(key, {
        name: grouping === 'country' || grouping === 'region' ? key : record.location,
        species: new Set(),
        checklists: new Set(),
        locations: new Map(),
        countries: new Set(),
        observations: 0,
        individuals: 0,
        additional: 0,
      });
    const group = groups.get(key);
    group.checklists.add(record.checklist);
    group.locations.set(record.locationId, record);
    if (record.country !== 'XX') group.countries.add(record.country);
    if (record.count === 0) continue;
    group.observations++;
    group.individuals += record.count ?? 0;
    if (record.species && record.exotic !== 'X') group.species.add(record.species);
    else group.additional++;
  }
  return [...groups].map(([id, group]) => {
    let x = 0,
      y = 0,
      z = 0;
    // A spherical mean also places groups correctly across the antimeridian.
    for (const { longitude, latitude } of group.locations.values()) {
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
        name: group.name,
        grouping,
        species: group.species.size,
        checklists: group.checklists.size,
        locations: group.locations.size,
        countries: group.countries.size,
        observations: group.observations,
        individuals: group.individuals,
        additional: group.additional,
        speciesIds: [...group.species],
        checklistIds: [...group.checklists],
      },
    };
  });
}

// One High Seas total, anchored at the observed site nearest its spherical mean.
export function groupMapDisplayRecords(records, grouping) {
  const points = groupMapRecords(records, grouping);
  if (!['country', 'region'].includes(grouping)) return points;
  const offshore = groupMapRecords(
    records.filter((record) => record.country === 'XX'),
    'country',
  );
  if (offshore.length) {
    const [longitude, latitude] = offshore[0].geometry.coordinates.map((value) => (value * Math.PI) / 180);
    let site,
      nearest = -Infinity;
    for (const record of records) {
      if (record.country !== 'XX') continue;
      const distance =
        Math.sin(latitude) * Math.sin((record.latitude * Math.PI) / 180) +
        Math.cos(latitude) *
          Math.cos((record.latitude * Math.PI) / 180) *
          Math.cos((record.longitude * Math.PI) / 180 - longitude);
      if (distance > nearest) {
        site = record;
        nearest = distance;
      }
    }
    offshore[0].geometry.coordinates = [site.longitude, site.latitude];
  }
  return [
    ...points.filter((point) => point.properties.id !== 'XX'),
    ...offshore.map((point) => ({ ...point, properties: { ...point.properties, highSeas: true } })),
  ];
}

export function indexMapLocations(points) {
  return new Supercluster({
    radius: 44,
    maxZoom: 14,
    map: (props) => ({
      speciesIds: new Set(props.speciesIds),
      checklistIds: new Set(props.checklistIds),
      observations: props.observations,
      individuals: props.individuals,
      locations: props.locations,
    }),
    reduce(accumulated, props) {
      // Copy sets: Supercluster may shallow-copy a child cluster's properties.
      accumulated.speciesIds = new Set(accumulated.speciesIds);
      for (const id of props.speciesIds) accumulated.speciesIds.add(id);
      accumulated.checklistIds = new Set(accumulated.checklistIds);
      for (const id of props.checklistIds) accumulated.checklistIds.add(id);
      accumulated.observations += props.observations;
      accumulated.individuals += props.individuals;
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
        individuals: p.individuals,
        locations: p.locations,
      },
    };
  });
}

// Resolve a table location to the marker (including its cluster) currently on the map.
export function indexLocationHighlights(features, clusterIndex) {
  const highlights = new Map();
  for (const feature of features) {
    const { id, cluster_id: clusterId } = feature.properties;
    highlights.set(clusterId === undefined ? id : `cluster:${clusterId}`, feature);
    if (clusterId !== undefined)
      for (const leaf of clusterIndex.getLeaves(clusterId, Infinity)) highlights.set(leaf.properties.id, feature);
  }
  return highlights;
}

export function formatMapCount(value, observations = 0) {
  if (value === 0 && observations > 0) return 'X';
  if (value >= 999950) return `${Math.round(value / 100000) / 10}M`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

// ID sets stay in the counting index, not in Mapbox's rendering payload.
export function renderMapFeatures(features) {
  return features.map(({ properties: { speciesIds, checklistIds, ...properties }, ...feature }) => ({
    ...feature,
    properties: {
      ...properties,
      observationLabel: formatMapCount(properties.observations),
      individualsLabel: formatMapCount(properties.individuals, properties.observations),
    },
  }));
}

// Join by exported country/region code; geometry never determines group membership.
export function boundaryMapFeatures(points, boundaries) {
  const polygons = [],
    circles = [],
    labels = [];
  for (const point of renderMapFeatures(points)) {
    const boundary = boundaries.get(point.properties.id);
    if (!boundary) {
      circles.push(point);
      continue;
    }
    const properties = {
      ...point.properties,
      approximate: Boolean(boundary.properties.approximate),
      boundaryMethod: boundary.properties.boundaryMethod || '',
    };
    polygons.push({ type: 'Feature', geometry: boundary.geometry, properties });
    labels.push({ ...point, properties, geometry: { type: 'Point', coordinates: boundary.properties.label } });
  }
  return { polygons, circles, labels };
}

const boundaryBounds = new WeakMap();

export function geometryBounds(geometry) {
  if (boundaryBounds.has(geometry)) return boundaryBounds.get(geometry);
  const rings =
    geometry.type === 'Point'
      ? [[geometry.coordinates]]
      : geometry.type === 'Polygon'
        ? geometry.coordinates
        : geometry.coordinates.flat();
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const ring of rings)
    for (const [longitude, latitude] of ring) {
      west = Math.min(west, longitude);
      east = Math.max(east, longitude);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
    }
  const bounds = [
    [west, south],
    [east, north],
  ];
  boundaryBounds.set(geometry, bounds);
  return bounds;
}
