// tokenizer.js
// Single responsibility: turn cleaned, normalized per-page lines into a flat
// list of TYPED tokens (QUESTION_START, OPTION_START, TEXT, IMAGE, SECTION,
// HEADER, FOOTER, ANSWER_KEY), each carrying page/line/column position.
// This is a complete rewrite from the old "line-based only" tokenizer: it
// classifies every line up front so questionParser's state machine can
// transition on token TYPE instead of re-running regexes itself, which is
// what previously broke on wrapped questions/options, tables, and equations
// (those are now TEXT tokens that the parser appends to the current
// question/option based on state, rather than being mis-classified).

import { TOKEN_TYPES } from '../utils/constants';
import {
  matchQuestionStart,
  matchOptionMarker,
  matchAnswerKeyLine,
  ANSWER_KEY_HEADER,
  SECTION_HEADER_PATTERN,
  isNoiseLine,
} from '../utils/regexPatterns';
import { nextId } from '../utils/idGenerator';

const IMAGE_REF_PATTERN = /\[image\]|\[img\]|\bfigure\s*\d*\b|\bdiagram\b|\bग्राफ\b|\bचित्र\b/i;

/** True if a line references an embedded image/figure/diagram anywhere in its text. */
export function containsImageReference(text) {
  return IMAGE_REF_PATTERN.test(text || '');
}

/**
 * @typedef {Object} Token
 * @property {string} id
 * @property {number} page
 * @property {number} line   0-indexed line number within the page
 * @property {number} column column index (0 = leftmost) if known, else 0
 * @property {string} type   one of TOKEN_TYPES
 * @property {string} text
 */

/**
 * Classifies a single line of text into a token type. Order matters: more
 * specific/structural patterns are checked before the generic TEXT fallback.
 * Answer-key detection is checked before question-start so a line inside an
 * answer key section ("1-A", "2-C" ...) isn't mistaken for a new question.
 * @param {string} text
 * @param {boolean} insideAnswerKeySection
 * @returns {string} a TOKEN_TYPES value
 */
function classifyLine(text, insideAnswerKeySection) {
  if (ANSWER_KEY_HEADER.test(text)) return TOKEN_TYPES.ANSWER_KEY;
  if (insideAnswerKeySection && matchAnswerKeyLine(text)) return TOKEN_TYPES.ANSWER_KEY;
  if (SECTION_HEADER_PATTERN.test(text) && text.length < 60) return TOKEN_TYPES.SECTION;
  // Structural markers (question/option start) always win over a merely
  // embedded image reference — "Q3. ... [image]" is a QUESTION_START whose
  // text happens to mention an image, not a standalone IMAGE token. A line
  // is only ever classified as IMAGE when it references an image AND is not
  // itself starting a question or option (questionParser/optionParser pick
  // up the embedded reference from the token's text either way).
  if (matchQuestionStart(text)) return TOKEN_TYPES.QUESTION_START;
  if (matchOptionMarker(text)) return TOKEN_TYPES.OPTION_START;
  if (IMAGE_REF_PATTERN.test(text)) return TOKEN_TYPES.IMAGE;
  return TOKEN_TYPES.TEXT;
}

/**
 * Tokenizes a single page's lines (either plain text split on \n, or
 * structured {text, column} line objects preserving pdfService's multi-
 * column reading order) into typed tokens.
 * @param {number} pageNumber
 * @param {string|Array<{text:string, column?:number}>} pageContent
 * @returns {Token[]}
 */
export function tokenizePage(pageNumber, pageContent) {
  const lineObjs = Array.isArray(pageContent)
    ? pageContent
    : (pageContent || '').split('\n').map((text) => ({ text }));

  const tokens = [];
  let insideAnswerKeySection = false;

  lineObjs.forEach((lineObj, lineIndex) => {
    const text = (lineObj.text || '').trim();
    if (!text) return;
    // pageCleaner already strips most noise, but tokenizer defensively tags
    // any remaining boilerplate as HEADER instead of feeding it to the parser.
    if (isNoiseLine(text)) {
      tokens.push({
        id: nextId('tok'),
        page: pageNumber,
        line: lineIndex,
        column: lineObj.column ?? 0,
        type: TOKEN_TYPES.HEADER,
        text,
      });
      return;
    }

    const type = classifyLine(text, insideAnswerKeySection);
    if (type === TOKEN_TYPES.ANSWER_KEY) insideAnswerKeySection = true;

    tokens.push({
      id: nextId('tok'),
      page: pageNumber,
      line: lineIndex,
      column: lineObj.column ?? 0,
      type,
      text,
    });
  });

  return tokens;
}

/**
 * Tokenizes every page of a cleaned/normalized document. Pages are processed
 * independently (never concatenated into one string first) and each token
 * keeps its originating page number, preserving the requirement that the
 * pipeline never loses per-page context.
 * @param {Array<{pageNumber:number, text:string, lines?:Array<object>}>} pages
 * @returns {Token[]}
 */
export function tokenizePages(pages) {
  const allTokens = [];
  for (const page of pages) {
    const content = Array.isArray(page.lines) && page.lines.length > 0 ? page.lines : page.text;
    allTokens.push(...tokenizePage(page.pageNumber, content));
  }
  return allTokens;
}

/** Backward-compatible alias for callers still using the old single-string API. */
export function tokenizeLines(mergedText, pageNumber = 1) {
  return tokenizePage(pageNumber, mergedText);
}
