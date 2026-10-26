const taxonomy = await (await fetch(new URL('./assets/eBird_taxonomy.json', import.meta.url))).json();
import { normalizeRecord, taxonomyIndex } from './model.js';

// Synthetic, deterministic fallback for collaborators without the private export.
const places = [
  ['CH', 'L-DEMO-1', 'Lake Geneva', 6.54, 46.5],
  ['FR', 'L-DEMO-2', 'Camargue', 4.65, 43.51],
  ['ES', 'L-DEMO-3', 'Doñana', -6.43, 36.99],
  ['GB', 'L-DEMO-4', 'North Norfolk coast', 0.83, 52.97],
  ['PT', 'L-DEMO-5', 'Tagus estuary', -8.94, 38.84],
  ['SE', 'L-DEMO-6', 'Falsterbo', 12.82, 55.38],
  ['MA', 'L-DEMO-7', 'Souss-Massa', -9.65, 30.08],
  ['ZA', 'L-DEMO-8', 'Cape Peninsula', 18.45, -34.15],
  ['KE', 'L-DEMO-9', 'Lake Naivasha', 36.34, -0.77],
  ['JP', 'L-DEMO-10', 'Kyoto', 135.77, 35.02],
  ['IN', 'L-DEMO-11', 'Bharatpur', 77.52, 27.16],
  ['TH', 'L-DEMO-12', 'Doi Inthanon', 98.49, 18.56],
  ['US', 'L-DEMO-13', 'Point Reyes', -122.82, 38.07],
  ['CR', 'L-DEMO-14', 'Monteverde', -84.81, 10.3],
  ['EC', 'L-DEMO-15', 'Mindo', -78.78, -0.05],
  ['BR', 'L-DEMO-16', 'Pantanal', -56.72, -16.39],
  ['AU', 'L-DEMO-17', 'Cairns', 145.77, -16.92],
  ['NZ', 'L-DEMO-18', 'Otago Peninsula', 170.65, -45.84],
];
const selected = taxonomy.filter((taxon) =>
  [
    'European Robin',
    'Barn Swallow',
    'Great Tit',
    'Common Chaffinch',
    'Mallard',
    'Common Kingfisher',
    'Eurasian Coot',
    'Gray Heron',
    'Great Cormorant',
    'Little Egret',
    'Common Swift',
    'Northern Shoveler',
    'Eurasian Kestrel',
    'Black-winged Stilt',
  ].includes(taxon.comName),
);
selected.push(
  ...['spuh', 'slash', 'hybrid', 'domestic', 'issf', 'intergrade', 'form'].map((category) =>
    taxonomy.find((taxon) => taxon.category === category),
  ),
);
const index = taxonomyIndex(taxonomy),
  records = [];
for (let place = 0; place < places.length; place++) {
  for (let visit = 0; visit < 8; visit++) {
    for (let bird = 0; bird < selected.length; bird++) {
      if ((place + visit + bird) % 4 === 0) continue;
      const [country, id, location, longitude, latitude] = places[place];
      records.push(
        normalizeRecord(
          {
            'Submission ID': `DEMO-${place}-${visit}`,
            'Location ID': id,
            Location: location,
            'State/Province': `${country}-DEMO`,
            Longitude: longitude,
            Latitude: latitude,
            Date: `${2022 + (visit % 4)}-${String(1 + ((place + visit) % 12)).padStart(2, '0')}-15`,
            'Common Name': selected[bird].comName,
            'Scientific Name': selected[bird].sciName,
            Count: bird % 9 === 0 ? 'X' : String(1 + ((place * 3 + visit + bird) % 24)),
          },
          index,
        ),
      );
    }
  }
}
export default { kind: 'synthetic', label: 'Synthetic demo · not your observations', records, hasExoticStatus: false };
