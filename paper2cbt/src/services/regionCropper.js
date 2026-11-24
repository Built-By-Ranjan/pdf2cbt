// regionCropper.js
// Phase A: Image-first region extraction.
// Given a loaded pdfjs document and question boundary data (start y, end y,
// column, page number), renders the exact rectangular region of the page at
// scale 2 and returns a Blob (PNG). Works the same way for both text-layer
// pages (where boundaries come from word coordinates) and OCR pages (where
// boundaries come from Tesseract TSV word boxes).
//
// This is the CORE of the image-first design: every question is stored as a
// cropped image so math, diagrams, chemical structures, graphs, and circuit
// diagrams are ALWAYS rendered correctly — the text layer is only used to
// find boundaries and detect question types, never to display content.

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { CROP_RENDER_SCALE, CROP_TRIM_MARGIN } from '../utils/constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * @typedef {Object} BoundingBox
 * @property {number} x       left edge in PDF points (at scale 1)
 * @property {number} y       top edge in PDF points (PDF y-axis: 0 = bottom of page)
 * @property {number} width
 * @property {number} height
 * @property {number} pageNumber  1-indexed
 */

/**
 * @typedef {Object} QuestionRegion
 * @property {number} pageNumber
 * @property {number} startY   top of the question's first line (PDF coords, y descends from top)
 * @property {number} endY     bottom of the question's last line
 * @property {number} startX   left edge of the column
 * @property {number} endX     right edge of the column
 * @property {number} [pageHeight]
 */

/**
 * Renders a rectangular region of a PDF page to a Blob.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {QuestionRegion} region
 * @param {{ scale?: number, trimMargin?: number }} [opts]
 * @returns {Promise<Blob|null>}
 */
export async function cropRegionToBlob(pdfDoc, region, opts = {}) {
  const scale = opts.scale ?? CROP_RENDER_SCALE;
  const trimMargin = opts.trimMargin ?? CROP_TRIM_MARGIN;

  let page;
  try {
    page = await pdfDoc.getPage(region.pageNumber);
  } catch {
    return null;
  }

  const viewport = page.getViewport({ scale: 1 });
  const pageH = viewport.height;

  // PDF y-axis is bottom-up; canvas y-axis is top-down.
  // region.startY and region.endY are already in top-down (descending) coords
  // as returned by our boundary detectors — convert to canvas coords.
  const rawTop = Math.max(0, region.startY - trimMargin);
  const rawBottom = Math.min(pageH, region.endY + trimMargin);
  const rawLeft = Math.max(0, (region.startX ?? 0) - trimMargin);
  const rawRight = Math.min(viewport.width, (region.endX ?? viewport.width) + trimMargin);

  const cropWidth = Math.max(1, rawRight - rawLeft);
  const cropHeight = Math.max(1, rawBottom - rawTop);

  // Render the page at the desired scale with an offset so only our region is drawn.
  const scaledViewport = page.getViewport({
    scale,
    offsetX: -rawLeft * scale,
    offsetY: -(pageH - rawBottom) * scale,
  });

  const canvasW = Math.ceil(cropWidth * scale);
  const canvasH = Math.ceil(cropHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  try {
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
  } catch {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    return null;
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        resolve(blob);
      },
      'image/png'
    );
  });
}

/**
 * Renders a full page at the given scale and returns a Blob.
 * Used as a fallback when boundary detection fails for a page.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNumber
 * @param {number} [scale]
 * @returns {Promise<Blob|null>}
 */
export async function renderFullPageToBlob(pdfDoc, pageNumber, scale = CROP_RENDER_SCALE) {
  let page;
  try {
    page = await pdfDoc.getPage(pageNumber);
  } catch {
    return null;
  }

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    return null;
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
        resolve(blob);
      },
      'image/png'
    );
  });
}

/**
 * Converts a Blob to a data URL (for cases where we need an inline src).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Stores a Blob in a Map keyed by question ID, returning an object URL.
 * The caller is responsible for revoking URLs when done.
 * @param {string} questionId
 * @param {Blob} blob
 * @param {Map<string, string>} objectUrlCache  mutable cache passed in by the caller
 * @returns {string} object URL
 */
export function registerBlobUrl(questionId, blob, objectUrlCache) {
  const existing = objectUrlCache.get(questionId);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(questionId, url);
  return url;
}
