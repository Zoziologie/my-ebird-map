# Google Drive setup

Each visitor signs in with their own Google account and saves to that account’s private app-data folder. The OAuth client ID identifies My eBird Map, so this setup happens once for the app. Firebase and a server holding user observations are not required.

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/), and enable **Google Drive API**.
2. Configure **Google Auth Platform** branding, audience, and data access. Add `https://www.googleapis.com/auth/drive.appdata`. During testing, add the Google accounts that will try the app as test users.
3. Create an OAuth client of type **Web application**. Add these authorized JavaScript origins: `http://127.0.0.1:5173`, `http://localhost:5173`, and `https://zoziologie.raphaelnussbaumer.com`. Origins contain no path. Google Identity Services uses its popup token flow; no server callback or client secret is needed.
4. Add `VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com` to the ignored root `.env`. Restart Vite after changing it. Supply the same variable when building the public preview.
5. Use **Save** in the header or **Load → Google Drive**. Complete Google sign-in and consent. Before public release, move the OAuth app out of testing and complete any requirements Google displays for the configured app.

The client ID is public configuration. Never put a Google client secret into browser code. Access tokens remain in memory and may require sign-in again after expiry.

## What is saved

A successful CSV/ZIP import replaces one local snapshot in IndexedDB, including the original source file and processed records for quick reopening. The old snapshot stays until a new import parses and its storage transaction succeeds. If storage is unavailable or full, the import remains available for the session with an explanation. Browser storage can be cleared or evicted; Drive is the optional portable backup.

Save to Drive writes the full source export, independent of current map/date/species filters. CSVs are gzip-compressed; ZIPs stay compressed as supplied. A small manifest records its source filename, import time, save time, format version, and taxonomy provenance. Each successful save creates a new backup. Older backups are retained; Load uses the newest completed one. Incomplete uploads are excluded from loading. Concurrent saves create independent snapshots instead of merging observations or overwriting another device’s snapshot.

Load from Drive downloads the newest completed backup and sends it through the same import worker. ZIP entry checks and gzip decoding detect damaged archives. CSV headers are checked before replacing current data. Imports replace the full dataset; they do not append or merge it. The processed cache is rebuilt using this app’s taxonomy.

The app uses resumable uploads with 8 MiB chunks and can query an interrupted upload’s accepted byte offset while the page remains open. A reload or a later click starts a new save. The private app-data folder is not visible in the normal Drive file list and belongs to the signed-in account and this OAuth app. Keep the Google Cloud project/client identity stable between app versions so users can access existing backups.

## References

- [Google Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)

## Current configuration

The public client ID is configured in the local ignored `.env` and as the `VITE_GOOGLE_CLIENT_ID` GitHub repository variable. The build workflow passes that variable to Vite. The default build now includes the rewrite; actual publication follows the Pages workflow. The selected client is **Web client 1** in the `zoziologie` project (`416141347619-3jb14l5ql9alr1jjia42llg7ai6hldtl.apps.googleusercontent.com`). Trip Planner’s Firebase project remains separate. The owner confirmed saving the prepared Google Cloud changes on 26 October 2026: the production JavaScript origin and app-data consent scope. Development origins were included in the follow-up setup instruction; actual Google sign-in and Drive access still need live verification.
