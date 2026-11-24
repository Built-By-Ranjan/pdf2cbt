// pdfService.js
// Single responsibility: load a PDF and produce per-page structured content —
// either an embedded text layer (preserving line/paragraph/column structure
// via glyph coordinates) or a rendered image for OCR fallback — plus page
// metadata. Never decides parsing strategy itself; that's pdfClassifier's job.

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { LARGE_DOCUMENT_PAGE_THRESHOLD, OCR_RENDER_SCALE, COLUMN_GAP_RATIO } from '../utils/constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * @typedef {Object} PageResult
 * @property {number} pageNumber
 * @property {number} width
 * @property {number} height
 * @property {number} rotation
 * @property {string} text          Line-structured text (columns already reordered reading-order)
 * @property {boolean} hasTextLayer Whether this page had a usable embedded text layer
 * @property {Array<{text:string, x:number, y:number, column:number}>} lines Coordinate-tagged lines
 */

/**
 * Loads a PDF file (File/Blob) into a pdfjs document proxy.
 * @param {File|Blob} file
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export async function loadPdfDocument(file) {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Keep memory bounded on huge scanned documents — we don't need the
      // native ImageDecoder path here since scanned pages go through canvas.
      disableAutoFetch: true,
      disableStream: true,
    });
    return await loadingTask.promise;
  } catch (err) {
    throw new PdfLoadError(`Unable to open PDF: ${err?.message || err}`, { cause: err });
  }
}

export class PdfLoadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PdfLoadError';
  }
}

export class PageExtractionError extends Error {
  constructor(pageNumber, message, options) {
    super(`Page ${pageNumber}: ${message}`, options);
    this.name = 'PageExtractionError';
    this.pageNumber = pageNumber;
  }
}

/**
 * Groups glyph items from pdf.js text content into reading-order lines,
 * detecting multiple text columns by clustering the left-edge (x) positions
 * of lines rather than assuming a single full-width column.
 *
 * Algorithm:
 *  1. Bucket glyph items into rows using their baseline y (small tolerance).
 *  2. For each row, note its left-most x as a candidate column anchor.
 *  3. Cluster row anchors into columns: a new column starts whenever a row's
 *     x differs from all known column anchors by more than COLUMN_GAP_RATIO
 *     of the page width.
 *  4. Emit lines in reading order: column-by-column (left to right), and
 *     top-to-bottom within each column — this is what most exam layouts need
 *     (two independent columns of questions, each read top-to-bottom).
 *
 * @param {import('pdfjs-dist').TextContent} textContent
 * @param {number} pageWidth
 * @returns {Array<{text:string, x:number, y:number, column:number}>}
 */
function groupIntoColumnAwareLines(textContent, pageWidth) {
  const items = textContent.items.filter((it) => it.str && it.str.trim().length > 0);
  if (items.length === 0) return [];

  // Step 1: bucket into rows by baseline y.
  const rows = [];
  const Y_TOLERANCE = 3;
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ str: item.str, x });
  }

  // Rows come out of pdf.js roughly in document order already, but sort
  // defensively by y descending (PDF y-axis grows upward).
  rows.sort((a, b) => b.y - a.y);

  // Step 2: Determine if this page actually has multiple parallel columns.
  // Two columns exist if multiple rows contain items in both left and right regions
  // separated by >= gapThreshold on the same baseline.
  const gapThreshold = pageWidth * COLUMN_GAP_RATIO;
  const midX = pageWidth * 0.5;

  let parallelRowsCount = 0;
  for (const row of rows) {
    const xs = row.items.map((it) => it.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (minX < midX - 30 && maxX > midX + 30) {
      const sortedXs = [...xs].sort((a, b) => a - b);
      for (let i = 0; i < sortedXs.length - 1; i++) {
        if (sortedXs[i + 1] - sortedXs[i] >= gapThreshold) {
          parallelRowsCount += 1;
          break;
        }
      }
    }
  }

  // If fewer than 5 rows have parallel column items, this is a SINGLE COLUMN page.
  // Emit rows top-to-bottom in vertical order so centered headers stay above questions.
  if (parallelRowsCount < 5) {
    const lines = [];
    for (const row of rows) {
      const text = row.items
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      const leftX = Math.min(...row.items.map((it) => it.x));
      lines.push({ text, x: leftX, y: row.y, column: 0 });
    }
    return lines;
  }

  // Multi-column page (e.g. File 4):
  // Preserve top headers before splitting into left and right columns.
  const topHeaders = [];
  const leftCol = [];
  const rightCol = [];

  let firstParallelY = -Infinity;
  for (const row of rows) {
    const xs = row.items.map((it) => it.x);
    const sortedXs = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < sortedXs.length - 1; i++) {
      if (sortedXs[i + 1] - sortedXs[i] >= gapThreshold) {
        firstParallelY = Math.max(firstParallelY, row.y);
        break;
      }
    }
  }

  for (const row of rows) {
    const leftItems = row.items.filter((it) => it.x < midX);
    const rightItems = row.items.filter((it) => it.x >= midX);

    if (row.y > firstParallelY + Y_TOLERANCE) {
      const text = row.items
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        const leftX = Math.min(...row.items.map((it) => it.x));
        topHeaders.push({ text, x: leftX, y: row.y, column: 0 });
      }
      continue;
    }

    if (leftItems.length > 0) {
      const text = leftItems
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        const leftX = Math.min(...leftItems.map((it) => it.x));
        leftCol.push({ text, x: leftX, y: row.y, column: 0 });
      }
    }

    if (rightItems.length > 0) {
      const text = rightItems
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        const leftX = Math.min(...rightItems.map((it) => it.x));
        rightCol.push({ text, x: leftX, y: row.y, column: 1 });
      }
    }
  }

  return [...topHeaders, ...leftCol, ...rightCol];
}

