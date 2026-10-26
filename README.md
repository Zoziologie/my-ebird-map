# My eBird Map

Your eBird observations, mapped. Independent project; not an official eBird application.

The Mapbox rewrite is now the main app (`2.0.0`). Import your full eBird CSV or ZIP export, explore species and locations, choose a count metric, and group locations automatically, by country/region, or with a drawn polygon. Imports stay in this browser’s IndexedDB; Google Drive backup/restore is optional. New visitors get a guided download-and-import flow; synthetic demonstration data loads only when they choose “Explore the demo”. Returning visitors reopen their last saved import automatically. “My data” contains import instructions, local save status, and optional Google Drive backup/restore.

New users start with individual locations. Display settings, date filters, result options, map position, and completed custom areas are stored in local browser preferences and restored on return. Existing saved view choices are preserved.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .env
# Set VITE_MAPBOX_ACCESS_TOKEN in .env; optionally set VITE_GOOGLE_CLIENT_ID.
npm run dev
```

Open `http://localhost:5173/myebirdmap/`. The Mapbox token and Google client ID are public browser configuration. Keep the developer-only `EBIRD_API_TOKEN` out of all `VITE_` variables. See [Google Drive setup](docs/google-drive-setup.md).

To prepare an ignored private export for local development:

```sh
npm run prepare:local -- /path/to/MyEBirdData.csv
```

This copies the export into ignored `local/` without changing the source. Choose the CSV from “My data” to import it. Development and production use the same first-visit flow; neither automatically loads private preview data. Clear the site’s stored browser data to revisit onboarding. The guided import links to eBird’s Download My Data page and accepts either the downloaded ZIP or its CSV. Successful imports save locally without a separate save action; optional Drive backups use explicit Save backup and Restore backup actions.

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

Imports preserve the export's County column and use the bundled regional exotic matrix when observation-level status is absent. Species totals can still differ from eBird because regional defaults cannot reproduce checklist overrides, unresolved counties or taxonomy changes. The app does not fetch status separately for every checklist. Very large spherical/polar polygons and real-account Drive access still require acceptance checks before public release. French names are not implemented. Google Analytics event tracking is optional and loads only after consent; the choice can be changed in Settings.

## Reference data and research

Country grouping lazily loads [shared country boundaries](docs/country-polygons.md), with circles where boundaries are missing. Imports and demonstration data use the bundled `src/assets/eBird_taxonomy.json` snapshot; its upstream release version is unknown. Research downloads remain separate until explicitly reviewed and promoted:

```sh
npm run review:taxonomy
node scripts/review-export.mjs /path/to/MyEBirdData.csv local/taxonomy.local.json 'eBird API snapshot'
```

These commands require a local `.env` with `EBIRD_API_TOKEN` for taxonomy download. Generated research samples are used by optional local regression checks and are excluded from the deployment.

For a supplied regional exotic-status CSV, `node scripts/prepare-exotics.mjs /path/to/matrix.csv src/assets/exotic-rules.json` updates the bundled lookup and county-name mapping with source provenance. See [regional exotic rules](docs/exotic-rules.md) for lookup precedence and county limitations, and [taxonomy differences](docs/exotic-taxonomy-review.md) for the 24 codes absent from the bundled taxonomy. Re-import an export to apply updated rules to previously saved observations.
