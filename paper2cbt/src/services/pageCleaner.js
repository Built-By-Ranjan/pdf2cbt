// pageCleaner.js
// Single responsibility: strip non-content noise (headers, footers, page
// numbers, candidate/roll-number fields, instructions, copyright, institute
// names, watermarks) from each page's lines while preserving questions,
// options, images, and equations. Operates per-page — pages are never
// merged into a single string, so page attribution survives into the
// tokenizer/parser stages.

import { isNoiseLine, SECTION_HEADER_PATTERN, matchQuestionStart, matchOptionMarker } from '../utils/regexPatterns';
import { isAnswerOrSolutionLine } from './inlineAnswerDetector';

const REPEATED_LINE_MIN_PAGES = 3; // a line seen on >= this many pages is likely a running header/footer
const REPEATED_LINE_MAX_LENGTH = 80; // long repeated lines are more likely real content coincidentally matching

/**
 * @param {Array<{pageNumber:number, text:string, lines?:Array<{text:string}>}>} pages
 * @returns {Map<string, number>} normalized line text -> page count seen on
 */
function buildRepeatedLineIndex(pages) {
  const counts = new Map();
  for (const page of pages) {
    const lineTexts = getLineTexts(page);
    const seenOnThisPage = new Set();
    for (const raw of lineTexts) {
      const key = raw.trim().toLowerCase();
      if (!key || key.length > REPEATED_LINE_MAX_LENGTH) continue;
      if (seenOnThisPage.has(key)) continue; // count each page once per distinct line
      seenOnThisPage.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function getLineTexts(page) {
  if (Array.isArray(page.lines) && page.lines.length > 0) {
    return page.lines.map((l) => l.text);
  }
  return (page.text || '').split('\n');
}

/**
 * Equation / image lines we must never drop even if they superficially look
 * sparse or symbol-heavy (which some naive noise filters would flag).
 */
function looksLikeEquationOrImageRef(line) {
  return /\[image\]|\bfigure\s*\d*\b|\bdiagram\b|[=∑∫√±≤≥×÷θπΔ]/i.test(line);
}

/**
 * Section headers, question starts, options, and equations must never be
 * dropped as repeated running headers/footers even if they repeat across parts.
 */
function isProtectedContentLine(line) {
  if (looksLikeEquationOrImageRef(line)) return true;
  if (SECTION_HEADER_PATTERN.test(line)) return true;
  if (matchQuestionStart(line)) return true;
  if (matchOptionMarker(line)) return true;
  if (isAnswerOrSolutionLine(line)) return true;
  return false;
}

/**
 * Cleans a single page's lines, removing boilerplate noise and lines that
 * repeat identically across many pages (running headers/footers) while
 * always preserving question/option/image/equation content.
 * @param {{pageNumber:number, text:string, lines?:Array<object>}} page
 * @param {Map<string, number>} repeatedLineIndex
 * @param {number} totalPages
 * @returns {{pageNumber:number, text:string, lines:Array<object>}}
 */
function cleanSinglePage(page, repeatedLineIndex, totalPages) {
  const hasStructuredLines = Array.isArray(page.lines) && page.lines.length > 0;
  const sourceLines = hasStructuredLines ? page.lines : (page.text || '').split('\n').map((text) => ({ text }));

  const repeatedThreshold = Math.max(REPEATED_LINE_MIN_PAGES, Math.ceil(totalPages * 0.5));

  const keptLines = sourceLines.filter((lineObj) => {
    const value = (lineObj.text || '').trim();
    if (!value) return false;
    if (isProtectedContentLine(value)) return true;

    if (isNoiseLine(value)) return false;

    const key = value.toLowerCase();
    if (key.length <= REPEATED_LINE_MAX_LENGTH) {
      const seenOnPages = repeatedLineIndex.get(key) || 0;
      if (seenOnPages >= repeatedThreshold && totalPages >= REPEATED_LINE_MIN_PAGES) {
        return false; // running header/footer repeated across most pages
      }
    }
    return true;
  });

  return {
    ...page,
    lines: keptLines,
    text: keptLines.map((l) => l.text).join('\n'),
  };
}

/**
 * Cleans every page in the document. Detects cross-page repeated lines
 * (running headers/footers/institute names/watermarks) in a first pass, then
 * strips both those and single-page boilerplate patterns in a second pass.
 * @param {Array<{pageNumber:number, text:string, lines?:Array<object>}>} pages
 * @returns {Array<{pageNumber:number, text:string, lines:Array<object>}>}
 */
export function cleanPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const repeatedLineIndex = buildRepeatedLineIndex(pages);
  return pages.map((page) => cleanSinglePage(page, repeatedLineIndex, pages.length));
}

/**
 * Convenience single-page cleaner for callers that don't have the whole
 * document (e.g. incremental/streaming use). Skips cross-page repeated-line
 * detection since there's no corpus to compare against.
 * @param {string} text
 * @returns {string}
 */
export function cleanPage(text = '') {
  return text
    .split('\n')
    .filter((line) => {
      const value = line.trim();
      if (!value) return false;
      if (looksLikeEquationOrImageRef(value)) return true;
      return !isNoiseLine(value);
    })
    .join('\n');
}
