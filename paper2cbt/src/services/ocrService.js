// ocrService.js
// Single responsibility: run OCR on rendered page images. Owns a small pool
// of reusable Tesseract.js workers (fixes the "recreate a worker per page"
// memory-leak pattern), preprocesses images to improve accuracy on poor
// scans, batches work to bound memory, retries failed pages, reports
// progress, and supports cancellation.

import { createWorker } from 'tesseract.js';
import {
  OCR_BATCH_SIZE,
  OCR_WORKER_POOL_SIZE,
  OCR_MAX_RETRIES,
  OCR_LANGUAGES,
} from '../utils/constants';

/**
 * A small pool of long-lived Tesseract workers, reused across every OCR call
 * in a session instead of being spun up per page. Workers are lazily created
 * per-language so switching between 'eng' and 'eng+hin' doesn't require
 * tearing down an existing pool.
 */
class OcrWorkerPool {
  constructor(size = OCR_WORKER_POOL_SIZE) {
    this.size = size;
    /** @type {Map<string, Promise<import('tesseract.js').Worker>[]>} */
    this.workersByLang = new Map();
    /** @type {Map<string, number>} round-robin cursor per language */
    this.cursor = new Map();
  }

  async _getPool(lang) {
    if (!this.workersByLang.has(lang)) {
      const workers = Array.from({ length: this.size }, () => createWorker(lang));
      this.workersByLang.set(lang, workers);
      this.cursor.set(lang, 0);
    }
    return this.workersByLang.get(lang);
  }

  /** Returns a worker for the given language using round-robin assignment. */
  async acquire(lang) {
    const pool = await this._getPool(lang);
    const idx = this.cursor.get(lang) % pool.length;
    this.cursor.set(lang, idx + 1);
    return pool[idx];
  }

  /** Terminates every worker across every language and frees the pool. */
  async terminateAll() {
    const all = [...this.workersByLang.values()].flat();
    this.workersByLang.clear();
    this.cursor.clear();
    await Promise.all(
      all.map(async (workerPromise) => {
        try {
          const worker = await workerPromise;
          await worker.terminate();
        } catch {
          // Worker may have already failed to initialize — nothing to clean up.
        }
      })
    );
  }
}

const pool = new OcrWorkerPool();

/**
 * Draws an image data URL onto an offscreen canvas, converts to grayscale,
 * and applies simple contrast stretching + binarization. This meaningfully
 * improves Tesseract accuracy on low-contrast or slightly faded scans.
 * @param {string} imageDataUrl
 * @returns {Promise<string>} preprocessed data URL
 */
async function preprocessImage(imageDataUrl) {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  // Grayscale + histogram for contrast stretching.
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[i / 4] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }

  const range = Math.max(1, max - min);
  for (let i = 0; i < gray.length; i += 1) {
    const stretched = ((gray[i] - min) / range) * 255;
    const pixelIndex = i * 4;
    data[pixelIndex] = stretched;
    data[pixelIndex + 1] = stretched;
    data[pixelIndex + 2] = stretched;
    // alpha untouched
  }

  ctx.putImageData(imageData, 0, 0);
  const result = canvas.toDataURL('image/png');

  canvas.width = 0;
  canvas.height = 0;
  return result;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

/**
 * Runs OCR on a single preprocessed image with the given language, retrying
 * transient failures up to OCR_MAX_RETRIES times.
 * @param {string} imageDataUrl
 * @param {string} lang
 * @returns {Promise<string>}
 */
function detectTwoColumnGutter(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const minX = Math.floor(width * 0.44);
  const maxX = Math.floor(width * 0.56);
  const regionWidth = maxX - minX;

  try {
    const imgData = ctx.getImageData(minX, 0, regionWidth, height).data;
    const columnDarkness = new Array(regionWidth).fill(0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < regionWidth; x += 1) {
        const idx = (y * regionWidth + x) * 4;
        const brightness = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
        if (brightness < 180) {
          columnDarkness[x] += 1;
        }
      }
    }

    let minDark = Infinity;
    let bestX = -1;
    for (let x = 0; x < regionWidth; x += 1) {
      if (columnDarkness[x] < minDark) {
        minDark = columnDarkness[x];
        bestX = minX + x;
      }
    }

    if (minDark < height * 0.015) {
      return bestX;
    }
  } catch {
    // Canvas security or memory error fallback
  }
  return null;
}

/**
 * Recognizes a single image chunk using pooled Tesseract worker.
 */
