let database;
const maxBytes = 64 * 1024 * 1024;

function openHistory() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("labelit-print-history", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("jobs", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function historyEntries() {
  const db = await openHistory();
  return new Promise((resolve, reject) => {
    const request = db.transaction("jobs").objectStore("jobs").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.time - a.time));
    request.onerror = () => reject(request.error);
  });
}

export async function rememberJob(job) {
  const db = await openHistory();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("jobs", "readwrite");
    const store = transaction.objectStore("jobs");
    const record = { ...job, key: crypto.randomUUID(), time: Date.now() };
    store.put(record);
    const request = store.getAll();
    request.onsuccess = () => {
      let bytes = 0;
      request.result.sort((a, b) => b.time - a.time).forEach((entry, index) => {
        bytes += entry.bytes?.byteLength ?? entry.batch?.rasters.size ?? 0;
        if (index >= 20 || bytes > maxBytes) store.delete(entry.key);
      });
    };
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}
