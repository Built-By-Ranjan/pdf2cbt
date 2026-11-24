// indexedDbService.js
// Phase F: Persistent storage for parsed questions, image blobs, and
// answer keys using IndexedDB. Replaces localStorage for large data.
// localStorage is kept ONLY for small state: settings, exam responses,
// statuses, timer — the stuff that must survive a hard refresh instantly.
//
// The IDB schema has three object stores:
//   questions   – question records WITHOUT their image blobs (uses questionId as key)
//   blobs       – { id: questionId, imageBlob, solutionBlob } (separate store so
//                  questions can be queried without loading images into memory)
//   answerKey   – single record { id: 'default', entries: [[number, label], ...] }
//
// All public functions are async and return Promises. They gracefully fall
// back to no-op + console.warn if IDB is unavailable (e.g. private browsing
// on some iOS versions).

const DB_NAME = 'paper2cbt_v2';
const DB_VERSION = 1;
const STORE_QUESTIONS = 'questions';
const STORE_BLOBS = 'blobs';
const STORE_ANSWER_KEY = 'answerKey';

let _db = null;

/**
 * Opens (and if needed, creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
async function openDb() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (evt) => {
      const db = evt.target.result;
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) {
        db.createObjectStore(STORE_QUESTIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ANSWER_KEY)) {
        db.createObjectStore(STORE_ANSWER_KEY, { keyPath: 'id' });
      }
    };
    req.onsuccess = (evt) => {
      _db = evt.target.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function txStore(db, storeName, mode) {
  return db.transaction([storeName], mode).objectStore(storeName);
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Questions (without blobs)
// ---------------------------------------------------------------------------

/**
 * Saves all questions to IDB (clears old data first).
 * Strips imageBlob / solutionBlob from each record — those go to STORE_BLOBS.
 * @param {Array<object>} questions
 */
export async function saveQuestions(questions) {
  try {
    const db = await openDb();
    const store = txStore(db, STORE_QUESTIONS, 'readwrite');
    await idbRequest(store.clear());
    for (const q of questions) {
      // eslint-disable-next-line no-await-in-loop
      const { imageBlob, solutionBlob, ...rest } = q;
      await idbRequest(store.put(rest));
    }
  } catch (err) {
    console.warn('[IDB] saveQuestions failed:', err);
  }
}

/**
 * Loads all questions from IDB (without blobs).
 * @returns {Promise<Array<object>>}
 */
export async function loadQuestions() {
  try {
    const db = await openDb();
    const store = txStore(db, STORE_QUESTIONS, 'readonly');
    return await idbRequest(store.getAll());
  } catch (err) {
    console.warn('[IDB] loadQuestions failed:', err);
    return [];
  }
}

/**
 * Clears all questions from IDB.
 */
export async function clearQuestions() {
  try {
    const db = await openDb();
    await idbRequest(txStore(db, STORE_QUESTIONS, 'readwrite').clear());
  } catch (err) {
    console.warn('[IDB] clearQuestions failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Blobs
// ---------------------------------------------------------------------------

/**
 * Saves image blobs for a question.
 * @param {string} questionId
 * @param {{ imageBlob?: Blob|null, solutionBlob?: Blob|null }} blobs
 */
export async function saveBlobs(questionId, blobs) {
  if (!blobs.imageBlob && !blobs.solutionBlob) return;
  try {
    const db = await openDb();
    const store = txStore(db, STORE_BLOBS, 'readwrite');
    await idbRequest(store.put({ id: questionId, ...blobs }));
  } catch (err) {
    console.warn('[IDB] saveBlobs failed:', err);
  }
}

/**
 * Saves all blobs in a batch.
 * @param {Array<{id:string, imageBlob?:Blob, solutionBlob?:Blob}>} blobRecords
 */
export async function saveBlobsBatch(blobRecords) {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_BLOBS], 'readwrite');
    const store = tx.objectStore(STORE_BLOBS);
    for (const record of blobRecords) {
      store.put(record);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IDB] saveBlobsBatch failed:', err);
  }
}

/**
 * Loads image blobs for a question by ID.
 * @param {string} questionId
 * @returns {Promise<{imageBlob?:Blob, solutionBlob?:Blob}|null>}
 */
export async function loadBlobs(questionId) {
  try {
    const db = await openDb();
    const store = txStore(db, STORE_BLOBS, 'readonly');
    return (await idbRequest(store.get(questionId))) ?? null;
  } catch (err) {
    console.warn('[IDB] loadBlobs failed:', err);
    return null;
  }
}

/**
 * Clears all blobs from IDB.
 */
export async function clearBlobs() {
  try {
    const db = await openDb();
    await idbRequest(txStore(db, STORE_BLOBS, 'readwrite').clear());
  } catch (err) {
    console.warn('[IDB] clearBlobs failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Answer key
// ---------------------------------------------------------------------------

/**
 * Saves an answer key Map to IDB.
 * @param {Map<number, string|string[]>|null} answerKey
 */
export async function saveAnswerKey(answerKey) {
  try {
    const db = await openDb();
    const store = txStore(db, STORE_ANSWER_KEY, 'readwrite');
    const entries = answerKey ? Array.from(answerKey.entries()) : [];
    await idbRequest(store.put({ id: 'default', entries }));
  } catch (err) {
    console.warn('[IDB] saveAnswerKey failed:', err);
  }
}

/**
 * Loads the answer key from IDB.
 * @returns {Promise<Map<number, string|string[]>|null>}
 */
export async function loadAnswerKey() {
  try {
    const db = await openDb();
    const store = txStore(db, STORE_ANSWER_KEY, 'readonly');
    const record = await idbRequest(store.get('default'));
    if (!record || !record.entries || record.entries.length === 0) return null;
    return new Map(record.entries);
  } catch (err) {
    console.warn('[IDB] loadAnswerKey failed:', err);
    return null;
  }
}

/**
 * Clears all stored data (call on resetExam).
 */
export async function clearAll() {
  await Promise.all([clearQuestions(), clearBlobs()]);
  try {
    const db = await openDb();
    await idbRequest(txStore(db, STORE_ANSWER_KEY, 'readwrite').clear());
  } catch (err) {
    console.warn('[IDB] clearAll answerKey failed:', err);
  }
}
