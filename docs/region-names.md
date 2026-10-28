# Region names

`src/assets/region-names.json` maps exact eBird subnational1 codes to their full names. Labels come from the subregion links on [eBird's country region pages](https://ebird.org/region/CH/regions), starting with the country list on the [world regions page](https://ebird.org/region/world/regions). The initial snapshot was collected on 28 October 2026.

Regenerate from the repository root with `python3 scripts/prepare-region-names.py`. Downloaded HTML is cached under ignored `output/review/region-names/`; remove that folder to refresh the source pages. The build bundles the lookup, so viewing names requires no API key or additional network requests.

The Locations table and region map popups use these names. Codes remain the grouping keys and remain searchable. An unrecognized code is displayed unchanged rather than assigned a guessed name.
