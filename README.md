# My eBird Map

Your eBird observations, mapped. Independent project; not an official eBird application.

The Mapbox app is now `2.2.0`. Import your full eBird CSV or ZIP export, explore species and locations, choose a count metric, and group locations automatically, by country/region, or with a drawn polygon. Imports stay in this browser’s IndexedDB; Google Drive backup/restore is optional. New visitors get a guided download-and-import flow; synthetic demonstration data loads only when they choose “Explore the demo”. Returning visitors reopen their last saved import automatically. “My data” contains import instructions, local save status, and optional Google Drive backup/restore.

New users start with individual locations. Display settings, date filters, result options, map position, and completed custom areas are stored in local browser preferences and restored on return. Existing saved view choices are preserved.

The address bar stays in sync with the current view after a 200 ms debounce, using `history.replaceState` without navigation or extra history entries. Copy the URL to reopen the view; URL settings override saved browser preferences. For example: `?lat=46.52&lon=6.63&zoom=8&mapview=region&species=mallar3`. Map movement is saved after it ends, so URL updates do not run on animation frames.

Supported parameters are `lat`, `lon`, `zoom`, `bearing`, `pitch`, `mapview` (`off`, `auto`, `country`, `region`, `polygon`), `species` (comma-separated eBird taxon codes), `metric`, `background`, `projection`, `theme`, `yearFrom`, `yearTo`, `monthFrom`, `monthTo`, `followMap`, and `additional` (the two toggles use `1`/`0`). Completed custom areas use `polygon` as a JSON array of `[longitude, latitude]` pairs. Empty species, polygon, and date parameters clear those filters. Links contain view settings; observation data must already be imported on the receiving device, or imported after opening the link.

Map colors use discrete categories computed from the complete imported file, separately for each metric and grouping. Selecting one or more taxa recalculates categories from all matching records in that file; clearing the selection restores the original scales. Pan, zoom, dates, additional-taxa visibility, and area filters keep the current scales stable. Nearby-cluster scales use clusters at reference zoom 7. Larger ranges use six categories with rounded, progressively wider intervals; counts up to six use only meaningful integer categories. Zero counts are gray and the highest category remains open-ended.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .env
# Set VITE_MAPBOX_ACCESS_TOKEN in .env; optionally set VITE_GOOGLE_CLIENT_ID.
npm run dev
```

Open `http://localhost:5173/my-ebird-map/`. The Mapbox token and Google client ID are public browser configuration. Keep the developer-only `EBIRD_API_TOKEN` out of all `VITE_` variables. See [Google Drive setup](docs/google-drive-setup.md).

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
npx playwright install chromium webkit
npm run test:browser
npm run preview
```

The build writes the static app to `dist/` for `/my-ebird-map/`. Preview at `http://localhost:4173/my-ebird-map/`. Model checks cover taxonomic counting, exotic status, filters, polygon containment, distinct cluster totals, and country boundaries. Build checks verify runtime assets and exclusion of private files. Optional stress measurement: `npm run benchmark`.

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

Country grouping lazily loads [shared country boundaries](docs/country-polygons.md), with circles where boundaries are missing.

Region grouping lazily loads [global region boundaries](docs/region-polygons.md) for all 3,669 eBird regions across 200 countries and territories: 3,611 source boundary polygons and 58 explicitly marked synthetic illustrations. See the [complete coverage and gap report](docs/region-boundary-coverage.md). Regenerate per-country assets with `npm run prepare:regions`; source mappings, checksums, licences and unresolved regions are recorded with the data. Country mode covers all 252 land/territory country codes; High Seas appears as one aggregate circle in Country and Region modes. Country labels use eBird's own code inventory.

Imports and demonstration data use the complete official **eBird API v2026** taxonomy bundled in `src/assets/eBird_taxonomy.json`. `src/assets/taxonomy-source.json` records the pinned release, API URL, download time, taxon count and SHA-256. No taxon entries or historical-name aliases are manually added. Regenerate both files directly from the official API:

```sh
node --env-file=.env scripts/prepare-taxonomy.mjs 2026
```

The API token stays in the Node process. New imports record the taxonomy version and hash; existing saved observations keep their previous normalization until re-imported. Older exports can contain names or unsplit identifications absent from v2026, so use a fresh eBird export when updating. Updating taxonomy alone does not guarantee agreement with eBird’s life list because exotic status and unresolved-identification counting also differ.

To download a separate research snapshot without changing the bundled release:

```sh
npm run review:taxonomy
node scripts/review-export.mjs /path/to/MyEBirdData.csv local/taxonomy.local.json 'eBird API snapshot'
```

These commands require a local `.env` with `EBIRD_API_TOKEN` for taxonomy download. Generated research samples are used by optional local regression checks and are excluded from the deployment.

For a supplied regional exotic-status CSV, `node scripts/prepare-exotics.mjs /path/to/matrix.csv src/assets/exotic-rules.json` updates the bundled lookup and county-name mapping with source provenance. See [regional exotic rules](docs/exotic-rules.md) for lookup precedence and county limitations, and [historical taxonomy comparison](docs/exotic-taxonomy-review.md) for the 24 matrix codes absent from the former bundled snapshot. Re-import an export to apply updated rules to previously saved observations.
