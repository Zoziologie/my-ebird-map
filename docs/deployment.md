# Deployment preparation

The Mapbox app is now the default root entry. Build output is a static site in `dist/`, configured for `https://zoziologie.raphaelnussbaumer.com/myebirdmap/`. No backend is required. Pushes to `main` trigger deployment after the build checks pass.

## GitHub Pages configuration

1. In repository **Settings → Pages**, select **GitHub Actions** as the source.
2. In **Settings → Secrets and variables → Actions → Variables**, set `VITE_MAPBOX_ACCESS_TOKEN` to a public Mapbox token with the permissions needed for map styles, fonts, and tiles. Restrict allowed URLs to the production app and the development URLs you use. This value is intentionally bundled into browser code.
3. Optionally set `VITE_GOOGLE_CLIENT_ID` to the app’s public OAuth Web client ID. Confirm the production JavaScript origin and Drive app-data scope as described in [Google Drive setup](google-drive-setup.md). Without the client ID, Drive controls remain disabled.
4. Review and commit the source changes, then push to `main`. The workflow installs from the lockfile, checks counting/map logic, builds, checks bundle contents, and deploys only the resulting `dist/` artifact. Pull requests run checks without deployment. A missing Mapbox token stops production deployment.

Never add `EBIRD_API_TOKEN`, Google client secrets, personal exports, or local research files to repository variables used by the client build. `.env` is now untracked; removing it from the current tree does not erase its earlier Git history. Review any credential previously committed before publishing the repository.

## Local production verification

```sh
npm ci
npm run check
npm run build
npm run check:build
npm run preview -- --host 127.0.0.1
```

Open `http://127.0.0.1:4173/myebirdmap/` with a new browser profile. The production bundle contains a synthetic demo, the pinned Mapbox CDN runtime, local fonts/icons, the import worker, the bundled taxonomy snapshot, and lazily loaded country boundaries. Browser observation data is stored locally, so use a separate profile to avoid overwriting an existing import while checking. Mapbox and Google integrations require network access; offline basemaps are not supported.

## Before public release

- Confirm the map loads at the production URL with the URL-restricted token, including styles, fonts, and tiles.
- Confirm new visitors see the synthetic-demo notice and no private observations.
- Import a CSV and eBird ZIP; compare species/checklist/location totals, reload to verify persistence, and check worker/taxonomy requests for errors.
- Check metric switching, search, year/season filters, clustering, country boundaries, region grouping, and polygon edit/undo/delete.
- Check mobile results and Settings at phone width, and import responsiveness on a physical phone.
- Complete Google sign-in, Save, and Load with a real account if Drive is enabled. The existing integration has not yet passed this acceptance check.
- Verify the old URL redirect, tag the tested commit `v2.0.0` for this release.

## Rollback

The legacy source is preserved at `e8eb9587fe19462776266eecfae59eff9ac431d6`. To restore a deployment, revert the promotion commit on `main` and let Pages rebuild. Keep the same domain, path, and OAuth client identity so browser storage and Drive backups remain associated with the app. The rewrite does not migrate the legacy app’s browser data; visitors can reimport their original export.
