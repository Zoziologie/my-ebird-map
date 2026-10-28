// Google tokens stay in memory. Each Google account owns its private app-data backups.
export const driveClientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID || '';
let identityScript,
  token,
  expiresAt = 0;
const scope = 'https://www.googleapis.com/auth/drive.appdata';

export function prepareDrive() {
  if (!driveClientId) return Promise.resolve(false);
  identityScript ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      identityScript = null;
      script.remove();
      reject(new Error('Google sign-in could not load. Check your connection and try again.'));
    };
    document.head.append(script);
  });
  return identityScript;
}

function authorize() {
  if (token && Date.now() < expiresAt) return Promise.resolve(token);
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: driveClientId,
      scope,
      callback(response) {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(response, scope)) {
          reject(new Error('Allow access to this app’s Drive backups to continue.'));
          return;
        }
        token = response.access_token;
        expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
        resolve(token);
      },
      error_callback: () =>
        reject(new Error('Google sign-in was closed or blocked. Try again and allow the sign-in window.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function driveRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (response.status === 401) {
    token = null;
    throw new Error('Google sign-in expired. Click the Drive button to sign in again.');
  }
  if (!response.ok && response.status !== 308) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message || `Google Drive request failed (${response.status}). Try again.`);
  }
  return response;
}

async function completeBackup(response, manifest) {
  const file = await response.json();
  await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appProperties: { application: 'myebirdmap', version: '1', complete: 'true' } }),
  });
  return { ...manifest, ...file };
}

export async function saveToDrive(source, metadata, onProgress) {
  await authorize();
  onProgress('Preparing backup…');
  const zipped = source.name.toLowerCase().endsWith('.zip');
  const body = zipped ? source : await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const manifest = {
    version: 1,
    format: zipped ? 'zip' : 'csv-gzip',
    sourceName: source.name,
    importedAt: metadata.importedAt,
    savedAt: new Date().toISOString(),
    taxonomySource: metadata.taxonomySource,
    taxonomyVersion: metadata.taxonomyVersion,
    taxonomySha256: metadata.taxonomySha256,
  };
  const response = await driveRequest(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,createdTime',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(body.size),
      },
      body: JSON.stringify({
        name: `My eBird Map ${manifest.savedAt}.${zipped ? 'zip' : 'csv.gz'}`,
        parents: ['appDataFolder'],
        appProperties: { application: 'myebirdmap', version: '1' },
        description: JSON.stringify(manifest),
      }),
    },
  );
  onProgress('Starting upload to Google Drive…');
  const sessionUrl = response.headers.get('Location');
  if (!sessionUrl) throw new Error('Google Drive did not provide an upload session. Try again.');
  let start = 0,
    retries = 0;
  while (start < body.size) {
    const end = Math.min(start + 8 * 1024 * 1024, body.size);
    onProgress(`Saving to Drive… ${Math.floor((start / body.size) * 100)}%`);
    try {
      const uploaded = await driveRequest(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${body.size}` },
        body: body.slice(start, end),
      });
      if (uploaded.status !== 308) {
        onProgress('Finishing your Google Drive backup…');
        return completeBackup(uploaded, manifest);
      }
      start = Number(uploaded.headers.get('Range').split('-')[1]) + 1;
      retries = 0;
    } catch (error) {
      if (!token || ++retries > 2) throw error;
      onProgress('Connection interrupted. Reconnecting to Google Drive…');
      // Ask Drive where the interrupted upload stopped before sending more bytes.
      const status = await driveRequest(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes */${body.size}` },
        body: new Blob(),
      });
      if (status.status !== 308) {
        onProgress('Finishing your Google Drive backup…');
        return completeBackup(status, manifest);
      }
      start = status.headers.has('Range') ? Number(status.headers.get('Range').split('-')[1]) + 1 : 0;
    }
  }
}

export async function loadFromDrive(onProgress) {
  await authorize();
  onProgress('Finding your latest backup…');
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: "trashed = false and appProperties has { key='application' and value='myebirdmap' } and appProperties has { key='complete' and value='true' }",
    orderBy: 'createdTime desc',
    pageSize: '1',
    fields: 'files(id,name,description,createdTime)',
  });
  const { files } = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`)).json();
  if (!files.length)
    throw new Error('No backup in this Google account yet. Load your eBird export, then choose Save to Drive.');
  const backup = files[0],
    manifest = JSON.parse(backup.description);
  if (manifest.version !== 1 || !['zip', 'csv-gzip'].includes(manifest.format))
    throw new Error('This backup needs a newer version of My eBird Map.');
  onProgress('Downloading your backup…');
  const response = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(backup.id)}?alt=media`,
  );
  const blob =
    manifest.format === 'zip'
      ? await response.blob()
      : await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).blob();
  return {
    file: new File([blob], manifest.sourceName, { type: manifest.format === 'zip' ? 'application/zip' : 'text/csv' }),
    savedAt: manifest.savedAt,
  };
}
