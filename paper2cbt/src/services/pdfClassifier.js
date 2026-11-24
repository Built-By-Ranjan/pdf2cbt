// pdfClassifier.js
// Single responsibility: decide, per page and for the document as a whole,
// whether content came from a real text layer or needs OCR — using text
// density and page metadata (not just a raw character-count heuristic).

import { PDF_TYPES } from '../utils/constants';
import { hasMeaningfulText } from './pdfService';

const MIN_CHARS_PER_SQ_INCH_POINT_AREA = 0.15; // heuristic: sparse text relative to page area implies scan/image noise, not real content

/**
 * Estimates text density for a page: extracted character count relative to
 * the page's area (in PDF points²), to catch pages where a handful of
 * stray/garbage characters were extracted from an otherwise-scanned page —
 * a case a pure length check can miss on large page sizes.
 * @param {{text:string, width:number, height:number}} page
 * @returns {number}
 */
function textDensity(page) {
  const area = (page.width || 1) * (page.height || 1);
  const charCount = (page.text || '').replace(/\s/g, '').length;
  return area > 0 ? charCount / area : 0;
}

/**
 * Classifies each page and the document overall.
 * @param {Array<{pageNumber:number, text:string, width:number, height:number, hasTextLayer?:boolean}>} pages
 * @returns {{
 *   type: string,
 *   textPages: number[],
 *   ocrPages: number[],
 *   totalPages: number
 * }}
 */
export function classifyPdf(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return { type: PDF_TYPES.IMAGE, textPages: [], ocrPages: [], totalPages: 0 };
  }

  const textPages = [];
  const ocrPages = [];

  for (const page of pages) {
    const meaningfulText = typeof page.hasTextLayer === 'boolean'
      ? page.hasTextLayer
      : hasMeaningfulText(page.text);
    const density = textDensity(page);

    if (meaningfulText && density >= MIN_CHARS_PER_SQ_INCH_POINT_AREA) {
      textPages.push(page.pageNumber);
    } else {
      ocrPages.push(page.pageNumber);
    }
  }

  let type = PDF_TYPES.MIXED;
  if (ocrPages.length === 0) type = PDF_TYPES.TEXT;
  else if (textPages.length === 0) type = PDF_TYPES.IMAGE;

  return { type, textPages, ocrPages, totalPages: pages.length };
}

/** Backward-compatible name used by earlier code/tests. */
export const classifyPDF = classifyPdf;
