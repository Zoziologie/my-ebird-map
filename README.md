# My eBird Map

Your eBird observations, mapped. Independent project; not an official eBird application.

The Mapbox app is now `2.3.0`. Import your full eBird CSV or ZIP export, explore species and locations, choose a count metric, and group locations automatically, by country/region, or with a drawn polygon. Imports stay in this browser’s IndexedDB; Google Drive backup/restore is optional. New visitors get a guided download-and-import flow; synthetic demonstration data loads only when they choose “Explore the demo”. Returning visitors reopen their last saved import automatically. “My data” contains import instructions, local save status, and optional Google Drive backup/restore.

New users start with individual locations. Display settings, date filters, result options, selected species, map position, and completed custom areas are stored in local browser preferences and restored on reload or return. Map movement is saved after it ends. Setup is kept in this browser; URLs do not customize the view. Existing saved view choices are preserved.

All map views use a continuous logarithmic purple–teal–yellow scale from 1 to the exact maximum for each metric and grouping. Zero counts are gray. Scales come from the complete imported file, including displayed High Seas aggregates. Selecting taxa recalculates scales from matching records; clearing the selection restores full-file scales. Pan, zoom, dates, additional-taxa visibility, and area filters keep the scales stable. Nearby-cluster scales use reference zoom 7. Country and region clicks fit the complete boundary geometry and anchor the popup at the boundary’s center. Illustrative boundaries use the same styling as other areas; their provenance note remains in the popup.

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

## Checklist replay (beta)

Choose your species and dates, then click **Replay** beside the top metrics. Replay is available in Individual locations, Country, and Region views; it is hidden in Location clusters and Custom area views. Replay uses all locations matching the explicit species, date, and custom-area filters, regardless of the current viewport, and fits the map to their full extent. Choose Country or Region before starting to replay cumulative polygon fills and count labels; switch between Individual locations, Country, and Region directly in the replay panel. Switching views reloads the replay at the same time, metric, speed, and play/pause state. Other groupings replay individual locations on the existing basemap. All replay views use the same full-file color scales and legend as the normal map: continuous logarithmic purple–teal–yellow colors in every view. A brief pulse highlights each location visit or area update. Polygon labels follow the selected metric and use compact K/M counts (or X for unknown numeric counts). Missing boundaries and High Seas retain labeled circle fallbacks. Illustrative polygons use normal styling with an explanatory popup note. Replay areas, including their outlines and fallback circles, remain completely invisible until their first checklist. The timeline shows checklist activity bars, calendar year ticks, and a cumulative metric selected with the top metric buttons: species, checklists, observations, numeric count, or locations. You can switch metrics while playback runs or is paused. Species and location bars show first appearances; the other bars show additions during each period. Locations appear on their first checklist and accumulate their own species, checklist, observation, numeric count, and location totals over time. Their colors change with those totals and stay visible between visits; revisits pulse again. Every replay view retains its metric colors at completion. Timeline controls keep the theme’s green accents. Checklists on the same date appear together because the imported model currently retains dates, not start times. Long gaps are compressed, and the full replay takes at most about 90 seconds at 1× speed.

Pan and zoom remain available without changing the captured selection. Pause to inspect a location or drag the timeline to seek; choose 0.5×, 1×, or 2× speed. The top metrics, replay view selector, pan/zoom, speed, and Settings remain available. Changing appearance reloads the replay at the same point; changing date filters or additional-taxa visibility restarts it with the new selection. Imports and polygon drawing remain unavailable during replay. The results sidebar stays collapsed; a selected species can be cleared directly. **Exit replay** or Escape returns to the normal map in the chosen view, restoring the normal metric and keeping your filters and current camera position. Escape closes Settings first when it is open. The selected species remains visible in the top-left menu. The top metrics show cumulative totals as time advances and highlight the selected replay metric; the Replay button indicates the current mode. Playback pauses when the tab is hidden and starts paused without expanding rings when reduced motion is requested.

Replay builds compact daily totals and a location-visit index on entry and keeps one temporary Mapbox point per location in location mode. Country and region replay prepare sparse per-area daily totals, load boundaries once, update numeric feature state, and animate visible count labels directly over 400 ms. Labels avoid asynchronous symbol placement, with collision checks and a maximum of 150 visible counters. During playback their displayed values ease toward the exact totals; pausing, scrubbing, switching metrics, reduced motion, and completion show exact values. Area species/checklist/location identities are deduplicated independently from global totals. Animation updates feature state and paint properties without rerunning the normal tables, summaries, filters, or clustering. The temporary source, layers, and animation loop are removed on exit.
