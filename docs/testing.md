# Code checks, real-export tests, and benchmarks

## Routine checks

```sh
npm run lint
npm run format:check
npm test
npm run build
npm run check:build
```

ESLint checks recommended JavaScript correctness rules, including undefined and unused variables, with explicit browser/Node globals. Prettier formats JavaScript, HTML, CSS, YAML, JSON configuration, and Markdown. Markdown prose stays on one source line. Generated assets, reference datasets, personal files, and build outputs are excluded. Use `npm run lint:fix` for safe automatic lint fixes and `npm run format` to apply formatting.

`npm test` runs the focused model/map regression checks and six CSV/ZIP extraction cases: unchanged CSV, no trailing newline, nested eBird CSV plus metadata/other CSVs, a single renamed CSV, ambiguous/missing CSVs, and damaged ZIP input. CI runs lint, formatting, public tests, production build, and bundle checks. It needs no personal data or Python installation.

## Private cases based on your eBird export

Python 3 is required only to prepare independent reference counts. Run from the repository root:

```sh
npm run prepare:cases
npm run test:export
npm run benchmark:export
```

The default input is the preserved private `local/MyEBirdData.local.csv`. To use a refreshed export:

```sh
npm run prepare:cases -- /path/to/myebird.csv
```

The source is read without modification. Generated CSVs and their expected results stay under ignored `local/export-cases/`. Timing reports stay under ignored `output/benchmarks/`. None of these files is packaged or committed. Regenerate cases only when intentionally changing the source or taxonomy: the checks pin both with SHA-256 so stale fixtures fail clearly. Keep the manifest unchanged while comparing implementation changes.

The generator uses Python’s CSV reader and independently computes taxonomy roll-up and counts from raw fields. It creates an 84-row complete-checklist case, a 4,663-row representative case, and a reference to the full 188,407-row source for the current export. The representative case selects complete checklists across country/year and taxonomic/count/exotic-status strata, preserving every row of each selected checklist. Actual sizes change with the input.

Nine full-export scenarios cover all records, eligible species only, latest year, winter across December/January, a combined year/summer filter, a location, a species, an empty year, and a rectangle polygon checked independently using coordinate ranges. Every country/region group is compared against raw-row reference counts. At zoom levels 0, 3, 7, 12, and 15, each cluster is checked against its member records to catch duplicate species/checklist counting. Country-only records remain outside region groups, including codes ending in a hyphen. X counts are present observations; zero counts remain in checklist/location identities but do not count as observations.

The raw export has many rows without trailing optional columns. The JS test parser follows the app worker’s existing policy of tolerating field-count mismatches while rejecting CSV syntax errors. Python’s CSV reader provides the independent row interpretation. These checks verify app counting rules, not equivalence to an independently certified eBird life list; missing exotic status and taxonomy differences still apply.

## Benchmark method and first baseline

`npm run benchmark:export -- 5` uses one warmup plus five measured repetitions per fixture. The default is five. It records individual samples, median, p95, minimum, and maximum for read/parse/normalize, summaries, location grouping, index construction, cluster queries, country/region grouping, render-payload serialization, and the nine filters. The report records source/taxonomy hashes, Node, CPU, platform, and process peak RSS. Assertions verify correctness alongside timing.

The initial run on 26 October 2026 used Node v26.11.1 on an Apple M3 Pro:

| Case            |    Rows | Read/parse/normalize median | Cluster-index median |
| --------------- | ------: | --------------------------: | -------------------: |
| Small checklist |      84 |                     33.6 ms |               0.1 ms |
| Representative  |   4,663 |                     64.2 ms |               1.5 ms |
| Full export     | 188,407 |                  1,165.3 ms |              63.1 ms |

For the full file, location grouping took 84.1 ms, country grouping 74.7 ms, region grouping 111.9 ms, and the rectangle filter 39.1 ms at the median. The serialized location payload was about 2.08 MiB. This is a warm-filesystem Node baseline, including file reading and taxonomy loading. It excludes worker transfer, IndexedDB, Mapbox rendering, and network. The process-wide peak RSS was about 1,440 MiB across all repetitions; it is not an app-memory or per-fixture measurement. There are no arbitrary timing thresholds in CI.

For a separate synthetic stress case with 100,000 distinct locations, run `npm run benchmark`. That case tests a denser map than the private export and writes `output/review/map-benchmark.json`.

## Browser acceptance

Use `npm run preview` and a separate browser profile at `http://127.0.0.1:4173/my-ebird-map/`. Confirm demo labelling, CSV/ZIP worker imports, expected counts, stored-data reopening, grouping/filters/polygons, and the 390 × 844 mobile layout. Never overwrite a user’s existing browser snapshot for testing. Drive requires real-account sign-in/Save/Load acceptance; Node tests cannot verify Google OAuth or production Mapbox URL restrictions. See [deployment preparation](deployment.md).

