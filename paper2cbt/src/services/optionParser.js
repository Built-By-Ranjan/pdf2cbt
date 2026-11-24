// optionParser.js
// Single responsibility: given a line already classified as OPTION_START (or
// any line, for the inline-splitting helper), extract its normalized label
// (A-F) and text. Supports every marker style in the spec: (A), A), A.,
// circled-unicode ①/Ⓐ, roman numerals, Hindi letters (क/ख/ग/घ), inline
// multi-option lines, wrapped/multi-line options (continuation is handled by
// questionParser's state machine, not here), and image-only options.

import { matchOptionMarker, normalizeOptionLabel } from '../utils/regexPatterns';

const IMAGE_ONLY_OPTION_PATTERN = /^\[image\]$|^\[img\]$/i;
const IMAGE_REF_PATTERN = /\[image\]|\[img\]|\bfigure\s*\d*\b|\bdiagram\b/i;

/**
 * Matches a single option line and extracts its label + text.
 * @param {string} line
 * @returns {{label:string, text:string, isImageOption:boolean} | null}
 */
export function matchOptionLine(line) {
  const match = matchOptionMarker(line);
  if (!match) return null;

  const text = line.slice(match.matchedLength).trim();
  if (!match.label) return null;

  // An option can legitimately be image-only ("(A) [image]") — still valid,
  // just flagged so the UI knows to render an image rather than empty text.
  const isImageOption = text.length === 0 || IMAGE_ONLY_OPTION_PATTERN.test(text) || IMAGE_REF_PATTERN.test(text);
  if (text.length === 0 && !isImageOption) return null;

  return { label: match.label, text, isImageOption };
}

/**
 * Detects multiple options embedded within a single line, e.g.
 * "A) Paris B) London C) Rome D) Berlin" or "(A) 2  (B) 4  (C) 6  (D) 8".
 * Requires at least 2 distinct markers to avoid false-positives on prose
 * that merely contains a lone "A)".
 * @param {string} line
 * @returns {Array<{label:string, text:string, isImageOption:boolean}>}
 */
export function splitInlineOptions(line) {
  // Broad marker-position scan: Latin letter, digit, or roman numeral marker
  // followed by ) or . and whitespace.
  const inlinePattern =
    /(?:\(|\[)\s*([A-Fa-f0-9®©€]|x{0,2}(?:ix|iv|v?i{0,3}))\s*(?:\)|\])\s*|(?:\b|\s)([A-Fa-f]|[1-6])\s*[.)]\s+|([①②③④ⓐⓑⓒⓓⒶⒷⒸⒹ®©€])\s+/gi;
  const matches = [...line.matchAll(inlinePattern)].filter((m) => normalizeOptionLabel(m[1] || m[2] || m[3]));
  if (matches.length < 2) return [];

  const results = [];
  const seenLabels = new Set();
  for (let i = 0; i < matches.length; i += 1) {
    const raw = matches[i][1] || matches[i][2] || matches[i][3];
    const label = normalizeOptionLabel(raw);
    if (!label || seenLabels.has(label)) continue; // avoid re-matching stray letters inside option text
    seenLabels.add(label);

    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    const text = line.slice(start, end).trim();
    if (!text) continue;

    results.push({ label, text, isImageOption: IMAGE_ONLY_OPTION_PATTERN.test(text) || IMAGE_REF_PATTERN.test(text) });
  }
  return results.length >= 2 ? results : [];
}

const INLINE_OPTION_SCAN_PATTERN =
  /(?:\(|\[)\s*([A-Fa-f0-9®©€]|x{0,2}(?:ix|iv|v?i{0,3}))\s*(?:\)|\])\s*|(?:\b|\s)([A-Fa-f]|[1-6])\s*[.)]\s+|([①②③④ⓐⓑⓒⓓⒶⒷⒸⒹ®©€])\s+/gi;

/**
 * Like splitInlineOptions, but also returns the leading text BEFORE the
 * first option marker — needed when a question's marker and its options
 * are glued onto a single line, e.g.
 * "Q2. Which of the following is a prime number? A) 4  B) 6  C) 7  D) 9"
 * where the question stem ("Which of the following is a prime number?")
 * must be separated from the inline option list rather than swallowing the
 * whole line as question text with zero parsed options.
 * @param {string} line
 * @returns {{ prefix:string, options:Array<{label:string, text:string, isImageOption:boolean}> } | null}
 */
export function splitInlineOptionsWithPrefix(line) {
  if (!line) return null;
  const matches = [...line.matchAll(INLINE_OPTION_SCAN_PATTERN)].filter((m) =>
    normalizeOptionLabel(m[1] || m[2] || m[3])
  );
  if (matches.length < 2) return null;

  const prefix = line.slice(0, matches[0].index).trim();

  const results = [];
  const seenLabels = new Set();
  for (let i = 0; i < matches.length; i += 1) {
    const raw = matches[i][1] || matches[i][2] || matches[i][3];
    const label = normalizeOptionLabel(raw);
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);

    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    const text = line.slice(start, end).trim();
    if (!text) continue;

    results.push({ label, text, isImageOption: IMAGE_ONLY_OPTION_PATTERN.test(text) || IMAGE_REF_PATTERN.test(text) });
  }

  return results.length >= 2 ? { prefix, options: results } : null;
}

/**
 * Appends a wrapped continuation line to the last option's text (used by
 * questionParser when in the OPTION state and the current line doesn't
 * itself start a new option/question).
 * @param {{label:string, text:string}} option
 * @param {string} continuationLine
 */
export function appendOptionContinuation(option, continuationLine) {
  if (!continuationLine) return option;
  return { ...option, text: `${option.text} ${continuationLine}`.trim() };
}
