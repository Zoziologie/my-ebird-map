# Releases

The main package is `2.0.0`, and `npm run build` produces the Mapbox rewrite. The separate design entry and Vue/Leaflet sources have been removed from the working app. [Version 2.0.0 release notes](v2.0.0.md) describe the shipped scope, validation, and known limitations.

The legacy `1.1.0` source remains at commit `e8eb9587fe19462776266eecfae59eff9ac431d6`; [legacy release notes](v1.1.0.md) describe that snapshot. A legacy `v1.1.0` tag, if published, must target that explicit commit rather than the rewrite.

The `v2.0.0` tag identifies the tested rewrite commit. Pushes to `main` trigger the checked [Pages deployment](../deployment.md).
