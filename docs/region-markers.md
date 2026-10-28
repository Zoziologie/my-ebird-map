# Region circle and label stacking

Region circles now include their number and rings in one cached Mapbox icon. A region in front covers the circles and numbers behind it together. Icons sort by the selected metric, with larger values in front, using Mapbox’s [symbol sorting](https://docs.mapbox.com/style-spec/reference/layers/#layout-symbol-symbol-sort-key). The implementation is in `src/region-markers.js`; it uses a Canvas image uploaded to the existing WebGL map and creates no HTML markers.

This applies to Region circles. [Prepared region polygons](region-polygons.md) now replace circles where reviewed boundaries are available; the measurements below describe the earlier all-circle view. Nearby-location clusters, country polygons and ungrouped locations retain their existing rendering. Region membership still follows the exported state/province code. Country-only codes are excluded from this view. Circle positions remain the spherical mean of distinct observed locations, and species/checklists use exact distinct counts. Regions are not merged according to screen proximity: a merged circle would no longer represent one region.

## Local performance comparison

Measured on 28 October 2026 with the full 188,407-row export, 7,267 locations and 341 region features, using desktop Chrome 156 at 1200 × 818 CSS pixels and device pixel ratio 2. The comparison uses the same build, dataset and camera path, toggling the original circle/text layers versus the new icons. Each renderer runs three repetitions: 36 pans of 180 ms, six zooms of 250 ms and twelve metric changes. Both passes execute the same image-update work on metric changes; this is a comparison of rendering paths, not a pristine historical build. Map tiles are warm. Results are a local observation, not a statistical performance guarantee.

| Measurement                                 | Separate circles/text | Combined region icons |
| ------------------------------------------- | --------------------: | --------------------: |
| Median frame interval while moving          |                8.3 ms |                8.3 ms |
| 95th percentile frame interval while moving |                9.1 ms |                9.1 ms |
| Median pan to idle                          |              616.7 ms |              616.6 ms |
| Median zoom to idle                         |              633.4 ms |              633.0 ms |
| Median metric change to idle                |              616.6 ms |              308.5 ms |

Frame intervals use `requestAnimationFrame`, not GPU timings. Idle measurements include animation, symbol fade/placement and application refreshes; the metric result does not mean calculations became twice as fast. No meaningful movement slowdown was observed. This was not measured on a physical phone.

A separate cold image-generation check took 136.7 ms for 341 icons; rechecking cached values took 1.1 ms. The fixed 136 × 136 RGBA images add about 24.1 MiB of raw pixel data for this dataset, excluding Mapbox’s texture-atlas overhead. Images are updated in place for metric/filter changes and recreated after a map-style change. These costs scale with the number of regions, not observation rows.

## Reproduce

Start `npm run dev`, import an export in an isolated browser profile and select Region. In the browser console:

```js
const { benchmarkRegionView } = await import('/my-ebird-map/scripts/benchmark-region-browser.mjs');
await benchmarkRegionView(window.designMap, 3, 'legacy');
await benchmarkRegionView(window.designMap, 3, 'current');
```

The second call restores the combined region icons. `window.designMap` is available only in development. Each call returns timing distributions and environment details. Local raw results and before/after screenshots are under ignored `output/review/region-render/`.

Validation includes lint, formatting for the changed sources, public tests, production build/package checks and `npm run test:export`. The latter checks independent reference counts for small, representative and full exports, nine filter/polygon scenarios, every country/region group and exact cluster unions at five zoom levels. Browser checks also compare all four rendered region metrics against independently regrouping the saved records and verify view switching. Circle hit detection excludes transparent icon corners.
