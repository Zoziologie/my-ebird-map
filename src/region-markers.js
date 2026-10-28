import { continuousMapColorValue } from './map-colors.js';
import { formatMapCount } from './map-data.js';

const cachedValues = new WeakMap();

export function regionMarkerRadius(value) {
  return 9 + (21 * Math.min(9, Math.log(value + 1))) / 9;
}

// A single icon keeps the number, fill and rings in the same stacking order.
export function updateRegionMarkers(map, points, metric, maximum) {
  if (!cachedValues.has(map)) cachedValues.set(map, new Map());
  const cache = cachedValues.get(map);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 136;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.scale(2, 2);
  for (const { properties } of points) {
    const id = `region:${properties.id}`;
    const value = properties[metric];
    const color = continuousMapColorValue(value, maximum);
    const label =
      metric === 'individuals'
        ? formatMapCount(value, properties.observations)
        : metric === 'observations'
          ? formatMapCount(value)
          : String(value);
    const key = `${value}/${color}/${label}`;
    if (map.hasImage(id) && cache.get(id) === key) continue;
    const radius = regionMarkerRadius(value);
    context.clearRect(0, 0, 68, 68);
    context.beginPath();
    context.arc(34, 34, radius + 3, 0, Math.PI * 2);
    context.fillStyle = 'rgba(23, 62, 84, 0.65)';
    context.fill();
    context.beginPath();
    context.arc(34, 34, radius + 2, 0, Math.PI * 2);
    context.fillStyle = properties.highSeas ? '#087db5' : '#ffffff';
    context.fill();
    context.beginPath();
    context.arc(34, 34, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.font = 'bold 10px Lato, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle =
      value === 0 || maximum <= 1 || Math.log(value + 1) >= Math.log(2) + (Math.log(maximum + 1) - Math.log(2)) * 0.6
        ? '#102a36'
        : '#ffffff';
    context.fillText(label, 34, 34);
    const image = context.getImageData(0, 0, 136, 136);
    if (map.hasImage(id)) map.updateImage(id, image);
    else map.addImage(id, image, { pixelRatio: 2 });
    cache.set(id, key);
  }
}
