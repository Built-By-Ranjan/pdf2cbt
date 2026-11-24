// sectionDetector.js
// Single responsibility: walk the token stream and resolve, for every
// position in it, which "section" (e.g. "Physics", "Section A", "Part 2 -
// Chemistry") is currently active. Kept separate from questionParser so
// section-detection logic (and its own edge cases — false positives, missing
// headers, duplicate section names) can evolve independently.
//
// Also detects INTEGER-type section headers (Section II / Numerical Value /
// Integer Type) so questionParser can override question type for the whole
// section without needing the NUMERICAL_ANSWER_HINT in every question stem.

import { TOKEN_TYPES } from '../utils/constants';
import { SECTION_HEADER_PATTERN } from '../utils/regexPatterns';

// Patterns indicating a section where ALL questions expect integer answers.
const INTEGER_SECTION_PATTERNS = [
  /integer\s+(?:type|answer)/i,
  /numerical\s+(?:value|type|answer)/i,
  /(?:section|part)\s*[-–]?\s*(?:II|Il|ll|2|B)\b/i, // Section II, Part B, Section 2 (or OCR variants Il, ll)
  /type\s*[-–]?\s*2\b.*(?:integer|numerical)/i,
];

/**
 * @param {string} text
 * @returns {boolean}
 */
function isIntegerSection(text) {
  return INTEGER_SECTION_PATTERNS.some((p) => p.test(text));
}

/**
 * @param {string} text
 * @returns {string} a human-readable section label, e.g. "A - Physics" or "Physics"
 */
function extractSectionLabel(text) {
  const match = text.match(SECTION_HEADER_PATTERN);
  if (!match) return text.trim();
  const [, marker, rest] = match;
  const trimmedRest = (rest || '').trim();
  if (marker && trimmedRest) return `${marker} - ${trimmedRest}`;
  return (trimmedRest || marker || text).trim();
}

/**
 * Annotates every token with the section active at that point in the
 * document. Tokens before the first SECTION token get section:null.
 * Also adds `sectionIsInteger: boolean` to let questionParser classify
 * no-option questions as INTEGER rather than SUBJECTIVE.
 * @param {Array<object>} tokens
 * @returns {Array<object>} same tokens, each with an added `section` and `sectionIsInteger` field
 */
export function annotateSections(tokens) {
  let currentSection = null;
  let currentSectionIsInteger = false;
  return tokens.map((token) => {
    if (token.type === TOKEN_TYPES.SECTION) {
      currentSection = extractSectionLabel(token.text);
      currentSectionIsInteger = isIntegerSection(token.text);
    }
    return { ...token, section: currentSection, sectionIsInteger: currentSectionIsInteger };
  });
}
