// Retain taxonomy identity separately from observation-level exotic status.
export function taxonomyIndex(taxonomy) {
  return {
    scientific: new Map(taxonomy.map((taxon) => [taxon.sciName, taxon])),
    code: new Map(taxonomy.map((taxon) => [taxon.speciesCode, taxon])),
  };
}

export function normalizeRecord(row, taxonomy) {
  const taxon = taxonomy.scientific.get(row['Scientific Name']);
  const parent = taxon && taxonomy.code.get(taxon.reportAs || taxon.speciesCode);
  const countable = !['spuh', 'slash', 'hybrid'].includes(taxon?.category) && parent?.category === 'species';
  return {
    checklist: row['Submission ID'],
    locationId: row['Location ID'],
    location: row.Location,
    longitude: Number(row.Longitude),
    latitude: Number(row.Latitude),
    region: row['State/Province'],
    country: row['State/Province'].split('-')[0],
    date: row.Date,
    name: row['Common Name'],
    scientific: row['Scientific Name'],
    code: taxon?.speciesCode || row['Scientific Name'],
    taxonOrder: (countable ? parent : taxon)?.taxonOrder ?? Number.MAX_SAFE_INTEGER,
    category: taxon?.category || 'unmatched',
    species: countable ? parent.speciesCode : null,
    speciesName: countable ? parent.comName : null,
    speciesScientific: countable ? parent.sciName : null,
    count: row.Count.toUpperCase() === 'X' ? null : Number(row.Count),
    exotic: row['Exotic Code'] ?? null,
  };
}

export function summarize(records) {
  const species = new Set(),
    checklists = new Set(),
    locations = new Set(),
    countries = new Set();
  let additional = 0;
  for (const record of records) {
    checklists.add(record.checklist);
    locations.add(record.locationId);
    if (record.country !== 'XX') countries.add(record.country);
    if (record.count === 0) continue;
    if (record.species && record.exotic !== 'X') species.add(record.species);
    else additional++;
  }
  return {
    species: species.size,
    checklists: checklists.size,
    locations: locations.size,
    countries: countries.size,
    observations: records.filter((record) => record.count !== 0).length,
    additional,
  };
}

export function filterRecords(records, filters) {
  return records.filter((record) => {
    const month = record.date.slice(0, 7),
      year = record.date.slice(0, 4),
      season = record.date.slice(5, 7);
    const inSeason =
      filters.monthFrom && filters.monthTo && filters.monthFrom > filters.monthTo
        ? season >= filters.monthFrom || season <= filters.monthTo
        : (!filters.monthFrom || season >= filters.monthFrom) && (!filters.monthTo || season <= filters.monthTo);
    return (
      inSeason &&
      (!filters.yearFrom || year >= filters.yearFrom) &&
      (!filters.yearTo || year <= filters.yearTo) &&
      (!filters.from || month >= filters.from) &&
      (!filters.to || month <= filters.to) &&
      (!filters.code || (record.count !== 0 && (record.code === filters.code || record.species === filters.code))) &&
      (!filters.locationId || record.locationId === filters.locationId) &&
      (filters.additional || (record.species && record.exotic !== 'X'))
    );
  });
}

export function unwrapPolygon(polygon) {
  const ring = [polygon[0]];
  for (const [longitude, latitude] of polygon.slice(1)) {
    const previous = ring[ring.length - 1][0];
    ring.push([previous + ((longitude - previous + 540) % 360) - 180, latitude]);
  }
  return ring;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point, a, b) {
  return (
    Math.abs(cross(a, b, point)) <= 1e-10 &&
    point[0] >= Math.min(a[0], b[0]) - 1e-10 &&
    point[0] <= Math.max(a[0], b[0]) + 1e-10 &&
    point[1] >= Math.min(a[1], b[1]) - 1e-10 &&
    point[1] <= Math.max(a[1], b[1]) + 1e-10
  );
}

export function polygonError(vertices) {
  if (vertices.length < 3) return 'Add at least three corners.';
  const ring = unwrapPolygon(vertices);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      const c = ring[j],
        d = ring[(j + 1) % ring.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, c, d) ||
        onSegment(b, c, d) ||
        onSegment(c, a, b) ||
        onSegment(d, a, b)
      )
        return 'Edges cross. Undo a corner to fix the polygon.';
    }
  }
  const area = ring.reduce(
    (sum, point, i) => sum + point[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * point[1],
    0,
  );
  return Math.abs(area) < 1e-10 ? 'The polygon needs an area. Add a corner away from the line.' : null;
}

export function pointInPolygon(point, polygon) {
  const longitude = polygon[0][0] + ((point[0] - polygon[0][0] + 540) % 360) - 180;
  const position = [longitude, point[1]];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (onSegment(position, polygon[j], polygon[i])) return true;
    if (
      polygon[i][1] > position[1] !== polygon[j][1] > position[1] &&
      position[0] <
        ((polygon[j][0] - polygon[i][0]) * (position[1] - polygon[i][1])) / (polygon[j][1] - polygon[i][1]) +
          polygon[i][0]
    )
      inside = !inside;
  }
  return inside;
}

// eBird uses the same location/country/region scope for personal summary pages.
export function ebirdSummaryLinks(scope, checklistIds, species = '') {
  return {
    species: `https://ebird.org/lifelist/${encodeURIComponent(scope)}${species ? `?spp=${encodeURIComponent(species)}` : ''}`,
    checklists:
      checklistIds.length === 1
        ? `https://ebird.org/checklist/${encodeURIComponent(checklistIds[0])}`
        : `https://ebird.org/mychecklists/${encodeURIComponent(scope)}`,
  };
}
