import type { PanoramaSource } from "../src";

/** The demo keeps uploaded photos in IndexedDB, so a tour survives a reload. Nothing leaves the browser. */

const DB = "pano-grid-tour-demo";
const STORE = "photos";

interface StoredPhoto {
  id: string;
  name: string;
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function toSource(photo: StoredPhoto): PanoramaSource {
  const url = URL.createObjectURL(photo.blob);
  return { id: photo.id, url, thumbnailUrl: url, label: photo.name };
}

export async function loadUploads(): Promise<PanoramaSource[]> {
  try {
    const photos = await run<StoredPhoto[]>("readonly", (store) => store.getAll() as IDBRequest<StoredPhoto[]>);
    return photos.map(toSource);
  } catch {
    return [];
  }
}

export async function addUploads(files: FileList): Promise<PanoramaSource[]> {
  const added: PanoramaSource[] = [];
  for (const file of Array.from(files)) {
    const photo: StoredPhoto = { id: `upload-${Date.now().toString(36)}-${added.length}`, name: file.name, blob: file };
    try {
      await run("readwrite", (store) => store.put(photo));
    } catch {
      // Private mode: keep it for this session only.
    }
    added.push(toSource(photo));
  }
  return added;
}

export async function clearUploads(): Promise<void> {
  try {
    await run("readwrite", (store) => store.clear());
  } catch {
    // nothing stored
  }
}
