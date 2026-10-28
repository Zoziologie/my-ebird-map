# Region polygons

Region mode now has a display polygon for every one of the 3,669 eBird subnational1 codes in the bundled inventory. Of these, 3,611 use source boundary polygons and **58 are synthetic illustrations**, explicitly distinguished in the map. Counts, filters, popups and highlighting always follow exported eBird codes; no illustration assigns observations spatially.

## Boundary polygons versus illustrations

The generated [global coverage report](region-boundary-coverage.md) lists source polygons and synthetic illustrations separately for all 200 countries with regional inventories. Complete display coverage does not mean complete administrative-boundary coverage or certified agreement with eBird.

Denmark (13 regions), Libya (34) and Qatar (9) use temporary, non-overlapping nearest-centre partitions clipped to the country's land outline. Their seed coordinates come from the centres of eBird region bounds, rather than observation locations. Jaghbub and Al Qatrun lack eBird bounds, so their named-place coordinates come from [GeoNames Jaghbub](https://www.geonames.org/88967/al-jaghbub.html) and [GeoNames Al Qatrun](https://www.geonames.org/2219739/al-qatrun.html). Distances are computed in a local longitude/latitude plane with longitude scaled by the cosine of the country's mid-latitude. Straight internal edges are synthetic. The cells partition land without overlap; they do not reproduce the historical administrative scheme and can place observations outside their assigned visual cell. The eBird bounds snapshot and seed overrides are checked in so the result is reproducible.