async function ocrSingleImage(imageDataUrl, lang = OCR_LANGUAGES.ENGLISH) {
  const preprocessed = await preprocessImage(imageDataUrl).catch(() => imageDataUrl);

  let lastError = null;
  for (let attempt = 0; attempt <= OCR_MAX_RETRIES; attempt += 1) {
    try {
      const worker = await pool.acquire(lang);
      const { data } = await worker.recognize(preprocessed);
      const lines = (data.lines || [])
        .map((l) => ({
          text: (l.text || '').trim(),
          bbox: l.bbox,
          confidence: l.confidence,
        }))
        .filter((l) => l.text.length > 0);

      return {
        text: data.text || '',
        lines,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`OCR failed after ${OCR_MAX_RETRIES + 1} attempts: ${lastError?.message || lastError}`);
}

/**
 * Runs OCR on a page image. Detects if the page has a two-column gutter,
 * and if so, processes left and right columns independently to prevent
 * cross-column line interleaving.
 * @param {string} imageDataUrl
 * @param {string} lang
 * @returns {Promise<{text:string, lines:Array<object>}>}
 */
export async function ocrImage(imageDataUrl, lang = OCR_LANGUAGES.ENGLISH) {
  const img = await loadImage(imageDataUrl).catch(() => null);
  if (img && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const gutterX = detectTwoColumnGutter(canvas);
    if (gutterX !== null && gutterX > 50 && gutterX < canvas.width - 50) {
      const leftCanvas = document.createElement('canvas');
      leftCanvas.width = gutterX;
      leftCanvas.height = canvas.height;
      leftCanvas.getContext('2d').drawImage(canvas, 0, 0, gutterX, canvas.height, 0, 0, gutterX, canvas.height);
      const leftUrl = leftCanvas.toDataURL('image/png');

      const rightCanvas = document.createElement('canvas');
      rightCanvas.width = canvas.width - gutterX;
      rightCanvas.height = canvas.height;
      rightCanvas.getContext('2d').drawImage(canvas, gutterX, 0, canvas.width - gutterX, canvas.height, 0, 0, canvas.width - gutterX, canvas.height);
      const rightUrl = rightCanvas.toDataURL('image/png');

      canvas.width = 0;
      canvas.height = 0;
      leftCanvas.width = 0;
      leftCanvas.height = 0;
      rightCanvas.width = 0;
      rightCanvas.height = 0;

      const [leftRes, rightRes] = await Promise.all([
        ocrSingleImage(leftUrl, lang),
        ocrSingleImage(rightUrl, lang),
      ]);

      const leftLines = leftRes.lines.map((l) => ({ ...l, column: 0 }));
      const rightLines = rightRes.lines.map((l) => ({
        ...l,
        column: 1,
        bbox: {
          ...l.bbox,
          x0: l.bbox.x0 + gutterX,
          x1: l.bbox.x1 + gutterX,
        },
      }));

      return {
        text: `${leftRes.text}\n${rightRes.text}`.trim(),
        lines: [...leftLines, ...rightLines],
      };
    }
    canvas.width = 0;
    canvas.height = 0;
  }

  return ocrSingleImage(imageDataUrl, lang);
}

/**
 * A cancellation token: pass `{ cancelled: false }` and flip it to true from
 * the caller (e.g. a "Cancel" button) to stop processing further batches.
 * In-flight page OCR calls are allowed to finish; only queued batches stop.
 * @typedef {{ cancelled: boolean }} CancelToken
 */

/**
 * Runs OCR over a list of { pageNumber, imageDataUrl } items in small
 * batches, invoking onProgress after each page and supporting mid-run
 * cancellation and per-page failure tracking (a page that exhausts retries
 * is recorded in `failed` rather than aborting the whole run).
 * @param {Array<{pageNumber:number, imageDataUrl:string}>} pageImages
 * @param {{
 *   lang?: string,
 *   onProgress?: (done:number, total:number, pageNumber:number) => void,
 *   cancelToken?: CancelToken
 * }} [options]
 * @returns {Promise<{ results: Map<number,string>, failed: number[] }>}
 */
export async function ocrPagesInBatches(pageImages, options = {}) {
  const { lang = OCR_LANGUAGES.ENGLISH, onProgress, cancelToken } = options;
  const results = new Map();
  const failed = [];
  let done = 0;

  for (let i = 0; i < pageImages.length; i += OCR_BATCH_SIZE) {
    if (cancelToken?.cancelled) break;

    const batch = pageImages.slice(i, i + OCR_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batch.map(async ({ pageNumber, imageDataUrl }) => {
        try {
          const text = await ocrImage(imageDataUrl, lang);
          results.set(pageNumber, text);
        } catch {
          failed.push(pageNumber);
        } finally {
          done += 1;
          if (onProgress) onProgress(done, pageImages.length, pageNumber);
        }
      })
    );
  }

  return { results, failed };
}

/** Terminates every pooled OCR worker and frees their memory. Call once the parse run completes. */
export async function terminateOcrWorker() {
  await pool.terminateAll();
}

export { OCR_LANGUAGES };
