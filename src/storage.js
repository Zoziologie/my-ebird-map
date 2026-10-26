// One transaction replaces the complete dataset only after an import succeeds.
let database;
function openDatabase() {
  database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('myebirdmap', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshot');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function saveSnapshot(records, source, metadata) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshot', 'readwrite');
    const store = transaction.objectStore('snapshot');
    store.put(records, 'records');
    store.put(source, 'source');
    store.put(metadata, 'metadata');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadSnapshot() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshot', 'readonly');
    const store = transaction.objectStore('snapshot');
    const records = store.get('records'),
      source = store.get('source'),
      metadata = store.get('metadata');
    transaction.oncomplete = () =>
      resolve(metadata.result ? { records: records.result, source: source.result, metadata: metadata.result } : null);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveSnapshotMetadata(metadata) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshot', 'readwrite');
    transaction.objectStore('snapshot').put(metadata, 'metadata');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}
