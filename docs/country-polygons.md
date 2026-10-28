# Country polygons

Country grouping renders country polygons, with the existing circle representation used wherever a code has no boundary. Region grouping uses [prepared region polygons](region-polygons.md) where reviewed boundaries are available and circles elsewhere. The default ungrouped location view is unchanged.

## Storage and delivery

Ship one shared, versioned static asset with the app: `src/assets/countries-v1.json`. It covers all 252 eBird land/territory country codes; the 253rd code, High Seas (`XX`), uses one aggregate circle. It is about 1.57 MB as JSON or 468 kB gzipped. It is fetched only when country grouping is first selected, reused for the session, and built into a content-hashed asset for browser/CDN caching. It contains no personal observations and does not belong in users’ local database or Drive backups. No external boundary API is called during imports or map interactions.

The source is [Natural Earth’s public-domain](https://www.naturalearthdata.com/about/terms-of-use/) 1:50m country dataset with reviewed 1:10m territory supplements. Base coordinates retain 0.01-degree overview precision; small territories use 0.00001-degree coordinates after 1,000 m simplification that preserves each island part. Only country codes, label positions and geometry are retained. Full source metadata, mappings, sizes and the pinned upstream revision are in `src/assets/countries-source.json`. Regenerate with `node scripts/prepare-countries.mjs`; this is a developer/build-time operation, not a user import step. Territory source IDs are explicit in `scripts/country-boundary-rules.json`.

France and Norway are reconstructed without their separately coded overseas territories; Åland is included in Finland as eBird defines it. This avoids overlapping country fills for French Guiana/Réunion and France, or Svalbard and Norway. `src/assets/country-names.json` uses eBird's 253-code inventory: its custom `AC` and `CS` codes mean Ashmore and Cartier Islands and Coral Sea Islands, unlike generic ISO/Intl labels. Refresh names with `node --env-file=.env scripts/prepare-country-names.mjs` using the developer-only eBird token.

## Counts and interactions

Join the country code already present in the CSV to the boundary code. Species, checklists, observations, and locations use the existing filtered aggregation logic; boundary precision cannot change the totals. The current metric controls the polygon colour and count labels. Country mode uses thresholds suited to larger totals. Click a polygon for the same country statistics popup as the previous circle view. Switching to another grouping clears country geometry; theme changes restore it from the cached reference asset.

When a boundary is missing, keep its circle and counts. Previously missing territories, including Réunion (`RE`), now have polygons. High Seas (`XX`) is shown as one blue-ringed circle at a representative observed site. Country totals continue to aggregate all High Seas records. The display is approximate and is not used to infer administrative membership or redefine the CSV’s country codes.

## Checks

Model checks verify unique country codes, closed and noncollapsed boundary rings, preserved exact counts, and fallback to circles. Browser checks cover the full export, country popups, metric changes, lazy loading, switching grouping, and style changes. Private CSVs and preview configuration remain absent from the deployment bundle.
