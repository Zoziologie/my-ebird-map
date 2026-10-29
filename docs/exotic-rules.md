# Regional exotic rules

The supplied matrix can be converted into a small species-code → region-code → status lookup. Run from the repository root:

```sh
node scripts/prepare-exotics.mjs '/path/to/exotics_matrix_27_Oct_2026.xlsx' src/assets/exotic-rules.json
```

The command above updates the bundled asset. CSV input is also supported. Excel input requires Python 3 (standard library only) and reads the first worksheet using cached formula values, without executing formulas or macros. Omitting the second argument writes a research copy to `local/exotic-rules.json`. The converter preserves every taxon and rule, normalizes `WORLD` to `world`, and retains empty statuses. The output includes the original source filename and SHA-256 so that a later update is traceable. It also includes county-name mappings indexed by state/province. Sorting columns, comments and change history stay in the original source rather than the runtime lookup. Text in those fields is source data, never executable instructions.

## Findings from the supplied file

The 27 October 2026 workbook contains 15,953 rules for 1,495 taxa: 8,697 country rules, 2,900 state/province rules, 3,574 county rules and 782 world rules. Statuses are blank (4,299), `X` (5,473), `N` (4,679) and `P` (1,502). The source is 3,389,177 bytes. Including provenance and county mappings, the compact asset is 223,780 bytes, or 44,339 bytes gzipped. The converter prints exact sizes and taxonomy differences on each run. Every matrix code matches the bundled v2026 taxonomy; the [earlier taxonomy comparison](exotic-taxonomy-review.md) remains as historical context.

Compared with the previous bundled matrix, this snapshot adds 481 species/region rules, removes 14 and changes 12 statuses. The source SHA-256 is `ae444ef9cf5ae68b98e6943ecc4963b6de817eb126f062e5f5781d7bfe3df291`.

An empty status is an explicit exception to a broader rule. For example, Magpie Goose has `world: "X"` and `AU: ""`. Removing empty rows would incorrectly exclude Australian observations. This is an exotic-status matrix, not a complete native-range map: an absent rule does not establish that a bird is outside its range.

## Applying the lookup during loading

The import worker fetches the asset once and compiles it with `exoticRulesIndex`. Normalization retains `county` from the export, resolves `countyCode` using state/province plus county name, and calls `regionalExoticStatus` with the original taxon code. An optional `County Code` column can supply an explicit code. For example, `US-FL` plus `Broward` resolves to `US-FL-011`, where Orange-winged Amazon is `P`; Palm Beach resolves to `US-FL-099`, where it is `X`. The resolver uses county → state/province → country → world, retaining blank overrides. Absent matrix rules default to native (an empty status). County-dependent cases that cannot be resolved still return `null` with `needsCounty`.

Compile time and memory grow with the number of rules. Resolution uses a bounded number of indexed lookups per observation; there is no scan of the raw matrix per row and no checklist API request. A cache per taxon/region pair could reduce repeated work but is unnecessary for this table size.

Normalization resolves the original taxon before taxonomic roll-up; domestic forms and parent species can have different rules. Any explicitly supplied observation-level `Exotic Code`, including blank values, takes priority. The regional matrix supplies status only when that field is absent. Records retain `exoticSource`, `exoticRegion` and `exoticNeedsCounty`; dataset metadata retains the rules source/hash. In the app's current counting policy, `X` is excluded from species totals and blank/`N`/`P` remain eligible. Missing exotic codes are classified as native; only unresolved county-dependent cases remain separate and retain the existing inclusion policy. Observations remain available with Include additional taxa enabled. Distinct species are computed after applying eligibility: a species with both escapee and eligible observations counts once. This holds for country/region grouping and map clusters, using the records within the current date and area filters.

## Display and limitations

The species list shows one [status summary symbol](exotic-icons.md), using predefined equal-sector circles for every combination of known categories. Hovering or focusing the status circle only opens a styled card showing only categories with observations, with colored dots and bold counts. County-resolution metadata is omitted from the display. Taxonomy category labels and scientific-name subtext are omitted from the compact rows; scientific names remain searchable. Escapee-only rows are muted and unnumbered; species with at least one eligible observation remain numbered. Turning off Include additional taxa hides escapee observations. The map's species metric excludes escapees; observation totals include them while additional taxa are enabled.

The matrix provides 1,211 usable state/county-name mappings, with no `#N/A` county-name placeholders. Missing or unmatched county names leave status unresolved where a county exception could change the broader rule, without showing county-resolution details in the list. Resolving such cases requires an explicit county code or an improved crosswalk. The `needsCounty` flag is also used if a country-only record lacks necessary state/province information.

Existing IndexedDB snapshots are unchanged until the user re-imports the CSV/ZIP; updating the asset alone does not refresh stored records. Regional defaults cannot reproduce individual checklist overrides or historical status changes from this snapshot alone.

The workbook filename identifies the snapshot as 27 October 2026 and is recorded verbatim. It is a regional-status snapshot, not a historical series of checklist decisions.
