# Country polygons

Country grouping now renders country polygons, with the existing circle representation used wherever a code has no boundary. Region grouping still uses circles. The default ungrouped location view is unchanged.

## Storage and delivery

Ship one shared, versioned static asset with the app: `src/assets/countries-v1.json`. It contains 237 country/territory code entries, combining source fragments with the same country code into one MultiPolygon. The file is about 1.47 MB as JSON or 430 KB compressed. It is fetched only when country grouping is first selected, reused for the session, and built into a content-hashed asset for browser/CDN caching. It contains no personal observations and does not belong in users’ local database or Drive backups. No external boundary API is called during imports or map interactions.

The source is [Natural Earth’s public-domain](https://www.naturalearthdata.com/about/terms-of-use/) 1:50m country dataset, already generalized for overview mapping. Coordinates are rounded to 0.01 degrees (roughly kilometre precision), and only the country code, label position, and geometry are retained. Full source metadata, license, and the pinned upstream revision are in `src/assets/countries-source.json`. Regenerate with `node scripts/prepare-countries.mjs`; this is a developer/build-time operation, not a user import step.

## Counts and interactions

Join the country code already present in the CSV to the boundary code. Species, checklists, observations, and locations use the existing filtered aggregation logic; boundary precision cannot change the totals. The current metric controls the polygon colour and count labels. Country mode uses thresholds suited to larger totals. Click a polygon for the same country statistics popup as the previous circle view. Switching to another grouping clears country geometry; theme changes restore it from the cached reference asset.

When a boundary is missing, keep its circle and counts. For the current full export, 47 country codes use polygons; Réunion (`RE`) and unknown region (`XX`) remain circles. The display is approximate and is not used to infer administrative membership or redefine the CSV’s country codes. Existing regional-code mismatches and territories can be added through reviewed future reference-data releases.

## Checks

Model checks verify unique country codes, closed and noncollapsed boundary rings, preserved exact counts, and fallback to circles. Browser checks cover the full export, country popups, metric changes, lazy loading, switching grouping, and style changes. Private CSVs and preview configuration remain absent from the deployment bundle.