/**
 * Extracts structured, coordinate-aware text plus metadata for a single page.
 * Preserves line and (best-effort) paragraph/column structure instead of
 * flattening glyphs into one blob, and never throws for a single bad page —
 * it returns hasTextLayer:false so the pipeline can fall back to OCR.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNumber 1-indexed
 * @returns {Promise<PageResult>}
 */
export async function extractPage(pdfDoc, pageNumber) {
  let page;
  try {
    page = await pdfDoc.getPage(pageNumber);
  } catch (err) {
    return {
      pageNumber,
      width: 0,
      height: 0,
      rotation: 0,
      text: '',
      hasTextLayer: false,
      lines: [],
      error: `Failed to load page: ${err?.message || err}`,
    };
  }

  const viewport = page.getViewport({ scale: 1 });
  const meta = {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    rotation: page.rotate || 0,
  };

  try {
    const textContent = await page.getTextContent();
    const lines = groupIntoColumnAwareLines(textContent, viewport.width);

    // Reconstruct paragraph boundaries: a blank-ish vertical gap between
    // consecutive lines in the same column becomes a blank line in `text`.
    const textParts = [];
    let prevLine = null;
    for (const line of lines) {
      if (prevLine && prevLine.column === line.column) {
        const gap = prevLine.y - line.y;
        const lineHeightEstimate = 12; // conservative default; exact font metrics vary per PDF
        if (gap > lineHeightEstimate * 1.8) textParts.push('');
      } else if (prevLine) {
        textParts.push(''); // column boundary — start fresh paragraph
      }
      textParts.push(line.text);
      prevLine = line;
    }

    const text = textParts.join('\n');
    page.cleanup();

    return { ...meta, text, hasTextLayer: hasMeaningfulText(text), lines };
  } catch (err) {
    page.cleanup();
    return { ...meta, text: '', hasTextLayer: false, lines: [], error: `Text extraction failed: ${err?.message || err}` };
  }
}

/**
 * Renders a page to a canvas and returns a PNG data URL, for OCR fallback.
 * Automatically lowers render scale on very large documents to keep peak
 * memory bounded, and aggressively frees the canvas + pdf.js page afterward.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {number} pageNumber
 * @param {{ totalPages?: number, scale?: number }} [options]
 * @returns {Promise<string>} data URL
 */
export async function renderPageToImage(pdfDoc, pageNumber, options = {}) {
  const { totalPages = 1 } = options;
  const scale = options.scale
    ?? (totalPages > LARGE_DOCUMENT_PAGE_THRESHOLD ? OCR_RENDER_SCALE * 0.75 : OCR_RENDER_SCALE);

  let page;
  try {
    page = await pdfDoc.getPage(pageNumber);
  } catch (err) {
    throw new PageExtractionError(pageNumber, `Failed to load page for rendering: ${err?.message || err}`, { cause: err });
  }

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });

  try {
    await page.render({ canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } catch (err) {
    throw new PageExtractionError(pageNumber, `Rendering failed: ${err?.message || err}`, { cause: err });
  } finally {
    // Free memory aggressively — important for 500+ page PDFs where canvases
    // and decoded page resources otherwise accumulate across the whole run.
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

/**
 * Determines whether extracted text is "meaningful" (i.e. an actual text
 * layer, not scanner noise or a couple of stray glyphs). Looks at both
 * absolute length and the ratio of alphanumeric characters, since garbage
 * extractions are often mostly punctuation/whitespace.
 * @param {string} text
 * @returns {boolean}
 */
export function hasMeaningfulText(text) {
  if (!text) return false;
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length < 20) return false;
  const alnumMatches = stripped.match(/[\p{L}\p{N}]/gu) || [];
  const alnumRatio = alnumMatches.length / stripped.length;
  return alnumRatio >= 0.4;
}

/**
 * Extracts every page of a document, never throwing on an individual page
 * failure — a failed page is returned with hasTextLayer:false and an `error`
 * field so parserService can route it to OCR and continue.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdfDoc
 * @param {(done:number, total:number) => void} [onProgress]
 * @returns {Promise<PageResult[]>}
 */
export async function extractAllPages(pdfDoc, onProgress) {
  const total = pdfDoc.numPages;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await extractPage(pdfDoc, pageNumber);
    pages.push(page);
    if (onProgress) onProgress(pageNumber, total);
  }
  return pages;
}
