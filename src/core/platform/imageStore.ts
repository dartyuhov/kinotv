/** Logical files only: size includes every byte, including temporary files and metadata. */
export interface ImageFile { key: string; size: number }
export interface ImageStore {
  list(): Promise<ImageFile[]>;
  read(key: string): Promise<Blob | undefined>;
  writeTemporary(key: string, value: Blob): Promise<void>;
  /** Publish a complete record. On failure the previous committed record remains readable. */
  commit(temporary: string, key: string): Promise<void>;
  /** Independently published sidecar; never copies or rewrites the compressed payload. */
  readMetadata(key: string): Promise<Blob | undefined>;
  commitMetadata(temporary: string, key: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createBrowserImageStore(name = 'kinotv-images'): ImageStore {
  let connection: Promise<IDBDatabase> | undefined;
  function database(): Promise<IDBDatabase> {
    return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      let failed = false;
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onerror = () => { failed = true; reject(new Error('Image storage unavailable')); };
      request.onblocked = () => { failed = true; reject(new Error('Image storage blocked')); };
      request.onsuccess = () => {
        if (failed) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); connection = undefined; };
        request.result.onclose = () => { connection = undefined; };
        resolve(request.result);
      };
    }).catch((error) => { connection = undefined; throw error; });
  }
  async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    const db = await database();
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction('files', mode); }
      catch (error) {
        connection = undefined;
        if ((error as DOMException).name === 'InvalidStateError') {
          transaction(mode, operation).then(resolve, reject);
        } else reject(error);
        return;
      }
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(new Error('Image storage transaction failed'));
      try { operation(tx.objectStore('files'), (result) => { value = result; }); }
      catch { tx.abort(); }
    });
  }
  const read = (key: string): Promise<Blob | undefined> => transaction('readonly', (store, result) => {
    const request = store.get(key);
    request.onsuccess = () => result(request.result as Blob | undefined);
  });
  const commit = (temporary: string, key: string): Promise<void> => transaction('readwrite', (store) => {
    const request = store.get(temporary);
    request.onsuccess = () => {
      if (!(request.result instanceof Blob)) { request.transaction!.abort(); return; }
      store.put(request.result, key);
      store.delete(temporary);
    };
  });
  return {
    list: () => transaction('readonly', (store, result) => {
      const files: ImageFile[] = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) { result(files); return; }
        files.push({ key: String(cursor.result.key), size: cursor.result.value instanceof Blob ? cursor.result.value.size : 0 });
        cursor.result.continue();
      };
    }),
    read,
    readMetadata: (key) => read(`${key}-meta`),
    commitMetadata: (temporary, key) => commit(temporary, `${key}-meta`),
    writeTemporary: (key, value) => transaction('readwrite', (store) => { store.put(value, key); }),
    commit,
    remove: (key) => transaction('readwrite', (store) => { store.delete(key); }),
  };
}
