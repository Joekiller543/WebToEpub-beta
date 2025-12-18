import { openDB } from 'idb';

const DB_NAME = 'WebToEpubDB';
const STORE_NAME = 'chapters';

// Initialize IndexedDB
export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    },
  });
};

export const saveChapter = async (chapterData) => {
  const db = await initDB();
  await db.put(STORE_NAME, chapterData);
};

export const getChapter = async (url) => {
  const db = await initDB();
  return db.get(STORE_NAME, url);
};

export const getAllChaptersContent = async (urls) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  const results = await Promise.all(urls.map(url => store.get(url)));
  return results.filter(Boolean);
};

export const clearChapters = async () => {
  const db = await initDB();
  await db.clear(STORE_NAME);
};
