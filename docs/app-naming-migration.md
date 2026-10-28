# Zoziologie app naming and URL migration

Draft audit dated 26 October 2026. Scope: apply a shared naming convention across the app family, rename repositories and deployed paths where needed, move app URLs to `https://raphaelnussbaumer.com/<app-slug>/`, and preserve old entry URLs. Recommendation: lowercase names with hyphens for repositories and URL paths. This recommendation and the hosting design have not yet been approved for production cutover. No repository renames or deployment changes have been performed.

## Naming decision

Keep readable display names such as **My eBird Map** regardless of the technical convention. Recommend lowercase names with hyphens for app repositories and their project URL paths. Google recommends hyphens to separate URL words and documents case-sensitive URL handling: [URL structure guidance](https://developers.google.com/search/docs/crawling-indexing/url-structure). There is no mandatory universal repository naming standard; matching the repository name to the URL slug is our consistency rule. The alternatives reviewed were:

- camelCase, retaining embedded names such as eBird and GeoJSON: `myeBirdMap`, `eBirdTripPlanner`, `checklistReview`.
- Lowercase with hyphens: `my-ebird-map`, `ebird-trip-planner`, `checklist-review`.

The following are proposed mechanical spellings, not decisions to rebrand products. Match the repository and deployed project path exactly, including case. Treat custom domains, the organization website repository, and package identifiers separately.

## Repository and deployment inventory

Current repositories and Pages configuration were read from the GitHub API. A configured Pages site does not establish that all app functions work. Paths in this table are relative to `https://zoziologie.raphaelnussbaumer.com` unless a full URL is given.

Proposed final project URLs use `https://raphaelnussbaumer.com/` followed by the hyphenated candidate and a trailing slash. The custom domain and external hosting exceptions still need a product decision.

| Current repository            | Current configured URL                                                              | Deployment                      | camelCase candidate         | Hyphenated candidate          |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- | --------------------------- | ----------------------------- |
| `myebirdmap`                  | `/myebirdmap/`                                                                      | Actions                         | `myeBirdMap`                | `my-ebird-map`                |
| `eBirdTripPlanner`            | `/eBirdTripPlanner/`                                                                | Actions                         | `eBirdTripPlanner`          | `ebird-trip-planner`          |
| `eBirdRecentObservations`     | `/eBirdRecentObservations/`                                                         | Actions                         | `eBirdRecentObservations`   | `ebird-recent-observations`   |
| `ChecklistReview`             | `/ChecklistReview/`                                                                 | Actions                         | `checklistReview`           | `checklist-review`            |
| `CountyTracker`               | `/CountyTracker/`                                                                   | `gh-pages` branch               | `countyTracker`             | `county-tracker`              |
| `ebird-hotspot-deduper`       | `/ebird-hotspot-deduper/`                                                           | Actions                         | `eBirdHotspotDeduper`       | `ebird-hotspot-deduper`       |
| `global-rare-ebird`           | `/global-rare-ebird/`                                                               | Actions                         | `globalRareeBird`           | `global-rare-ebird`           |
| `merge2hotspot`               | `/merge2hotspot/`                                                                   | Actions                         | `merge2Hotspot`             | `merge-to-hotspot`            |
| `view-geojson`                | `/view-geojson/`                                                                    | Actions                         | `viewGeoJSON`               | `view-geojson`                |
| `image-mapper`                | `/image-mapper/`                                                                    | `gh-pages` branch               | `imageMapper`               | `image-mapper`                |
| `biolovision2ebird`           | `/biolovision2ebird/`                                                               | `gh-pages` branch               | `biolovision2eBird`         | `biolovision-to-ebird`        |
| `african-bird-atlas-api`      | `/african-bird-atlas-api/`                                                          | `master` branch                 | `africanBirdAtlasAPI`       | `african-bird-atlas-api`      |
| `ornitho2ebird`               | `https://ornitho2ebird.com/`                                                        | Actions, custom domain          | `ornitho2eBird`             | `ornitho-to-ebird`            |
| `CheckeBirdChecklists`        | `https://linusblomqvist.shinyapps.io/check_ebird_checklists/` (repository homepage) | No Pages configuration returned | `checkeBirdChecklists`      | `check-ebird-checklists`      |
| `Zoziologie-Chrome-Extension` | Chrome Web Store (repository homepage)                                              | No Pages configuration returned | `zoziologieChromeExtension` | `zoziologie-chrome-extension` |

The converter names containing `2` and the awkward `globalRareeBird` candidate need an explicit product naming decision rather than an automatic case conversion. A family name such as **eBird Rare Alerts** could be considered separately. The public Shiny URL is independent of the GitHub repository name and requires access to that hosting account to change.

Supporting repositories:

- `zoziologie.github.io`: retain the required organization-site repository name. Its configured custom domain is `zoziologie.raphaelnussbaumer.com`; it is the proposed home for legacy project-path redirects.
- `geojson`: an existing redirect repository pointing to `view-geojson`. Update it to the final destination to avoid an extra redirect hop.
- `ebird2latex`: no Pages configuration returned. Decide whether to include this command-line tool in the app naming standard.
- Twelve archived repositories: inspect their public links and decide which should redirect to replacements. Archival alone does not establish that their Pages sites are offline. Do not assume their names need changing.

## Migration sequence

1. Finalize a registry of display name, repository name, canonical URL, and every old URL for each app. Check that proposed names are available and that case-only renames work as intended on GitHub and local filesystems.
2. Prepare each app change on its own branch, following its repository instructions. Update deployment base paths, repository metadata, hardcoded links, manifests, service worker scope, canonical URLs, tests, and documentation. Keep storage keys and backup identifiers stable unless an explicit data migration is required.
3. Prepare legacy redirect pages in `zoziologie.github.io` for every old project path and any known HTML entry paths. Preserve query strings, fragments, and trailing routes. Point earlier aliases directly to the final destination, including `/see-your-observations/` for My eBird Map. Update shared privacy/terms links and other app-directory links.
4. Verify routing precedence for each old path before cutover. Publish the parent-site redirects before renaming the project; the existing project site may mask the corresponding parent-site path until its old deployment is removed or remapped. Check `.nojekyll`/build output so redirect files are actually published.
5. Coordinate the repository rename, production configuration change, and deployment of the final URL. Keep previous repository names unused so GitHub repository redirects remain valid. Update Git remotes, integrations, and any external links under our control.
6. Verify the canonical app loads its assets and works, then verify old links reach it with their query strings, fragments, and supported routes intact. Test exact path capitalization, slash variants, refreshes, and installed/offline app behavior where applicable.
7. Record the final registry and deployment evidence. Migrate in small batches so a routing or hosting problem can be corrected before affecting the rest of the family.

## Main-domain hosting recommendation

Verified current configuration:

- `Rafnuss/rafnuss.github.io` serves `https://raphaelnussbaumer.com/` through an Actions deployment.
- `Zoziologie/zoziologie.github.io` serves `https://zoziologie.raphaelnussbaumer.com/` through an Actions deployment.
- The main website workflow already incorporates a separately published project: it checks out its `defile-site` branch and copies the project files into `dist/defile` before uploading the Pages artifact.
- Authoritative nameservers for `raphaelnussbaumer.com` are Cloudflare nameservers. The old Zoziologie hostname currently resolves through a CNAME to `zoziologie.github.io`. Nameservers alone do not establish the current proxy status or available account permissions.

Recommend retaining app source repositories in Zoziologie and extending the main website's existing composition pattern. Each app supplies a tested static build; the main website deployment assembles those builds under their canonical app slugs. Define how app releases trigger and supply that deployment, pin the published build revisions, and ensure a website-only redeploy retains every app. This centralizes publication, not source code. All apps must be included in the final Pages artifact; independent deployments to the same main Pages site would replace one another.

GitHub Pages automatically shares a user/organization site's domain only with project repositories owned by that same account: [GitHub custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages). Therefore changing the Zoziologie organization setting cannot simply attach its projects to the existing personal-domain site. DNS records also cannot route URL paths.

Alternative: transfer app repositories to Rafnuss, where their Pages project sites can inherit the personal site's domain. This preserves independent project deployments but changes repository ownership, so it is not required merely to change public URLs. Repository transfers do not automatically redirect Pages URLs: [GitHub transfer documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).

For redirects, prefer Cloudflare HTTP 301/308 rules on the old hostname if account access and proxy configuration permit. Use explicit old-path-to-new-path mappings where names change, with query strings retained, and retain legacy aliases. A hostname-wide rule is appropriate only once every affected path has a valid destination or an explicit exception. See [Cloudflare redirect documentation](https://developers.cloudflare.com/rules/url-forwarding/). Validate fragment-bearing links in browsers as well as HTTP responses. Static Pages redirects remain a fallback.

Moving from the Zoziologie subdomain to the main domain changes the browser origin. IndexedDB and localStorage do not automatically follow the redirect. Plan user-visible export/import, Drive restore, or a deliberately designed cross-origin migration before retiring the old app. OAuth allowed origins, token URL restrictions, service workers, and installed apps need review. Check storage-key collisions between all apps sharing the new origin.

## Redirect limits and app-specific checks

GitHub automatically redirects repository links after renaming, but does not automatically redirect Pages project URLs: [GitHub repository-renaming documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository).

The existing parent-site redirect is a static HTML redirect using JavaScript, meta refresh, and a visible fallback link. It is not an HTTP 301/308. An old root redirect does not cover arbitrary deep URLs: add known entry files or review a shared 404 fallback. Prefer HTTP redirects if suitable hosting control becomes available.

- My eBird Map: Vite currently uses `/myebirdmap/`. Preserve IndexedDB/localStorage identifiers and Google Drive application properties. Update both `/myebirdmap/` and the older `/see-your-observations/` aliases to the final destination.
- Trip Planner: Vite PWA/service worker configuration is present. Check manifest start URL, scope, cached navigation, and existing installations before moving the path.
- Hotspot Deduper: Vite supports a `VITE_BASE_PATH` override; inspect deployed configuration as well as the source default.
- ornitho2ebird: retain `ornitho2ebird.com` unless a separate domain migration is agreed. A repository rename alone need not change this canonical URL.
- External integrations: inspect actual OAuth redirect URIs, Mapbox URL restrictions, extension allowlists, and callback paths before changing them; a path change does not imply that every integration requires an update.
- Browser state: the shared-domain apps retain their origin during a path-only move. Check cookies with path restrictions and application-specific storage/service worker behavior. A domain change requires a separate state migration strategy.

## Remaining work

- [ ] Choose the naming convention and resolve product naming exceptions.
- [ ] Inspect remote deployment files and current public URLs for every app; local configuration was inspected only where a checkout was available.
- [ ] Inventory archived app entry URLs, deep links, cross-app links, and older aliases.
- [ ] Prepare app changes and the shared redirect changes.
- [ ] Validate builds and redirects before coordinated production cutover.
- [ ] Rename, deploy, verify, and record final URLs for the agreed scope.

## First-phase preparation (26 October 2026)

The agreed first phase retains `zoziologie.raphaelnussbaumer.com`. Five clean worktrees under `/Users/rafnuss/.codex/app-renames/` contain uncommitted preparation for `myebirdmap` → `my-ebird-map`, `eBirdTripPlanner` → `ebird-trip-planner`, `eBirdRecentObservations` → `ebird-recent-observations`, `ChecklistReview` → `checklist-review`, and `CountyTracker` → `county-tracker`. The `redirects` worktree contains root redirects for these old paths and updates the existing `/see-your-observations/` alias and shared policy links. The root redirect pages preserve query strings and fragments with JavaScript; they are not HTTP redirects and do not cover arbitrary deep paths. All five builds completed locally; My eBird Map's tests and build check passed. Redirect scripts were checked locally for query and fragment preservation.

These changes are preparation only: no repository was renamed and no redirect or new app path was published. The Trip Planner worktree starts at the existing `codex/release-v2.0.0-beta.1` checkout commit, not a freshly verified default branch; reconcile it with the active uncommitted work and current remote before deployment. The original Trip Planner, Recent Observations and shared-site checkouts contain unrelated uncommitted changes. Verify service worker behavior and installed-app navigation, Pages routing precedence, deep links, token restrictions, live deployment and redirects before cutover. County Tracker's workflow deploys on every push, so do not push its preparation branch before correcting or accounting for that behavior. The converter names, Shiny app, Chrome extension, archived projects and broader cross-app link inventory remain to be addressed.

## First-phase cutover (26 October 2026)

The five prepared repositories and Pages paths were renamed and deployed. `myebirdmap`, `ChecklistReview`, `eBirdRecentObservations`, `CountyTracker`, and `eBirdTripPlanner` now resolve through static parent-site redirects to `my-ebird-map`, `checklist-review`, `ebird-recent-observations`, `county-tracker`, and `ebird-trip-planner`, respectively. The older `see-your-observations` alias points directly to `my-ebird-map`. Repository homepages, parent-site policy links and the personal website's app links were updated. Each new app entry and its assets responded successfully; Recent Observations regional data was checked; browser tests confirmed the old entry URLs preserve query strings and fragments. The Trip Planner's new manifest uses the new path. A migration service worker is published at the old worker URL to unregister the previous scope and navigate open clients; its logic was checked locally, but migration of an existing installed app profile still requires a real-profile acceptance test. Redirects are static and arbitrary deep links are not covered. Future main-domain migration remains separate.
