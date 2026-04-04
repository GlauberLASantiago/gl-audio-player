export type StoredAudioTrack = {
  id: string;
  title: string;
  artist: string;
  file: File;
  cover: string;
  accent: string;
  createdAt: number;
};

const databaseName = 'gl-audio-player-db';
const storeName = 'uploaded-tracks';

const openDatabase = async () => {
  if (!('indexedDB' in window)) {
    return null;
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getStoredTracks = async () => {
  const database = await openDatabase();
  if (!database) {
    return [] as StoredAudioTrack[];
  }

  return new Promise<StoredAudioTrack[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => {
      const tracks = (request.result as StoredAudioTrack[]).sort((left, right) => right.createdAt - left.createdAt);
      resolve(tracks);
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const saveStoredTracks = async (tracks: StoredAudioTrack[]) => {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    tracks.forEach((track) => store.put(track));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

export const clearStoredTracks = async () => {
  const database = await openDatabase();
  if (!database) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};
