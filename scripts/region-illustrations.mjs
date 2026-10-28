// Partition a local longitude/latitude plane by nearest seed, compensating for latitude.
// These are display cells, never administrative boundaries or membership tests.
export function regionIllustrationCells(seeds, bounds) {
  const scale = Math.cos((((bounds[1] + bounds[3]) / 2) * Math.PI) / 180);
  return seeds.map(({ code, coordinates: [lon, lat] }, i) => {
    const x = lon * scale,
      y = lat;
    let ring = [
      [bounds[0] * scale, bounds[1]],
      [bounds[2] * scale, bounds[1]],
      [bounds[2] * scale, bounds[3]],
      [bounds[0] * scale, bounds[3]],
    ];
    for (const [j, other] of seeds.entries()) {
      if (i === j) continue;
      const ox = other.coordinates[0] * scale,
        oy = other.coordinates[1];
      const a = 2 * (ox - x),
        b = 2 * (oy - y),
        c = ox * ox + oy * oy - x * x - y * y;
      const clipped = [];
      for (let k = 0; k < ring.length; k++) {
        const start = ring[k],
          end = ring[(k + 1) % ring.length];
        const ds = a * start[0] + b * start[1] - c,
          de = a * end[0] + b * end[1] - c;
        if (ds <= 0) clipped.push(start);
        if (ds <= 0 !== de <= 0) {
          const t = ds / (ds - de);
          clipped.push([start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])]);
        }
      }
      ring = clipped;
    }
    ring = ring.map(([rx, ry]) => [rx / scale, ry]);
    return { type: 'Feature', properties: { code }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
  });
}
