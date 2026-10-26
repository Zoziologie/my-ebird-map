# My eBird Map: app review and rewrite proposal

Historical design/research log. The prototype has since been promoted into `src/` as the main app. Current setup and release status are documented in [the README](../README.md) and [deployment preparation](deployment.md); recommendations below describe earlier stages.
Design study prepared on 25 October 2026. **My eBird Map** is the agreed display name; the repository and URL slug are `myebirdmap`. This phase provides a review, a working interface study, a full-export profile, and a small test dataset. The existing production app is unchanged.

**Agreed after the first mockup:** keep the interface centered on zooming to a place or drawing an area, with aggregated species and checklists for that area. Keep light/dark variants, local storage plus optional Drive backup/restore, and English UI with English/French bird names. Remove the month slider and introductory map copy. The revised prototype follows the map automatically when zoomed beyond the world overview and exposes Species, Checklists, and Places tabs.

**Simplification on 26 October:** the main view contains the map, searchable species/checklist/location results, and four icon counts: species, checklists, observations, and locations. Reuse the exact species/checklist/observation SVG symbols from the old app. Remove regions, the design banner, the world-view reset, the current-map-area box, and the visible theme/projection/background controls. Filters are collapsed by default. A Settings modal contains appearance, globe/flat projection, four map backgrounds (Simple, Streets, Outdoors, Satellite), and result-display preferences. Display choices persist locally; observation persistence is still future implementation work.

## Product direction

Make the map the main way to explore your own eBird observations: rotate the globe, find a bird, revisit a place, filter a period, and inspect any selected area. Keep checklist entry, checklist editing, identification advice, public sightings, alerts, leaderboards, life-list management, and species reference pages in eBird. Link back to the original eBird checklists for those tasks.

The strongest starting point is **a local-first Vue app with Mapbox GL JS, a background import worker, IndexedDB storage, and optional Google Drive backup/restore**. There is no clear need for a new framework, a user database, or a server that stores observations at this stage.

## Light and dark styling

Open `/myebirdmap/design/` on the local Vite server. The Settings modal switches between light and dark variants of the same map workspace. The agreed styling uses an eBird-inspired green/grey identity and the original app’s exact blue palette: `#385b75` and `#b4cfdf`. The eBird page could not be inspected directly because it blocks automated access; the green is an inspired choice, not a verified official brand token.

| Direction | Visual treatment                                                                                         | Best use                                             |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Light     | White/light-grey panels, green controls and Bird lettering, blue map points, the original blue count bar | Everyday exploration, legible lists, inspecting data |
| Dark      | Blue-grey panels, green controls and Bird lettering, pale-blue map points and counts                     | The same workflow with lower screen brightness       |

Desktop uses a compact search and results sidebar, a large globe, and a statistics dock. The map viewport drives the results once zoomed into an area; a drawn polygon provides an explicit selection. Mobile gives the globe the main screen and puts search and results in a bottom sheet. The mobile design is a real responsive layout, not a scaled desktop screenshot.

Working interactions include bird/place search, optional year/country filters, aggregated species and checklist lists for the current area, location zoom, cluster zoom, eBird checklist links, satellite styling, globe/flat projection, and a drawn area. Pan and zoom automatically refresh the current-area list without removing off-screen observations from the map source. Choose “Count over polygon”, add at least three corners, then choose “Finish” or double-click to apply it. Drag corners to adjust the shape, including after finishing. Undo restores the last corner addition or move; Escape restores the previous area. The bin deletes the polygon and keeps the other filters. Counts update while editing a valid shape, throttled during dragging; a refresh taking over 80 ms switches subsequent dragging to updates on release. Invalid shapes retain the last valid counts with an explanation. Counts use checklist locations inside or on the polygon, before clustering; panning keeps the applied area. Count rules are available in Settings.

