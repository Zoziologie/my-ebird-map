# Checklist GPS tracks: feasibility

Reviewed 26 October 2026. This is an investigation and proposed design; track import and extension integration are not implemented.

## Existing extension

The original extension read `.Track[data-maptrack-data]` from an open eBird checklist, paired the comma-separated numbers, and exported a GeoJSON LineString named after the checklist ID. It did not call a dedicated track API. That implementation was [removed on 6 May 2024](https://github.com/Zoziologie/Zoziologie-Chrome-Extension/commit/b26ca7964b98fa07655ec21533670aff8f01a0f9); the current script has no track exporter, although the README heading still mentions it. A restored extractor must be checked against a current authenticated checklist, including coordinate order and any changed page markup.

[eBird limits track visibility](https://support.ebird.org/en/support/solutions/articles/48000960508-ebird-mobile-tips-tricks) to checklist owners, people with whom the checklist is shared, and eBird Science researchers. An arbitrary public checklist URL is not a track access mechanism.

## Why an eBird browser login is insufficient for our website

Our app and eBird have different origins. The app cannot read an eBird tab or iframe. Cross-origin credentialed fetch requires explicit permission from the responding server; `credentials: 'include'` alone does not grant access. A read-only request to the public example checklist `https://ebird.org/checklist/S212383195`, with our deployed app origin in the Origin header, returned HTTP 200 with neither Access-Control-Allow-Origin nor Access-Control-Allow-Credentials. This was an unauthenticated header check, not a test of a user’s private track.

A `no-cors` response is opaque, and a server proxy alone does not inherit the browser’s eBird login. We have not identified a documented public authenticated track API suitable for this integration. See [credentialed CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## Feasible approaches

1. Import downloaded GeoJSON or GPX locally. Convert to a GeoJSON LineString/MultiLineString, associate it with the checklist ID, and render it as a separate Mapbox line source. This is the simplest first version and does not require our app to access eBird cookies.
2. Restore and extend the companion browser extension. The user opens their own checklist on eBird, then chooses “Send track to My eBird Map”. The content script reads the authorized page and passes track geometry plus checklist ID through an explicitly allowed extension connection. Our app receives only the requested geometry, not login credentials. The current extension does not implement this bridge. Chrome supports [messaging between approved web pages and extensions](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#external-webpage); its manifest would need appropriate allowed origins and message handling.

Recommendation: file import first, optional extension bridge later. Obtain tracks only when the user requests a checklist or explicitly imports a file; cache imported geometry and draw the selected track. Do not fetch every checklist or render every historical track at startup. Retain a file-based route for mobile users. Keep track metadata and future local/Drive storage aligned with the imported observation snapshot.