Perseverance (`SC-26`) and Kingman Reef (`UM-89`) display the eBird bounding rectangle itself because their land/reef outline is absent from the prepared source. These rectangles are labelled as bounding-box illustrations in the popup; they are not presented as surveyed land or reef outlines. Cargados Carajos Shoals (`MU-CC`) now uses a [CC0 Natural Earth-derived outline on Wikimedia Commons](https://commons.wikimedia.org/w/index.php?title=Data:Mauritius/Cargados_Carajos_Shoals.map&oldid=513561237).

Synthetic areas use lighter fills, amber dashed borders and a popup that explains the construction. Their asset properties include `approximate: true` and `boundaryMethod`; provenance records each seed and its source. This lets a future verified outline replace the illustration without changing aggregation or the eBird code.

Country-specific source rules merge provinces, departments or municipalities where eBird groups them differently, including France, Italy, Spain, Belgium, the UK, Ireland, Bangladesh, Indonesia, Guinea, Guinea-Bissau, Uganda and Malawi. Puerto Rico's 78 municipios use Natural Earth's admin-2 layer. Vietnam follows the [2025 province reorganization](https://baochinhphu.vn/nghi-quyet-cua-quoc-hoi-ve-sap-xep-don-vi-hanh-chinh-cap-tinh-102250612191145158.htm); North Macedonia includes the [Kičevo amalgamation](https://www.stat.gov.mk/KlasifikaciiNomenklaturi_en.aspx?id=11).

Exact code joins need review: corrections cover swapped Paktia/Paktika, Jeju/Sejong and Tanzania codes; duplicated city/province codes for Almaty and Latvian cities; and misleading Vietnamese province names. Disconnected islands use reviewed components from pinned sources. Source-matched boundaries remain approximate cartographic illustrations too, but only deliberately synthetic polygons carry the `approximate` flag.

## High Seas

Country and Region modes show one circle for all exported High Seas (`XX`) observations in the selection. Its label shows the selected metric's exact distinct total, with a blue ring and no wave prefix. It is anchored at the actual observation site nearest the spherical mean of distinct High Seas locations, keeping the representative circle off unrelated land. The popup explains that it represents the full selection, and clicking it keeps the current camera view. Location and automatic-cluster modes continue to show the normal site-level geography. Synthetic region labels also show plain counts; dashed borders and popup text retain their provenance.

## Source data and licences

Natural Earth's public-domain [1:10m administrative data](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/) remains the primary source, pinned to the same revision as country preparation. Reviewed supplements come from geoBoundaries and a small number of OpenStreetMap municipality/district relations. The browser's attribution links to `boundary-sources.html`, which credits all original contributors and licences. OpenStreetMap-derived country files retain ODbL 1.0; other source licences include CC BY 3.0 IGO, CC BY 4.0, CC0 and public domain. Country datasets remain separate.

`src/assets/regions-source.json` records source URLs, revisions or retrieval dates, SHA-256 checksums, source years, licences, simplification settings, software version, country coverage and every source feature contributing to each eBird code. `scripts/region-boundary-rules.json` holds explicit rekeys, merges, exclusions, island components and country-specific notes. Fuzzy names never approve a runtime match.

Stable geoBoundaries inputs use immutable commit URLs and checksums. Tanzania's 31-region NBS dataset was obtained from geoBoundaries' nightly distribution, so its reviewed 2019 source snapshot is checked into `scripts/data/` with its retrieval date and checksum. The four Slovenian and five Grand Cayman OSM relation outlines are also checked in as small snapshots. The Slovenian replacements separate Tišina/Cankova and Osilnica/Kostel, which were combined in the older source.

OSM discovery used a small, cached, single-threaded research lookup through Nominatim, below one request per second. Its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits heavy/systematic querying and requires attribution and caching. Nominatim is not part of the app or normal regeneration; future large source collection should use extracts or an appropriate bulk provider.

## Reproduce

Run from the repository root:

```sh
npm run prepare:regions
node scripts/prepare-countries.mjs
```

Downloads are cached under ignored `output/review/regions/`, keyed by a revision or checksum. Pinned input snapshots are used where an immutable upstream URL is unavailable. A checksum mismatch fails preparation rather than silently changing boundaries. Intermediate prepared polygons and labels are retained in the ignored review folder for diagnosis.

To audit the complete region-code/name inventory against the eBird API:

```sh
node --env-file=.env scripts/prepare-regions.mjs --verify-ebird
```

This checks all 200 countries with a subnational1 inventory, with at most six concurrent requests, and requires the developer-only `EBIRD_API_TOKEN`. An API failure or changed inventory stops the audit. All 200 inventories were verified on 28 October 2026. Refresh eBird's custom country names separately with `node --env-file=.env scripts/prepare-country-names.mjs`. No eBird or external boundary API is used at runtime.

Mapshaper is a development-only dependency for topology, unions, simplification and interior labels. Regions are dissolved from source subdivisions, exploded into polygon parts, simplified at a 1,000 m Douglas-Peucker threshold while retaining each part, then recombined. Coordinates use 0.00001-degree precision. The same topology workflow can expose incompatible overlapping source schemes; replace or correct those sources rather than hiding empty results. Source islands that were never mapped cannot be recovered by simplification. Coastlines and historical divisions remain approximate.

## Delivery and scalability

`src/assets/regions-v1/` contains one file per supported country: approximately 7.68 MB raw or 2.47 MB when each file is gzipped. The entire world is not requested at startup. Vite emits content-hashed assets; Region mode fetches only countries represented by its current observation groups and caches them for the session. Completed downloads are combined into at most one redraw per animation frame to avoid repeatedly serializing large geometry when many country requests finish together.

The existing country fill, border, label and popup layers render region polygons. The circle icon layer is restricted to the single High Seas group; ordinary regions never use circle fallbacks at any zoom. Metrics update colours and labels using the existing exact aggregation. Geometry survives style changes, remains outside observation backups, and never assigns observations by spatial containment. Loading failures show a message; ordinary regions wait for their polygons instead of showing circle fallbacks. Reload to retry a failed download. Polygon popups anchor to the observation extent when zooming so a distant click cannot move them offscreen.

## Validation

Tests cover the complete eBird inventory, unique source assignments, closed/noncollapsed rings, finite coordinates, interior labels, representative locations on multiple continents, historical unions, island groups, and duplicate city/province corrections. Mixed polygon/circle views preserve every distinct total even for records outside the approximate outline. Country tests verify the eBird territory inventory and prevent France/Réunion, France/French Guiana and Norway/Svalbard from being coloured twice. Build checks require each prepared country asset, source attribution and exclusion of mapshaper from browser code.

The earlier release was checked in a browser with all 188,407 local records and all four metrics across 341 region groups. The global release retains the same counting path; its coverage and rendering checks are recorded with the release review. A narrow viewport was checked, but no physical-phone performance measurement was made. Adding deeper county-level worldwide coverage would require a separate payload and rendering assessment.

The completed release passed lint, all 32 public tests, the production build/package checks and all private export scenarios. An additional display join check reconciled all four metrics for 341 regional polygons (including seven synthetic Danish cells), 48 country polygons and 50 High Seas sites representing 354 records. The cells were also checked to partition the full country land area without overlap. Final visual inspection of the synthetic styling and markers could not be performed because local browser use was disabled in Work settings.

A subsequent display refinement replaced the 50 High Seas site markers with one aggregate circle and removed the approximate symbols from count labels and popup headings. Historical site-level validation above describes the earlier display.