The local production-preview acceptance run on 26 October 2026 imported the full CSV through the actual browser worker and verified 2,223 species, 11,736 checklists, 7,267 locations, and 187,190 observations against the independent reference. Reloading retained the same totals from IndexedDB. A 390 × 844 viewport check verified no horizontal overflow, and the country view rendered successfully. The smaller CSV also imported and reopened successfully. These checks used an isolated testing browser session; they do not establish physical-phone performance or Google Drive acceptance.

## Automated desktop and mobile checks

```sh
npx playwright install chromium webkit
npm run test:browser
npm run test:browser:report
```

The suite builds and serves production assets on port 4175. It runs desktop Chromium, Pixel 7 Chromium, desktop WebKit, and iPhone 13 WebKit in separate temporary persistent profiles, removed after each test. Persistent profiles allow IndexedDB File/Blob storage, which WebKit ephemeral sessions reject. These profiles never touch your personal browser data. CI installs both browsers, runs this suite, retains reports for 14 days, and requires it to pass before deployment.

Each device opens the demo, then imports a deterministic synthetic CSV containing 20,000 observations, 1,000 checklists, 500 locations, and two species through the actual import worker. Checks cover persisted counts after reload, search, sorting, pagination, seasonal-filter invalidation, mobile results open/close, settings, horizontal overflow, uncaught JavaScript errors, and axe WCAG A/AA rules. Automated accessibility checks cover only the exercised states and do not replace manual keyboard or screen-reader review.

Each run attaches `performance.json` with import duration, search-to-frame samples, supported paint/layout-shift/long-task entries, and Chromium heap measurements before and after 20 repeated tab/search interactions and garbage collection. The retained main-thread JS heap may grow by at most 16 MiB during those warmed interactions; this is a broad leak regression check, not a total-memory budget. Worker, native, GPU, and map-tile memory are outside that measurement. Wall-clock timing is reported rather than gated on shared CI hardware. These controlled lab measurements are not field Core Web Vitals or physical-phone performance.

The default suite disables the map token and fulfills third-party requests locally so tests need no network, credentials, or Mapbox quota. The four live-map integration cases are explicitly skipped. To exercise the real SDK, map canvas, all four map grouping modes, boundary downloads, zoom and metric controls, set a token permitted for the local preview origin:

```sh
BROWSER_MAPBOX_TOKEN=your_public_mapbox_token npm run test:browser
```

`npm run check:build` also enforces gzip budgets for the local entry JavaScript (80 KiB), entry CSS (35 KiB), and import worker (100 KiB). These allow modest headroom above the current approximately 61, 24, and 66 KiB. External Mapbox SDK/styles/tiles and lazily fetched taxonomy/boundaries are excluded; review them separately when comparing network traces. The budgets measure gzip size, not whether your deployment server actually enables compression.

## Performance pass, 28 October 2026

The demo bird names also match the bundled 2026 taxonomy, fixing a startup failure caught by the new browser checks. The demo now generates records inside an async factory, allowing its taxonomy indexes and replaced demo observations to be garbage-collected instead of retained by the module cache. The pass also reuses a number formatter across table cells, caches table aggregation until records/area/filters change, counts observation totals in the existing summary loop, accumulates map-group identities without per-group row arrays and repeated scans, avoids temporary union arrays during exact clustering, and finds the representative High Seas site with a linear scan. The Mapbox script is deferred so it no longer blocks HTML parsing. Exact species/checklist unions and zero/X/exotic-status behavior remain covered by existing regression tests.

A local before/after run used one warmup and three measured repetitions on the same 188,407-row export, Node v26.11.1, Apple M3 Pro. Median location grouping changed from 118.7 to 88.1 ms, country grouping from 110.2 to 56.9 ms, region grouping from 145.8 to 89.1 ms, and cluster indexing from 73.3 to 52.4 ms. The separate 100,000-location synthetic run changed grouping from 247.7 to 138.2 ms with identical render payload size. These are small local samples, not a general speed guarantee. Process-wide peak RSS across the export benchmark increased from 1,365 to 1,414 MiB; this run does not establish lower peak memory. Before/after reports remain in ignored `output/benchmarks/` on the machine used for the pass.

The final four-device browser run passed the synthetic demo/import/reopen/filter, accessibility, overflow, and heap checks. Importing the 20,000-row synthetic file took approximately 1.0–1.1 seconds. Chromium retained approximately 0.07–0.08 MiB of extra main-thread JS heap after the repeated interactions. Live Mapbox checks also passed on desktop and mobile Chromium; the live WebKit cases were not run. These results are local emulation measurements.
