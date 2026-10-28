import { normalizeRecord, taxonomyIndex } from './model.js';

// Fictional trips and observations, anchored near real regions. No randomness or personal data.
// Each trip has its own species pool, density, visit frequency, and geographic spread.
const trips = [
  {
    name: 'Camargue',
    region: 'FR-PAC',
    center: [4.65, 43.51],
    sites: 36,
    spread: 0.7,
    visits: 14,
    birds:
      'Greater Flamingo|Black-winged Stilt|Pied Avocet|Little Egret|Great Egret|Gray Heron|Purple Heron|Glossy Ibis|Eurasian Spoonbill|European Bee-eater|European Roller|Common Hoopoe|Common Kingfisher|Western Marsh Harrier|Eurasian Kestrel|Common Shelduck|Northern Shoveler|Mallard|Eurasian Coot|Dunlin|Little Tern|Common Tern|gull sp.|duck sp.',
    stops: [
      'Flamingo traffic jam',
      'One more egret',
      'The mosquito buffet',
      'Salty binoculars',
      'Croissant hide',
      'Wrong turn, right marsh',
    ],
  },
  {
    name: 'Lake Geneva',
    region: 'CH-VD',
    center: [6.54, 46.5],
    sites: 28,
    spread: 0.4,
    visits: 20,
    birds:
      'Mallard|Great Crested Grebe|Little Grebe|Eurasian Coot|Eurasian Moorhen|Tufted Duck|Common Pochard|Red-crested Pochard|Common Goldeneye|Great Cormorant|Gray Heron|Common Kingfisher|European Robin|Great Tit|Eurasian Blue Tit|Common Chaffinch|Eurasian Blackbird|Barn Swallow|Common Swift|Red Kite|White Stork|Mallard (Domestic type)',
    stops: [
      'The usual duck',
      'Coffee before coots',
      'Grebe expectations',
      'The office escape',
      'Five-minute lunch list',
      'That suspicious reed',
    ],
  },
  {
    name: 'Scottish coast',
    region: 'GB-SCT',
    center: [-2.6, 57.1],
    sites: 18,
    spread: 1.8,
    visits: 5,
    birds:
      'Atlantic Puffin|Common Murre|Razorbill|Black Guillemot|Northern Gannet|Black-legged Kittiwake|Northern Fulmar|European Shag|Great Cormorant|Great Skua|Arctic Tern|Eurasian Oystercatcher|Common Eider|Red-throated Loon|White-tailed Eagle|Peregrine Falcon|Rock Ptarmigan|Red Knot',
    stops: [
      'Puffin crossing',
      'Wind ate my sandwich',
      'The thousand-gannet cliff',
      'Very wet socks',
      'Seal of approval',
      'Last boat home',
    ],
  },
  {
    name: 'Costa Rica',
    region: 'CR-P',
    center: [-84.8, 10.18],
    sites: 42,
    spread: 0.8,
    visits: 9,
    birds:
      "Resplendent Quetzal|Keel-billed Toucan|Yellow-throated Toucan|Scarlet Macaw|Great Green Macaw|Rufous Motmot|Lesson's Motmot|Turquoise-browed Motmot|Rufous-tailed Hummingbird|Violet Sabrewing|Fiery-throated Hummingbird|Volcano Hummingbird|Red-legged Honeycreeper|Green Honeycreeper|Golden-hooded Tanager|Bay-headed Tanager|Summer Tanager|Scarlet Tanager|Great Kiskadee|Boat-billed Flycatcher|Montezuma Oropendola|Collared Aracari|King Vulture|Crested Guan|Blue-gray Tanager|Palm Tanager|Scarlet-rumped Tanager|Crimson-collared Tanager|Silver-throated Tanager|Emerald Tanager|Speckled Tanager|Spangle-cheeked Tanager|Black-and-yellow Tanager|White-throated Magpie-Jay|Brown Jay|Black-faced Solitaire|Wood Thrush|Clay-colored Thrush|Swainson's Thrush|Ruddy-capped Nightingale-Thrush|Orange-billed Nightingale-Thrush|Black-headed Nightingale-Thrush|Long-tailed Manakin|White-collared Manakin|Red-capped Manakin|Orange-collared Manakin|Snowcap|Black-crested Coquette|Green Thorntail|White-necked Jacobin|Green-crowned Brilliant|Purple-throated Mountain-gem|Coppery-headed Emerald|Magenta-throated Woodstar|Brown Violetear|Lesser Violetear|Scaly-breasted Hummingbird|Violet-headed Hummingbird|Graceful Black-throated Trogon|Gartered Violaceous Trogon|Slaty-tailed Trogon|Collared Trogon|White-fronted Amazon|Red-lored Amazon|Mealy Amazon|Orange-chinned Parakeet|Crimson-fronted Parakeet|Bat Falcon|Laughing Falcon|Crested Caracara|Roadside Hawk|White Hawk|Black Hawk-Eagle|Ornate Hawk-Eagle|Sunbittern|Sungrebe|Agami Heron|Bare-throated Tiger-Heron|Green Heron|Boat-billed Heron|Purple Gallinule|Northern Jacana|Rufous-backed Wren|Bay Wren|Stripe-breasted Wren|Riverside Wren|Ochraceous Wren|Collared Whitestart|Slate-throated Whitestart|Golden-crowned Warbler|Golden-winged Warbler|Tennessee Warbler|Chestnut-sided Warbler|Black-and-white Warbler|Prothonotary Warbler|Hoffmann's Woodpecker|Pale-billed Woodpecker|Acorn Woodpecker|Red-crowned Woodpecker|hummingbird sp.",
    stops: [
      'Wrong turn, right toucan',
      'Quetzal quest',
      'The hummingbird queue',
      'Sloth-speed trail',
      'Banana breakfast club',
      'Rain check rainforest',
    ],
  },
  {
    name: 'Mindo',
    region: 'EC-P',
    center: [-78.77, -0.05],
    sites: 32,
    spread: 0.35,
    visits: 7,
    birds:
      'Andean Cock-of-the-rock|Plate-billed Mountain-Toucan|Toucan Barbet|Golden-headed Quetzal|Crested Quetzal|Choco Toucan|Crimson-rumped Toucanet|Sword-billed Hummingbird|White-booted Racket-tail|Velvet-purple Coronet|Violet-tailed Sylph|Purple-bibbed Whitetip|Empress Brilliant|Fawn-breasted Brilliant|Sparkling Violetear|White-necked Jacobin|Golden Tanager|Flame-faced Tanager|Blue-winged Mountain Tanager|Blue-gray Tanager|Palm Tanager|Masked Trogon|Torrent Duck|White-capped Dipper|hummingbird sp.',
    stops: [
      'Cock-of-the-rock concert',
      'Tiny birds, huge breakfast',
      'Clouds with wings',
      'The tanager rainbow',
      'Bridge over birdy water',
      'Just one more feeder',
    ],
  },
  {
    name: 'Kenyan lakes',
    region: 'KE-700',
    center: [36.22, -0.55],
    sites: 30,
    spread: 1.3,
    visits: 6,
    birds:
      'Lesser Flamingo|Greater Flamingo|Great White Pelican|Pink-backed Pelican|African Fish-Eagle|Hamerkop|Marabou Stork|Saddle-billed Stork|Yellow-billed Stork|African Sacred Ibis|Hadada Ibis|Gray Crowned-Crane|Lilac-breasted Roller|Little Bee-eater|European Bee-eater|Malachite Kingfisher|Pied Kingfisher|Superb Starling|Secretarybird|Kori Bustard|Common Ostrich|Helmeted Guineafowl|Red-billed Oxpecker|African Jacana',
    stops: [
      'Flamingos to the horizon',
      'Hippo has right of way',
      'Secretary on safari',
      'The roller coaster',
      'Pelican parking lot',
      'Acacia afternoon',
    ],
  },
  {
    name: 'Hokkaido',
    region: 'JP-01',
    center: [144.25, 43.45],
    sites: 20,
    spread: 1.0,
    visits: 4,
    birds:
      "Red-crowned Crane|Steller's Sea-Eagle|White-tailed Eagle|Blakiston's Fish-Owl|Ural Owl|Whooper Swan|Tundra Swan|Harlequin Duck|Long-tailed Duck|Common Goldeneye|Smew|Mandarin Duck|Falcated Duck|Black Scoter|Greater White-fronted Goose|Slaty-backed Gull|Black-tailed Gull|Large-billed Crow|Long-tailed Tit|Marsh Tit",
    stops: [
      'Cranes on ice',
      'Eagle-eyed breakfast',
      'The owl night shift',
      'Frozen fingers hide',
      'Swan lake, literally',
      'Hot tea cold ducks',
    ],
  },
  {
    name: 'Queensland',
    region: 'AU-QLD',
    center: [145.65, -16.85],
    sites: 28,
    spread: 0.75,
    visits: 8,
    birds:
      "Southern Cassowary|Laughing Kookaburra|Blue-winged Kookaburra|Rainbow Lorikeet|Red-tailed Black-Cockatoo|Sulphur-crested Cockatoo|Galah|Australian King-Parrot|Double-eyed Fig-Parrot|Rainbow Bee-eater|Buff-breasted Paradise-Kingfisher|Azure Kingfisher|Victoria's Riflebird|Golden Bowerbird|Spotted Catbird|Tooth-billed Bowerbird|Wompoo Fruit-Dove|Pied Imperial-Pigeon|Comb-crested Jacana|Australian Pelican|Magpie Goose|Black-necked Stork|Australian Brushturkey",
    stops: [
      'Cassowary has priority',
      'Kookaburra comedy club',
      'Parrot party',
      'The bower art gallery',
      'Mangrove mud spa',
      'Noisy neighbours',
    ],
  },
  {
    name: 'California coast',
    region: 'US-CA',
    center: [-122.65, 37.8],
    sites: 24,
    spread: 1.0,
    visits: 11,
    birds:
      "California Condor|Brown Pelican|Brandt's Cormorant|Pelagic Cormorant|Heermann's Gull|Western Gull|Black Oystercatcher|Marbled Godwit|Hudsonian Whimbrel|Long-billed Curlew|Snowy Plover|Sanderling|Surf Scoter|Anna's Hummingbird|Allen's Hummingbird|Acorn Woodpecker|California Scrub-Jay|California Quail|Wrentit|Western Bluebird|Red-tailed Hawk|Turkey Vulture|Peregrine Falcon",
    stops: [
      'Condor detour',
      'The fog machine',
      'Otter distraction point',
      'Shorebird sudoku',
      'Pelican fly-by lane',
      'One last headland',
    ],
  },
  {
    name: 'Otago',
    region: 'NZ-OTA',
    center: [170.55, -45.85],
    sites: 12,
    spread: 0.45,
    visits: 3,
    birds:
      'Northern Royal Albatross|Southern Royal Albatross|Yellow-eyed Penguin|Little Penguin|New Zealand Bellbird|Tui|New Zealand Fantail|New Zealand Pigeon|Silvereye|Spotted Shag|Stewart Island Shag|Variable Oystercatcher|South Island Oystercatcher|Royal Spoonbill|Paradise Shelduck',
    stops: [
      'Albatross air traffic',
      'Penguin curfew',
      'The long way to lunch',
      'Windproof wishlist',
      'Tui much coffee',
      'The end of the road',
    ],
  },
  {
    name: 'Antarctic expedition',
    region: 'AQ',
    center: [-62.5, -64.5],
    sites: 7,
    spread: 3.0,
    visits: 2,
    birds:
      "Gentoo Penguin|Chinstrap Penguin|Adelie Penguin|Southern Giant-Petrel|Southern Fulmar|Snow Petrel|Wilson's Storm-Petrel|Snowy Sheathbill|South Polar Skua|Antarctic Tern|Imperial Cormorant (Antarctic)",
    stops: [
      'Penguin rush hour',
      'Iceberg drive-through',
      'The very south',
      'Snow business',
      'No trees, still birding',
      'Colony cacophony',
    ],
  },
];
// Keep generated records and taxonomy indexes collectable when personal data replaces the demo.
export default async function createDemo() {
  const taxonomy = await (await fetch(new URL('./assets/eBird_taxonomy.json', import.meta.url))).json();
  const index = taxonomyIndex(taxonomy);
  const byName = new Map(taxonomy.map((taxon) => [taxon.comName, taxon]));
  const records = [];
  for (const [tripNumber, trip] of trips.entries()) {
    const birds = trip.birds.split('|').map((name) => byName.get(name));
    for (let site = 0; site < trip.sites; site++) {
      // Golden-angle spirals make tight hubs and a few wider excursions without a grid.
      const angle = site * 2.399963;
      const distance = trip.spread * Math.pow((site + 1) / trip.sites, 2);
      const longitude = trip.center[0] + (Math.cos(angle) * distance) / Math.cos((trip.center[1] * Math.PI) / 180);
      const latitude = trip.center[1] + Math.sin(angle) * distance;
      const location = `${trip.name} · ${trip.stops[site % trip.stops.length]}${site >= trip.stops.length ? ` — ${['boardwalk', 'lookout', 'back trail', 'hide', 'river bend', 'forest edge'][Math.floor(site / trip.stops.length) - 1]}` : ''}`;
      const visits = 1 + ((site * 7 + tripNumber * 3) % trip.visits);
      for (let visit = 0; visit < visits; visit++) {
        for (const [bird, taxon] of birds.entries()) {
          const hash = (site * 137 + visit * 89 + bird * 53 + tripNumber * 31) % 997;
          // Productive hotspots, quiet stops, common birds, and occasional rarities.
          if (hash % 100 > 18 + ((birds.length - bird) / birds.length) * (25 + (site % 5) * 12)) continue;
          const flock = /Flamingo|Penguin|Dunlin|Knot|Sanderling|Goose|Swan|Pelican/.test(taxon.comName);
          records.push(
            normalizeRecord(
              {
                'Submission ID': `DEMO-${tripNumber}-${site}-${visit}`,
                'Location ID': `L-DEMO-${tripNumber}-${site}`,
                Location: location,
                'State/Province': trip.region,
                Longitude: longitude,
                Latitude: latitude,
                Date: `${2016 + ((visit + tripNumber + (site % 3)) % 10)}-${String(1 + ((tripNumber * 2 + visit * 3 + site) % 12)).padStart(2, '0')}-${String(1 + (hash % 28)).padStart(2, '0')}`,
                'Common Name': taxon.comName,
                'Scientific Name': taxon.sciName,
                Count:
                  hash % 23 === 0
                    ? 'X'
                    : String(flock ? 20 + (hash % 300) * (1 + (site % 12)) : 1 + (hash % (bird < 5 ? 3 : 35))),
              },
              index,
            ),
          );
        }
      }
    }
  }
  return { kind: 'synthetic', label: 'Synthetic demo · not your observations', records, hasExoticStatus: false };
}
