# My eBird Map

Your eBird observations, mapped. Independent project; not an official eBird application.

The Mapbox rewrite is now the main app (`2.0.0`). Import your full eBird CSV or ZIP export, explore species and locations, choose a count metric, and group locations automatically, by country/region, or with a drawn polygon. Imports stay in this browser’s IndexedDB; Google Drive backup/restore is optional. New visitors see clearly marked synthetic demonstration data.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .env
# Set VITE_MAPBOX_ACCESS_TOKEN in .env; optionally set VITE_GOOGLE_CLIENT_ID.
npm run dev
```

Open `http://localhost:5173/myebirdmap/`. The Mapbox token and Google client ID are public browser configuration. Keep the developer-only `EBIRD_API_TOKEN` out of all `VITE_` variables. See [Google Drive setup](docs/google-drive-setup.md).

To automatically load a private export during development when no browser snapshot exists:

```sh
npm run prepare:local -- /path/to/MyEBirdData.csv
```

This copies the export into ignored `local/` without changing the source. Remove `local/preview-data.local.json` and clear the site’s stored browser data to return to the demo. Production builds never load developer data. You can also import through **Load → CSV or ZIP**.

## Check and build

```sh
npm run lint
npm run format:check
npm test
npm run build
npm run check:build
npm run preview
```

The build writes the static app to `dist/` for `/myebirdmap/`. Preview at `http://localhost:4173/myebirdmap/`. Model checks cover taxonomic counting, exotic status, filters, polygon containment, distinct cluster totals, and country boundaries. Build checks verify runtime assets and exclusion of private files. Optional stress measurement: `npm run benchmark`.

For private CSV regression cases, run `npm run prepare:cases`, `npm run test:export`, and `npm run benchmark:export`. See [test cases, benchmark method, and the first measured baseline](docs/testing.md).

## Repository layout

- `src/`: app, import worker, data model, map aggregation, storage, Drive integration, styles, and public reference assets.
- `public/`: files copied directly to the production bundle.
- `scripts/`: app/build checks, reproducible boundary preparation, and developer research tools.
- `docs/`: deployment, integrations, reference-data provenance, historical design review, and release notes.
- `local/`, `output/`, `.env`: ignored private development data and generated artifacts.

The former Vue/Leaflet app remains available in Git at commit `e8eb9587fe19462776266eecfae59eff9ac431d6`. There is one app entry and one Vite configuration.

## Deployment

GitHub Actions checks pull requests. Pushes to `main` and manual runs on `main` build and deploy to GitHub Pages. Configure the repository’s public Mapbox token before pushing; deployment deliberately fails without it. See [deployment preparation and acceptance checks](docs/deployment.md) and [release notes](docs/releases/README.md).

Species totals can differ from eBird when an export lacks exotic status. The app does not fetch status separately for every checklist. Very large spherical/polar polygons and real-account Drive access still require acceptance checks before public release. French names and analytics are not implemented.

## Reference data and research

Country grouping lazily loads [shared country boundaries](docs/country-polygons.md), with circles where boundaries are missing. Imports and demonstration data use the bundled `src/assets/eBird_taxonomy.json` snapshot; its upstream release version is unknown. Research downloads remain separate until explicitly reviewed and promoted:

```sh
npm run review:taxonomy
node scripts/review-export.mjs /path/to/MyEBirdData.csv local/taxonomy.local.json 'eBird API snapshot'
```

These commands require a local `.env` with `EBIRD_API_TOKEN` for taxonomy download. Generated research samples are used by optional local regression checks and are excluded from the deployment.
