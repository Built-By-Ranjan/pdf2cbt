// questionDetector.js
// Single responsibility: a lightweight, standalone yes/no + number detector
// for "is this line a question start", usable independently of the full
// tokenizer/parser pipeline (e.g. for quick previews or tests). The full
// pipeline uses regexPatterns.matchQuestionStart directly via tokenizer;
// this module wraps it with extra false-positive guards appropriate for
// detection in isolation, where we don't yet have surrounding context.

import { matchQuestionStart, matchRomanQuestionStart } from '../utils/regexPatterns';

// A bare "1." or "1)" with no meaningful trailing text is far more likely to
// be a numbered list item, a decimal fragment ("3.14"), or page furniture
// than a real question start.
const MIN_TRAILING_TEXT_LENGTH = 2;

/**
 * Detects whether a line starts a new question and, if so, its number.
 * @param {string} line
 * @param {{ allowRoman?: boolean }} [options] allowRoman: enable when the
 *   document is known to use roman-numeral question numbering (it's
 *   ambiguous with option lettering, so off by default).
 * @returns {{ isQuestion: boolean, number: number|null }}
 */
export function detectQuestion(line = '', options = {}) {
  const value = line.trim();
  if (!value) return { isQuestion: false, number: null };

  // Guard: don't treat a decimal number ("3.14 is pi") as a question start.
  if (/^\d+\.\d/.test(value)) return { isQuestion: false, number: null };

  const match = matchQuestionStart(value);
  if (match) {
    const trailing = value.slice(match.matchedLength).trim();
    if (trailing.length < MIN_TRAILING_TEXT_LENGTH && !options.allowNextLineContent) {
      return { isQuestion: false, number: match.number };
    }
    return { isQuestion: true, number: match.number };
  }

  if (options.allowRoman) {
    const romanMatch = matchRomanQuestionStart(value);
    if (romanMatch) {
      const trailing = value.slice(romanMatch.matchedLength).trim();
      if (trailing.length >= MIN_TRAILING_TEXT_LENGTH) {
        return { isQuestion: true, number: romanMatch.number };
      }
    }
  }

  return { isQuestion: false, number: null };
}

/** Simple boolean convenience wrapper matching the pre-rewrite API shape. */
export function isQuestion(line = '', options) {
  return detectQuestion(line, options).isQuestion;
}
