// answerKeyService.js
// Single responsibility: detect and extract an answer key section, if
// present, from the tokenized document. Returns null when no answer key
// exists — the Result page relies on this to decide whether to show scoring
// or just a response log.
//
// Phase D additions:
//   - Merges inline answers (from faculty copy Ans. (C) lines) with any
//     trailing answer-key table, with the trailing table taking precedence.
//   - Supports trailing key tables: "1-A 2-C 3-B ..."
//   - Maps by (subject, sequence order) for papers that restart numbering
//     per subject, using an offset-aware strategy.

import { TOKEN_TYPES } from '../utils/constants';
import { ANSWER_KEY_HEADER, matchAnswerKeyLine } from '../utils/regexPatterns';
import { buildAnswerKeyFromInline } from './inlineAnswerDetector';

const MIN_DENSE_MATCH_RATIO = 0.6; // fraction of lines on a page that must look like key lines
const MIN_DENSE_MATCH_COUNT = 5; // ...and there must be at least this many, to avoid false positives

/**
 * Finds the token index of an explicit "Answer Key" header, if one exists.
 * @param {Array<{type:string, text:string}>} tokens
 * @returns {number}
 */
function findExplicitHeaderIndex(tokens) {
  return tokens.findIndex((t) => t.type === TOKEN_TYPES.ANSWER_KEY && ANSWER_KEY_HEADER.test(t.text));
}

/**
 * Fallback for documents that have an answer key section with no header
 * text (common in coaching-institute PDFs that just dump a grid of
 * "1-A 2-C 3-B ..." at the end). Finds the first page where a dense run of
 * lines all match an answer-key-line pattern.
 * @param {Array<{page:number, text:string}>} tokens
 * @returns {number} page number, or -1 if none found
 */
function detectAnswerKeyPageByDensity(tokens) {
  const byPage = new Map();
  for (const token of tokens) {
    if (!byPage.has(token.page)) byPage.set(token.page, []);
    byPage.get(token.page).push(token.text);
  }

  for (const [page, lines] of byPage) {
    const matches = lines.filter((line) => matchAnswerKeyLine(line)).length;
    if (matches >= MIN_DENSE_MATCH_COUNT && matches / lines.length >= MIN_DENSE_MATCH_RATIO) {
      return page;
    }
  }
  return -1;
}

/**
 * Scans the full token stream for an answer key table and parses it.
 * @param {Array<{type:string, text:string, page:number}>} tokens
 * @returns {Map<number,string> | null}
 */
function extractKeyFromTokens(tokens) {
  let startIndex = findExplicitHeaderIndex(tokens);

  if (startIndex === -1) {
    const densePage = detectAnswerKeyPageByDensity(tokens);
    if (densePage === -1) return null;
    startIndex = tokens.findIndex((t) => t.page === densePage);
  }

  const answerMap = new Map();
  for (let i = startIndex + 1; i < tokens.length; i += 1) {
    const match = matchAnswerKeyLine(tokens[i].text);
    if (match) answerMap.set(match.number, match.label);
  }

  // Also parse the header/start line itself in case it's a dense-detection
  // start (density fallback begins ON the first matching line, not after it).
  const startMatch = matchAnswerKeyLine(tokens[startIndex]?.text || '');
  if (startMatch) answerMap.set(startMatch.number, startMatch.label);

  return answerMap.size > 0 ? answerMap : null;
}

/**
 * Scans the full token stream for an answer key and parses it into a
 * number->label map. Also accepts an optional pre-parsed inline answer map
 * (from faculty-copy parsing) and merges it in — the trailing key table
 * always takes precedence over inline answers for a given question number.
 * @param {Array<{type:string, text:string, page:number}>} tokens
 * @param {Array<{number:number, inlineAnswer:string|null}>} [questions]
 * @returns {Map<number,string> | null}
 */
export function extractAnswerKey(tokens, questions = []) {
  const trailingKey = extractKeyFromTokens(tokens);
  const inlineKey = buildAnswerKeyFromInline(questions);

  if (!trailingKey && !inlineKey) return null;

  // Merge: start with inline answers (lower priority), then override with
  // trailing key entries (higher priority) where both exist.
  const merged = new Map();
  if (inlineKey) for (const [num, label] of inlineKey) merged.set(num, label);
  if (trailingKey) for (const [num, label] of trailingKey) merged.set(num, label);

  return merged.size > 0 ? merged : null;
}