The footer is a metric selector: Species, Checklists, Observations, or Locations. Its active button has a light background and green underline, without an extra status label; marker numbers and sizes follow that metric. The map toolbar has a single Group by menu: None, Nearby locations, Country, Region, or Polygon. It replaces the grouping checkbox and the separate polygon-start control in the default view. Display choices are saved; drawn geometry remains session-only. Automatic clustering uses [Mapbox’s Supercluster](https://github.com/mapbox/supercluster) with exact unions of species and checklist IDs, so shared species/checklists are not counted twice. Administrative groups show their entire filtered group; footer totals still describe the current map area. Polygon checks include concave areas, boundaries, crossed edges, zero-area shapes, and longitude unwrapping across the antimeridian. Polar and very large spherical polygons still need geographic handling before release.

## What the full export tells us

Initial review snapshot (historical; see the 26 October update below): the supplied `MyEBirdData.csv`, read without modification. Size: **101,716,013 bytes** (101.7 MB decimal / 97.0 MiB). The generated local profile records its SHA-256 fingerprint.

| Property                                          |                    Result |
| ------------------------------------------------- | ------------------------: |
| Observation rows, including zero counts           |                   175,380 |
| All checklist IDs                                 |                    10,567 |
| All location IDs                                  |                     6,427 |
| Checklists with positive or presence-only records |                    10,486 |
| Locations with positive or presence-only records  |                     6,363 |
| Original taxon identifications                    |                     2,636 |
| Resolved species using eBird taxonomy v2025       |                     2,171 |
| Observations recorded as X, abundance unknown     |                    22,004 |
| Zero-count rows                                   |                     1,056 |
| Date range                                        | 1 May 2002–4 January 2026 |

There are 45 known country/territory codes plus the unknown-region code `XX`. “Countries” is therefore an imprecise label; the study labels this summary “regions” and excludes `XX` from that total.

The original taxonomy snapshot contains 17,415 taxa and has no release metadata. Matching the export against it left 602 rows across 22 scientific names unresolved. The eBird API reports **2025** as its latest release at the time of this review; that version contains 17,891 taxa and resolves every scientific name in this export. The current-taxonomy category counts are:

| Original identification category |    Rows |
| -------------------------------- | ------: |
| Species                          | 169,887 |
| Identifiable subspecific forms   |   1,590 |
| Domestic                         |   1,496 |
| Spuh                             |   1,416 |
| Slash                            |     806 |
| Hybrid                           |      92 |
| Form                             |      91 |
| Intergrade                       |       2 |

**The initial 2,171 total excluded all domestic types and is superseded by the corrected rules below; it was never a verified eBird life-list total.** This CSV has no exotic-status column. eBird counts native, naturalized, and provisional records, while excluding escapees. Taxonomy does not provide an observation’s exotic status, which can vary by place. A fresh export and a comparison with the user’s eBird total are useful validation inputs; if status is still absent, retain the qualification rather than guessing it. An optional eBird life-list reference export may support reconciliation, but a global list alone cannot establish status for every record or selected area. See [eBird’s exotic-species rules](https://support.ebird.org/en/support/solutions/articles/48001218430-exotic-and-introduced-species-in-ebird).

The deterministic small sample currently contains **170 complete checklists, 158 locations, and 4,374 raw rows**. It selects the first checklist in each country/year stratum and additional checklists for category/count/status edge cases. It is a functional test sample, not a statistically representative sample of birding activity. In the UI its filtered totals describe the sample, not the full export. The sample and full profile are ignored by Git.

There are 81 checklists whose exported rows all have zero counts. Keep these in checklist/place summaries, but do not turn zero counts into observations or species presence. Selecting a bird should show only checklists where that bird was present.

## Current app findings

| Finding                                                                                               | Consequence                                                                                     | Rewrite approach                                                                              |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `App.vue:377–379` reads `REPORT_AS` and `CATEGORY`, but the actual JSON has `reportAs` and `category` | Parent roll-up fails; categories default to species, allowing additional taxa to inflate totals | Read the documented fields and keep the original identification alongside its resolved parent |
| `App.vue:385` converts X into 1                                                                       | Presence-only observations become a fabricated abundance                                        | Preserve unknown abundance separately from numeric counts                                     |
| `App.vue:354` always removes the final parsed row                                                     | A file without a trailing blank line can lose a real record                                     | Parse and skip empty rows explicitly                                                          |
| `App.vue:484` assigns string length as `nb_species`                                                   | The property is not the species count                                                           | Derive counts from unique species IDs                                                         |
| `updateCount()` uses polygon bounds                                                                   | A triangular or concave selection includes points outside the drawn shape                       | Actual geographic point-in-polygon filtering                                                  |
| Parsing reads the entire file into a string and builds several object copies on the main thread       | Import can block interaction and increase peak memory                                           | Chunked worker parsing, compact records, dictionary encoding where measurements justify it    |
| Marker groups are rebuilt and bounds fitted on updates                                                | Filter changes can feel slow and reset the user’s view                                          | Keep one map instance; update source data and preserve the camera                             |
| Grouping is based on common-name strings                                                              | Translations and name changes can affect identity                                               | Taxonomy-versioned species codes, with names used for display and search                      |
| CSV text is interpolated into popup HTML                                                              | Observation text is treated as markup                                                           | Use DOM text nodes or escaped content                                                         |

The existing default privacy model—processing the CSV in the browser—is worth retaining. In the rewrite, a suitable public Mapbox token belongs in deployment configuration, restricted to approved origins; the private eBird API token belongs only in the reference-data build process.

## Taxonomy and language handling

Store both the original identification and a resolved species ID. Pin the taxonomy release and matching rules with every imported snapshot. Retain scientific names and original common names so that future taxonomy updates can be audited and reprocessed.

Species contribute one unique ID. Subspecific forms, forms, and intergrades use their explicit `reportAs` parent when it resolves to a species. Spuhs, slashes, and hybrids remain searchable and mappable without adding guessed species. Domestic types with a species-level `reportAs` parent resolve to that species, like other infraspecific identifications; domestic groups without a unique species parent remain additional taxa. Apply exotic eligibility separately, at observation level: native, Naturalized (N), and Provisional (P) are eligible; Escapee (X) is excluded. Missing status remains unknown and is included only in the qualified taxonomy total, rather than being inferred from domestic category or a regional summary. Unknown matches remain visible with a review state; they must not silently default to species. Zero counts are retained in the source but do not imply presence. See [eBird’s taxonomy categories](https://support.ebird.org/en/support/solutions/articles/48000837816-the-ebird-taxonomy) and [the official taxonomy release downloads](https://www.birds.cornell.edu/clementschecklist/introduction/updateindex/october-2025/2025-citation-checklist-downloads/).

Use codes together with the taxonomy version, rather than assuming a species code’s meaning never changes across splits and lumps. Reprocessing an old identification cannot manufacture information lost through a split; an ambiguous identification stays ambiguous.

Recommendation: start with an English interface, English/French bird-name display and search, and scientific names as a searchable fallback. Keep interface translation separate from bird-name locale. Load language-specific reference tables on demand, keyed to the same taxonomy release and species codes. This is less work than translating every interface state immediately. No translated-name functionality is connected in the study.

## Large-file processing

The updated local Node streaming profile completed the full file in approximately **1.9 seconds** on this Mac. This is a parse-and-summary measurement, not the current app’s performance and not a mobile-browser benchmark. Peak process RSS during the complete profiling and sample-extraction workflow was approximately **413 MB**. That is a reason to measure mobile memory carefully, not evidence that the final architecture is already efficient.

The rewrite should parse chunks in a dedicated worker, discard unused comment/media columns from the working index, preserve the original file separately, and send the main thread compact map aggregates and query results. Render one point per location—6,363 here—rather than one marker per observation. Cache the normalized snapshot and indexes in IndexedDB. Keep filter queries in the worker if profiling shows main-thread delays. Exact richness and drawing queries should use the same counting rules as the headline totals.

Avoid introducing DuckDB/WASM, a server database, server-generated tiles, or a complex import-merging system until measured workloads require them. This file’s observation count is substantial, but its map point count is modest. Mapbox supports globe projection and client-side clustering; see the [globe guide](https://docs.mapbox.com/mapbox-gl-js/guides/globe/) and [large GeoJSON guidance](https://docs.mapbox.com/help/troubleshooting/working-with-large-geojson-data/).

Acceptance checks should cover the supplied full file, a small checklist-preserving sample, an empty filter result, all taxonomic categories, X/zero counts, repeated import, a file without a trailing newline, and a concave polygon. Test cold import, warm reopening, filter latency, and memory on a midrange phone. Test worker failure and interruption before claiming recovery support. Performance targets should be agreed after that device baseline; desktop timings do not establish mobile targets.

## Storage: local first, Drive optional

| Choice                                                      | Benefit                                                                 | Cost or limit                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Browser IndexedDB                                           | No account; quick repeat visits                                         | Per browser/device; users or browser storage policies can delete it      |
| Downloadable backup                                         | User-controlled file; simple recovery                                   | Manual transfer and updates                                              |
| Google Drive app-data folder, recommended optional addition | Each user owns their own cloud snapshot; no observation-hosting backend | Google OAuth setup; reauthorization; quota/network errors; hidden folder |
| A visible CSV in Drive using Picker and file-scoped access  | Users can inspect or replace the source file in Drive                   | More file selection/version behavior to explain                          |
| Hosted account database                                     | Automatic multi-device access and richer server behavior                | Hosting, account lifecycle, authorization, and operational maintenance   |

For the first release, make Drive an explicit **Back up** / **Restore** flow. Back up a compressed source CSV with a versioned manifest, source hash, export date range, and taxonomy release. Keep the processed index as a disposable local cache. On another device, connect the same Google account, restore the snapshot, and rebuild the cache. A source-derived full snapshot is simpler to verify and migrate than synchronizing database internals.

Use `drive.appdata` for the app’s private folder, or `drive.file` and Google Picker if a visible source file is preferred. The app-data scope is classed as non-sensitive and its folder is hidden from the normal Drive UI; OAuth app configuration is still required. See [Google Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata).

A static frontend can obtain short-lived Drive tokens using Google Identity Services. An expired token may require another user action; do not promise unattended background synchronization. See [Google’s token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

Treat each full export as a replacement snapshot in the initial release. Additions, edits, and deletions then arrive together without duplicate observations. Keep the previous snapshot until the new one is parsed, checked, and committed. For Drive, write an immutable new version, then update the active manifest; compare the expected prior version before publishing that pointer. Surface conflicts between devices rather than overwriting silently. A UI language or saved map view can use a separate small settings file later.

“Stored locally” should initially mean browser storage plus a downloadable backup, not a permanently linked local filesystem path. A web app on a phone cannot depend on desktop-style file access. Cached bird data also does not imply offline Mapbox basemaps; offline map behavior needs a separate, explicitly supported design.

## Google Analytics

Include GA4 in the rewrite behind explicit consent. Recommended events are import start/success/failure, processing-time bucket, use of a search/filter/drawing feature, map-style choice, and Drive connection/backup outcome. Use coarse data-size buckets if needed to evaluate performance.

Do not send search text, bird names, location names, coordinates, observation dates, comments, filenames, checklist IDs, eBird identities, or Google account information. Disable automatic site-search capture and sanitize page URLs; filters and selected observations should not become automatically tracked URL parameters or page titles. Declining consent should leave the app usable. Load no Analytics requests before consent in the proposed basic-consent implementation. See [Google’s PII guidance](https://support.google.com/analytics/answer/6366371?hl=en).

The study does not load Google Analytics. The GA4 measurement ID and desired metrics can be supplied once the production implementation is approved. Mapbox requests and web-font requests are separate from Analytics; browser-only CSV processing does not mean the interface makes no external requests.

## Naming

Agreed display name: **My eBird Map**. Repository and URL slug: `myebirdmap`. Tagline: **Your eBird observations, mapped.** Include a small note that this is an independent project, not an official eBird application. See [the URL migration record](url-migration.md) for the repository rename and old-site redirect.

## Decisions that will make implementation faster

1. Agreed: prioritize map-area exploration and aggregated species/checklists; keep light/dark variants of the same interface.
2. Agreed: local storage and optional manual Drive backup/restore. Defer live sync and user-hosted observation databases.
3. Recommended: complete-export replacement as the update mechanism. Defer partial imports and automatic merges.
4. Agreed: English UI plus English/French bird-name search; add complete UI translation only if needed.
5. Keep counts explicit about missing exotic status. A reference eBird life-list total would help validate the difference, but cannot replace per-record status.
6. Keep the scope to the personal map: location clustering, species/checklist/observation metrics, searching, time filters, selected-area counts, and links to eBird.

Implementation can then proceed in three reviewable steps: (1) map/import/taxonomy/storage core; (2) responsive search, filters, and exact spatial counts; (3) Drive backup and consent-gated GA4. No replacement of the production app is needed until the chosen direction and core data behavior have been reviewed.

The immediate next implementation step is to replace the exploratory HTML study with Vue/TypeScript components using this simplified layout, then build the worker query layer and IndexedDB storage around the already-profiled export. Validate exact distinct-species and checklist aggregation for the viewport and drawn areas before adding English/French name tables, Drive backup/restore, and consent-based GA4. Prioritize the map/import/counting loop over additional screens or statistics.

## Verification of this study

The current application and the separate design entry both build. The focused model checks cover taxonomic roll-up, additional categories, unknown taxa, X/zero counts, known exotic statuses, combined filters, and polygon containment. An independent Python CSV pass reconciles all 175,380 source rows, all 10,567 checklist IDs, all 6,427 location IDs, and every row of each selected sample checklist. The complete CSV was also imported through the browser worker: its resolved species, checklist, and location totals matched the profile. Desktop browser checks verified search selection, map-area filtering, checklist links, and retention of off-screen map points; the responsive checks used a 390 × 844 viewport. This is browser emulation on the Mac, not a physical-phone performance test. The build still warns about the large legacy taxonomy used only by the synthetic-demo fallback; production reference-data packaging remains part of the rewrite.

## Statistics and location-popup presentation

Use the supplied eBird My Stats screenshot as the arrangement reference: left-aligned icon and number, label underneath, and a fine vertical left divider. Keep four footer metrics in a row on desktop and two columns on mobile. The active metric remains highlighted; remove the “On map” wording. Product labels use “Species” and “Observations” without “resolved” or “records”.

A location popup uses the same arrangement with Species, Checklists, and Observations only. Species links to `https://ebird.org/lifelist/{locationId}` and Checklists to `https://ebird.org/mychecklists/{locationId}`, using the clicked location’s actual ID. Remove the individual-checklist link list and the location count from this popup. Country/region aggregates and synthetic demonstration locations do not get misleading location-specific links.

## Exotic-status investigation — 26 October 2026

The blanket domestic exclusion was incorrect. [eBird’s exotic policy](https://support.ebird.org/en/support/solutions/articles/48001218430-exotic-and-introduced-species-in-ebird) treats domestic identity separately from exotic status: domestic populations can be Naturalized. Its taxonomy help page still gives a more restrictive domestic summary, so it must not be used as a substitute for observation-level eligibility. Exotic status varies with provenance, location, and reviewer decisions; a regional summary displays the highest status across its observations and cannot classify every observation in that region.

A local, read-only pilot of the checklist-detail API (`GET /v2/product/checklist/view/{submissionId}`) returned `obs[].speciesCode`, `obs[].obsId`, and `obs[].exoticCategory`. Eight sampled checklists matched all 238 exported taxon rows to their original taxon codes. Seventeen domestic rows included fourteen Escapee (X) and three Naturalized (N) observations. This confirms both the model bug and a viable source of observation-level eligibility. Pilot results and minimal caches are ignored under `output/review/`; they contain no API token and omit observation comments and observer names. Reproduce with `node --env-file=.env scripts/review-exotic.mjs`.

The supplied CSV has also been updated since the initial review: the current file has 188,407 rows, 11,736 checklists, and 7,267 locations, ending 26 October 2026. Reprofiling with domestic parent roll-up gives 2,237 species before missing-status corrections. This total cannot be compared directly to the initial 2,171 to measure the code change because the input has changed. The refreshed small sample has 4,595 rows, 182 complete checklists, and 169 locations; its 860-species taxonomy total was 858 under the previous domestic exclusion. No original CSV was modified.

Investigated enrichment approach (deferred; not part of the beta):

- Keep the default CSV import local and immediately usable, with missing-status provenance visible in Settings.
- Offer optional status enrichment using a private API token held by a local tool or a deliberately designed authenticated service; do not bundle that token with the public app.
- Fetch checklist details once and cache them with retrieval date, checklist ID, last-edited date, original taxon code, and observation ID. A full import currently spans 11,736 checklists, so enrichment must be resumable and avoid refetching unchanged cached results unnecessarily.
- Match checklist plus original taxon identity before species roll-up. Domestic and wild types on the same checklist can have different statuses. Never copy a parent species’ eligibility across all its records.
- Keep unavailable checklists, ambiguous matches, and unrecognized statuses unknown. Use the API’s absence of `exoticCategory` as native only for a successfully retrieved and matched observation. Record-level `userDoNotCount` is also present in the pilot and should be preserved and investigated before promising official-count parity.
- Apply status before computing species unions for locations, polygons, or clusters. An eligible observation elsewhere cannot make an Escapee observation countable in the selected area.
- Keep the enrichment as a versioned sidecar to the source export. API data represents status at retrieval time and can differ from the older CSV snapshot. World or regional life-list downloads can validate selected totals but cannot supply record-level status for arbitrary polygons.

The prototype now fixes domestic roll-up and distinguishes missing status (`null`) from a supplied native value (empty string). API enrichment has been demonstrated by the pilot; it is not yet wired into the import UI or applied to the entire export. Additional tests cover eligible/escapee domestic observations, parent deduplication, ambiguous domestic groups, mixed statuses within a region, and location/polygon-specific exclusion.

### Accepted beta decision: include exotics when status is unavailable

The per-checklist API approach is not scalable for routine imports and will not be connected to the beta. Keep missing-status observations, including domestic types with a species parent, in the taxonomy-based count. Explain in Settings: “Species totals include exotic birds and may include escapees that eBird excludes. This export does not provide their status, so totals may differ from your eBird life list.” If input already supplies observation-level exotic status, continue applying it. Do not infer missing status from taxonomy or regional summaries. The API pilot remains a research result, not an implementation commitment.

### Birdstat comparison

On 26 October 2026, [Birdstat](https://birdstat.com/) embeds its public [Shiny application](https://zakpohlen.shinyapps.io/birdSTAT/). The welcome notice explicitly says that, following the 2023 exotics update, it cannot reproduce eBird species totals without the correct exotic tag for each observation in the personal export. It asks users to request exotic tagging in personal downloads through eBird support. This confirms the same missing-input limitation; it does not establish Birdstat’s exact internal counting implementation. No personal data was uploaded during this review. Keep our beta’s acknowledgement in Settings rather than add a blocking introduction.

## Clustering toggle and large-location checks

Grouping can be disabled explicitly in Settings. The ungrouped view retains one WebGL point per location; it does not create one HTML marker per location, sample the data, or silently re-enable grouping. Individual points stay small at low zoom. Number labels start at zoom 8 and use collision handling, while popups retain the selected metric counts. Grouping is available but off by default; the default projection is now flat (Mercator).

Location aggregates and the Supercluster index are cached until the data or filters change. Switching grouping reuses cached aggregates where possible. Panning does not resend the static ungrouped source; automatic grouping updates its source when the integer zoom changes. Theme changes restore the layers from the cached data. Rendered GeoJSON contains the counts and popup fields but excludes species/checklist ID arrays, which remain in the counting index. The viewport bounds are computed once per results refresh, avoiding repeated globe-bound calculations for every observation.

Verification used the current 188,407-row personal export (7,267 locations) and a deterministic synthetic import with 100,000 distinct locations. Both ungrouped and automatically grouped views retained all synthetic locations. The browser created zero HTML location markers and made no source replacement on ungrouped pans or metric changes. A desktop automated stress pass of twenty small pans averaged 23.4 ms per frame (maximum 34.5 ms) after the bounds fix; these are local Mac browser measurements, not a physical-phone guarantee. `node scripts/benchmark-map.mjs` separately reproduces preprocessing checks: the local run grouped 100,000 rows in about 342 ms, prepared the rendering properties in 38 ms, and built the clustering index in 512 ms, with peak Node RSS around 370 MB. The uncompressed rendering payload was about 25.5 MB. Startup memory and source indexing still grow with dataset size; much larger collections may require compact data storage and tiled or worker-based preprocessing. There is no unlimited-size claim.

The rendering approach follows [Mapbox’s layers guidance](https://docs.mapbox.com/help/dive-deeper/markers-vs-layers/) and [large-GeoJSON guidance](https://docs.mapbox.com/help/troubleshooting/working-with-large-geojson-data/), particularly pruning unused properties and limiting symbol work at low zoom.

## Full preview, point visibility, and administrative polygons

The default display is now a flat map with ungrouped locations. A one-time display-preference migration applies these defaults to existing prototype sessions, after which explicit user preferences remain saved. Location circles are larger at low zoom, use a purple–teal–yellow sequential colour scale, and have a white edge with a dark outer outline for visibility on light, dark, and imagery backgrounds. The number labels remain zoom-dependent to avoid a wall of overlapping numbers.

The local preview now imports the complete CSV through the background worker automatically on reload. `node scripts/prepare-design.mjs /path/to/MyEBirdData.csv` copies the source to ignored `local/MyEBirdData.local.csv` and writes ignored preview metadata. The original CSV is unchanged. This is a local development setup, not browser persistence or a deployment feature. The smaller normalized sample remains available for focused regression checks. A full automatic-import browser check reconciled 2,237 species under the qualified taxonomy rule, 11,736 checklists, 187,190 positive/presence-only observation rows, and 7,267 locations. Group toggles and theme changes were checked without Mapbox validation errors. The production/design build does not include the private CSV or preview metadata.

Administrative polygons can be prebuilt once and served as shared static assets; their size depends on simplified geometry and boundary coverage, not a user’s number of observations. A suitable implementation is a small global country layer plus simplified region files loaded per country when region grouping is selected. Existing eBird country/region codes should remain the source of group membership and totals; boundary shapes are a visual join and should not reassign records by point-in-polygon.

[Native Natural Earth administrative boundaries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/) supply names and administrative codes and are [public domain](https://www.naturalearthdata.com/about/terms-of-use/). An audit pinned to repository revision `ca96624a56bd078437bca8184e78163e5039ad19` found that the 50m country file directly matches 47 of the export’s 48 known country/territory codes; Réunion requires a separate territorial mapping, while `XX` has no boundary. Exact region-code matches cover 259 of 352 exported region-code entries. The remainder includes unknown-region entries, administrative changes, and mismatched levels: eBird’s French regions versus departments, Spanish autonomous communities versus provinces, Italian regions versus provinces, and UK constituent countries versus local units. These need explicit reviewed mappings and sometimes unions of smaller shapes. Do not infer them from similar names alone. Reproduce the exact-code audit with `node scripts/review-boundaries.mjs`; source files and detailed audit results stay under ignored `output/review/`.

Recommendation: retain circle groups in the current beta prototype. A later polygon view can start with country coverage, then add reviewed regional joins, retaining circles wherever a boundary is missing or uncertain. Prepare, simplify, version, and cache the boundaries outside the user-import path. Avoid runtime OpenStreetMap/Overpass queries per group or user; prepared boundary files are a simpler scalable approach. geoBoundaries is another viable source with simplified country/ADM1 downloads and attribution requirements, but does not eliminate code and hierarchy reconciliation.

The point palette now spans purple, blue, teal, green, lime, and yellow (low to high counts), with distinct thresholds for species, checklists, observations, and locations. The wider hue/lightness range makes differences more apparent than the previous dark-blue-only scale. Number labels switch from white to dark ink on the lighter half of the palette; the white edge and dark outer outline remain.

### Country polygon implementation

Country grouping now uses a shared Natural Earth boundary asset, loaded on demand, with circle fallback. Region grouping remains circular. The shipped asset consolidates 239 source features into 237 country-code entries and is about 430 KB compressed. Country membership and totals remain determined by the CSV, not the approximate shapes. See [implementation and storage details](country-polygons.md). This supersedes the earlier recommendation to retain circles for every country.

## Date range in Settings

The left sidebar now contains search and result tabs only. Its filter section and country filter have been removed. Settings contains From and To month/year inputs, with inclusive endpoints: selecting January–December 2025 includes every date in 2025. Blank From or To bounds are open ended; “All dates” clears the range while preserving the current species or drawn area. Reversed bounds show a validation message and retain the last valid data selection. Results sorting also lives in Settings.

The shared record filter applies the date range before location aggregation, clustering, country polygon joins, lists, and footer statistics. Filter changes close an existing popup so it cannot display stale counts; reopening it shows the filtered totals. A full-export check for 2025 reconciled 560 species, 1,651 checklists, 22,795 observation rows, and 1,311 locations against a separate CSV pass. Country polygons plus fallback circles had the same checklist/observation/location totals. Checklist-list dates, invalid ranges, clearing the range, and mobile Settings layout were checked. Unit checks cover month endpoints, ranges crossing a year boundary, and one-sided bounds.

## Unified map grouping and four date dropdowns

The map’s upper-left Group by menu now contains None, Nearby locations, Country, Region, and Polygon. Grouping controls have been removed from Settings. Selecting Polygon begins the existing drawing flow; Finish, Undo, and Delete remain available there. Switching to another mode removes the polygon selection while keeping species and date filters. Deleting the polygon returns to None.

Settings uses four separate selects: From year/month and To year/month. A blank year means an unbounded endpoint and disables its month; selecting a From year defaults its month to January, while a To year defaults to December. Each month can then be changed independently. Inclusive-date filtering, reversed-range validation, and All dates are retained.

Country labels contain only the metric count, without country-code prefixes. Observation labels on map circles and country polygons use K/M notation (e.g., 1.3K or 2.5M); numerical source properties, popups, and footer totals remain exact. Compact labels are derived only when the map data changes, so metric switches still do not resend the source. Full-export browser checks covered a 2025 range, a single month, country label expressions, polygon drawing/clearing through the menu, and the four-select mobile layout with no runtime errors.

## Import and storage implementation — 26 October 2026

Your data now contains a CSV/ZIP import button, the eBird personal-export link, and Google Drive Save/Load. ZIP extraction and CSV parsing run in the import worker. Successful imports save both the source and processed records atomically to IndexedDB. Reloads prefer this local snapshot; the developer full-export preview is imported only if none is saved. Invalid imports leave the current dataset intact. Storage failure leaves the new import in memory and preserves the previous saved snapshot with an explanatory message.

Drive uses Google Identity Services and the private app-data scope. A single OAuth Web client identifies this app; each visitor signs into their own account. Firebase is unnecessary for this manual backup/restore model. Saves compress CSVs or retain ZIPs, upload in resumable chunks, and publish completed snapshots only. Load selects the latest completed backup and reimports it. Older snapshots remain retained and there is no automatic merge or background synchronization. Setup is documented in [Google Drive setup](google-drive-setup.md). A client ID has not yet been supplied, so actual Google consent and account-to-account isolation still require acceptance checks after setup.
