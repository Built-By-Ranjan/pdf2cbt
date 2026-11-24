// boundaryDetector.js
// Phase A: Detects question boundary boxes (page, x, y, width, height)
// from the coordinate-aware line objects produced by pdfService.
//
// For text-layer pages: uses the {text, x, y, column} lines from pdfService.
// For OCR pages: uses Tesseract TSV word-level bounding boxes (kept in
// page.ocrWords) so column order and coordinates are preserved.
//
// Column detection: clusters lines by their left-x using COLUMN_GAP_RATIO,
// then processes each column independently (top-to-bottom). A new question
// starts at every QUESTION_START line; its region ends at the line just before
// the next question (or the bottom of the column).
//
// Output: Array of QuestionBoundary objects, one per detected question-start
// position in the document. These are attached to the question objects in
// parserService after the text pipeline runs.

import { matchQuestionStart } from '../utils/regexPatterns';
import { COLUMN_GAP_RATIO } from '../utils/constants';

/**
 * @typedef {Object} QuestionBoundary
 * @property {number} pageNumber
 * @property {number} startY   top of this question's region (PDF pts, top-down)
 * @property {number} endY     bottom of this question's region
 * @property {number} startX
 * @property {number} endX
 * @property {number} questionNumber  as parsed from the marker
 * @property {number} column
 */

const LINE_HEIGHT_EST = 14; // pts, conservative fallback for line height

/**
 * Converts PDF bottom-up y to top-down y for a given page height.
 * pdfService already returns lines in top-down order (sorted by descending
 * pdf-y) but stores the raw pdf-y value. Convert once here.
 */
function toTopDown(pdfY, pageHeight) {
  return pageHeight - pdfY;
}

/**
 * Detects question boundaries for one page's lines.
 * @param {Array<{text:string, x:number, y:number, column:number}>} lines
 * @param {number} pageNumber
 * @param {number} pageWidth
 * @param {number} pageHeight
 * @returns {QuestionBoundary[]}
 */
export function detectBoundariesOnPage(lines, pageNumber, pageWidth, pageHeight) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  // Build column groups: sort anchors and group by COLUMN_GAP_RATIO
  const colAnchorMap = new Map(); // column index -> min x seen
  for (const line of lines) {
    const col = line.column ?? 0;
    if (!colAnchorMap.has(col) || line.x < colAnchorMap.get(col)) {
      colAnchorMap.set(col, line.x);
    }
  }

  // Right edge of each column is the left edge of the next column minus gap, 
  // or the page right edge for the last column.
  const sortedCols = [...colAnchorMap.entries()].sort((a, b) => a[1] - b[1]);
  const colRights = new Map();
  for (let i = 0; i < sortedCols.length; i++) {
    const [col] = sortedCols[i];
    const nextLeft = sortedCols[i + 1]?.[1] ?? pageWidth;
    colRights.set(col, nextLeft - 2); // small inset so gaps aren't included
  }

  const boundaries = [];

  // Group lines by column, then find question starts within each column
  const linesByCol = new Map();
  for (const line of lines) {
    const col = line.column ?? 0;
    if (!linesByCol.has(col)) linesByCol.set(col, []);
    linesByCol.get(col).push(line);
  }

  for (const [col, colLines] of linesByCol) {
    // colLines are already in top-down order (pdfService sorted by descending y)
    // but we convert coords: pdfY -> topDown
    const enriched = colLines.map((l) => ({
      ...l,
      topY: toTopDown(l.y, pageHeight),
    }));

    // Find question-start positions within this column
    const qStarts = [];
    for (const line of enriched) {
      const match = matchQuestionStart(line.text);
      if (match) {
        qStarts.push({ line, number: match.number });
      }
    }

    if (qStarts.length === 0) continue;

    const isSingleColumn = linesByCol.size === 1;
    const colLeft = isSingleColumn ? 0 : (colAnchorMap.get(col) ?? (col === 0 ? 0 : pageWidth * 0.5));
    const colRight = isSingleColumn ? pageWidth : (colRights.get(col) ?? pageWidth);

    for (let i = 0; i < qStarts.length; i++) {
      const startLine = qStarts[i].line;
      const endLine = i + 1 < qStarts.length ? qStarts[i + 1].line : null;

      const startY = Math.max(0, startLine.topY - 12);
      let endY;
      if (endLine) {
        endY = Math.max(startY + 20, endLine.topY - 8);
      } else {
        // Extend to the bottom of the last line in the column plus margin
        const lastLine = enriched[enriched.length - 1];
        endY = Math.min(pageHeight, lastLine.topY + 25);
      }

      boundaries.push({
        pageNumber,
        startY,
        endY,
        startX: Math.max(0, colLeft),
        endX: Math.min(pageWidth, colRight),
        questionNumber: qStarts[i].number,
        column: col,
      });
    }
  }

  return boundaries;
}

/**
 * Detects boundaries across all pages of a document.
 * @param {Array<{pageNumber:number, lines:Array, width:number, height:number}>} pages
 * @returns {QuestionBoundary[]}
 */
export function detectAllBoundaries(pages) {
  const all = [];
  for (const page of pages) {
    if (!Array.isArray(page.lines) || page.lines.length === 0) continue;
    const bounds = detectBoundariesOnPage(
      page.lines,
      page.pageNumber,
      page.width,
      page.height
    );
    all.push(...bounds);
  }
  return all;
}

/**
 * Given the flat list of question boundaries (across all pages), assigns
 * endY / endPage for each question by using the NEXT question's start
 * as the boundary — including across page breaks (a question can span
 * the bottom of page N and the top of page N+1, in which case we crop
 * two strips and stitch them).
 *
 * Returns an enriched boundary array sorted by (page, column, startY).
 * @param {QuestionBoundary[]} boundaries
 * @param {Array<{pageNumber:number, height:number}>} pages
 * @returns {QuestionBoundary[]}
 */
export function assignEndBoundaries(boundaries, pages) {
  if (boundaries.length === 0) return [];

  // Sort: page → column → startY
  const sorted = [...boundaries].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.column !== b.column) return a.column - b.column;
    return a.startY - b.startY;
  });

  const pageHeights = new Map(pages.map((p) => [p.pageNumber, p.height]));

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (next && next.pageNumber === cur.pageNumber && next.column === cur.column) {
      cur.endY = next.startY;
    } else {
      // Last question in this column/page: extend to page bottom
      cur.endY = pageHeights.get(cur.pageNumber) ?? cur.endY;
    }
  }

  return sorted;
}

/**
 * Finds the boundary for a specific question number.
 * Returns null if not found.
 * @param {QuestionBoundary[]} boundaries
 * @param {number} questionNumber
 * @returns {QuestionBoundary|null}
 */
export function findBoundaryForQuestion(boundaries, questionNumber) {
  return boundaries.find((b) => b.questionNumber === questionNumber) ?? null;
}

/**
 * Builds a map from question number to boundary for fast lookup.
 * @param {QuestionBoundary[]} boundaries
 * @returns {Map<number, QuestionBoundary>}
 */
export function buildBoundaryMap(boundaries) {
  const map = new Map();
  for (const b of boundaries) {
    if (!map.has(b.questionNumber)) {
      map.set(b.questionNumber, b);
    }
  }
  return map;
}
