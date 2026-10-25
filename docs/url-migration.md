# My eBird Map: repository and URL migration

Agreed display name: **My eBird Map**. Tagline: **Your eBird observations, mapped.**

| Item | Previous location | New location |
| --- | --- | --- |
| GitHub repository | `Zoziologie/see-your-observations` | `Zoziologie/myebirdmap` |
| Published app | `https://zoziologie.raphaelnussbaumer.com/see-your-observations/` | `https://zoziologie.raphaelnussbaumer.com/myebirdmap/` |
| Vite base path | `/see-your-observations/` | `/myebirdmap/` |

GitHub automatically redirects the old repository URL and Git operations after a repository rename, but does not redirect GitHub Pages project URLs. See [GitHub’s repository-renaming documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository).

The old app address is therefore served by `see-your-observations/index.html` in the parent website repository, `Zoziologie/zoziologie.github.io`. Its maintained source is copied here as [legacy-redirect.html](legacy-redirect.html). Publish that file on the parent website before renaming the project repository. The former project site takes precedence until the rename; afterward the parent website serves the redirect.

The redirect uses JavaScript to preserve the query string, fragment, and any trailing path. A meta refresh and visible link provide a fallback. This is a static-page redirect, not an HTTP 301/308, because GitHub Pages does not provide configurable server-side redirects. Only the former app root and its explicit `index.html` have redirect files; arbitrary deep paths require additional files or a parent-site 404 handler.

After the rename, update the local Git remote, deploy the project with its new base path, and verify both app URLs. Keep the old repository name unused so GitHub’s repository redirect remains valid. Browser storage is scoped to the origin, so the path change preserves existing browser storage on this domain; OAuth redirect URIs and any path-specific configuration must use the new URL when those integrations are implemented.

The production deployment still builds the existing app with its new name. The Mapbox rewrite remains a separate design study at this stage. Personal CSV data, local taxonomy snapshots, map configuration, and generated samples are ignored by Git and excluded from deployment.
