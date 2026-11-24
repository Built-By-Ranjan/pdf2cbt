// Regex patterns used by the parser pipeline.
// IMPORTANT: The parser never relies on a single pattern — questionParser.js
// tries each of these in priority order and falls back gracefully.

// Matches question-number markers at the start of a line, e.g.:
// "Question 1", "Q1", "Q.1", "1.", "1)", "01.", "1 0." (split digits from kerning)
export const QUESTION_MARKERS = [
  /^\s*Question\s*[.:-]?\s*(\d(?:\s*\d){0,3})\b[.):-]?\s*/i,
  /^\s*Que\.?s?\s*[.:-]?\s*(\d(?:\s*\d){0,3})\b[.):-]?\s*/i,
  /^\s*Q\.?\s*[.:-]?\s*(\d(?:\s*\d){0,3})\b[.):-]?\s*/i,
  /^\s*0*(\d(?:\s*\d){0,3})\s*[.)]\s+/,
  // Hindi: "प्रश्न 1", "प्रश्न - १"
  /^\s*प्रश्न\s*[.:-]?\s*([०-९\d](?:\s*[०-९\d]){0,3})\b[.):-]?\s*/,
];

// Devanagari digit -> Arabic digit mapping, for Hindi-numbered questions/options.
export const HINDI_DIGIT_MAP = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

/** Converts a string of Devanagari digits (or already-Arabic digits) to a number. */
export function hindiDigitsToNumber(value) {
  const converted = String(value).replace(/[०-९]/g, (ch) => HINDI_DIGIT_MAP[ch]);
  const num = parseInt(converted, 10);
  return Number.isNaN(num) ? null : num;
}

// Roman-numeral question markers, kept separate from QUESTION_MARKERS because
// they're ambiguous with roman-numeral OPTION markers — callers opt in via
// matchRomanQuestionStart only when the document is known to use them.
const ROMAN_QUESTION_MARKER = /^\s*\(?([IVXLCDM]{1,7})\)?[.):]\s*/;

// Matches option markers at the start of a line, e.g.:
// "A.", "B.", "(A)", "A)", "①", "②", "Ⓐ", "ⓐ", roman numerals "I.", "II.",
// and Hindi option letters "क)", "ख)".
// Also matches common OCR glyph confusions (8, 0, ®, ©, €) ONLY in option-marker positions.
export const OPTION_MARKERS = [
  /^\s*\(\s*([A-Da-d0-9®©€])\s*\)\s*/,
  /^\s*\[\s*([A-Da-d0-9®©€])\s*\]\s*/,
  /^\s*([A-Da-d])\s*[.):]\s*/,
  /^\s*([①②③④ⓐⓑⓒⓓⒶⒷⒸⒹ®©€])\s*/,
  /^\s*\(?\s*([क-ङ])\s*\)?[.):]\s*/,
  /^\s*\(?\s*(I{1,3}V?|IV|VI{0,3})\s*\)?[.):]\s*/,
];

// Circled unicode digits/letters -> alphabetic label mapping
export const CIRCLED_NUMERAL_MAP = {
  '①': 'A',
  '②': 'B',
  '③': 'C',
  '④': 'D',
  'ⓐ': 'A',
  'ⓑ': 'B',
  'ⓒ': 'C',
  'ⓓ': 'D',
  'Ⓐ': 'A',
  'Ⓑ': 'B',
  'Ⓒ': 'C',
  'Ⓓ': 'D',
  '®': 'B',
  '©': 'C',
  '€': 'C',
};

// OCR misread numerals in option positions only:
export const OCR_OPTION_GLYPH_MAP = {
  '8': 'B',
  '0': 'D',
  'O': 'D',
  'o': 'D',
};

export const ROMAN_TO_LABEL_MAP = {
  I: 'A',
  II: 'B',
  III: 'C',
  IV: 'D'
};

// Hindi option letters (क, ख, ग, घ, ङ) -> alphabetic label mapping.
export const HINDI_OPTION_MAP = {
  'क': 'A',
  'ख': 'B',
  'ग': 'C',
  'घ': 'D',
  'ङ': 'E'
};

export function normalizeOptionLabel(rawLabel) {
  if (!rawLabel) return null;
  if (CIRCLED_NUMERAL_MAP[rawLabel]) return CIRCLED_NUMERAL_MAP[rawLabel];
  if (HINDI_OPTION_MAP[rawLabel]) return HINDI_OPTION_MAP[rawLabel];
  if (OCR_OPTION_GLYPH_MAP[rawLabel]) return OCR_OPTION_GLYPH_MAP[rawLabel];
  const upper = rawLabel.toUpperCase();
  if (ROMAN_TO_LABEL_MAP[upper]) return ROMAN_TO_LABEL_MAP[upper];
  if (/^[A-F]$/.test(upper)) return upper;
  return null;
}

// Detects an "Answer Key" section header. Must be anchored to the START of
// the (trimmed) line and the line must be SHORT — a dedicated header line
// like "Answer Key", "ANSWERS", "Answer Key (Set A)" — never a substring
// match anywhere in a line. The previous version (`answer\s*key|answers?\s*:?\s*$`)
// had no start anchor on the second alternative, so any ordinary question or
// instruction line that merely ENDED in the word "answer"/"answers" (e.g.
// "Choose the correct answer:", "What is the correct answer") was wrongly
// classified as the start of the answer-key section, silently truncating the
// rest of the exam. Guard against that class of bug entirely by requiring
// the match to start the line and the whole line to be short header text.
export const ANSWER_KEY_HEADER =
  /^\s*answer\s*(?:s|-)?\s*key\b(?:\s*[:\-–]|\s*\((?:set|paper|code)?[^\n)]*\))?\s*$|^\s*answers?\s*[:.-]?\s*$/i;

// A single answer key line, e.g. "1. A", "1 - B", "Q1: C", "5. A,C" (multiple
// correct), "4. 2" or "4. -3.5" (numerical/integer-type answer).
export const ANSWER_KEY_LINE = /^\s*(?:Q\.?\s*)?0*(\d{1,4})\s*[.):-]\s*\(?([A-Fa-f](?:\s*[,/&]\s*[A-Fa-f])*|-?\d+(?:\.\d+)?)\)?\s*$/;

// True/False detection inside question text
export const TRUE_FALSE_PATTERN = /\btrue\s*\/\s*false\b/i;

// Assertion-Reason detection
export const ASSERTION_REASON_PATTERN = /assertion\s*\(?A\)?.*reason\s*\(?R\)?/i;

// Detects multi-correct hints ("choose all that apply", "select two")
export const MULTIPLE_CHOICE_HINT = /choose\s+all|select\s+(two|three|multiple)|more\s+than\s+one\s+option/i;

// ---------------------------------------------------------------------------
// Question-start matching
// ---------------------------------------------------------------------------

/**
 * Tries every QUESTION_MARKERS pattern in priority order and returns the
 * parsed question number + how much of the line the marker itself consumed
 * (so callers can slice off the remainder as the question's text).
 * @param {string} text
 * @returns {{ number:number, matchedLength:number } | null}
 */
export function matchQuestionStart(text) {
  if (!text) return null;
  for (let i = 0; i < QUESTION_MARKERS.length; i += 1) {
    const match = QUESTION_MARKERS[i].exec(text);
    if (!match) continue;
    const isHindiPattern = i === QUESTION_MARKERS.length - 1;
    const cleanDigits = match[1].replace(/\s+/g, '');
    const number = isHindiPattern ? hindiDigitsToNumber(cleanDigits) : parseInt(cleanDigits, 10);
    if (number === null || Number.isNaN(number)) continue;
    return { number, matchedLength: match[0].length };
  }
  return null;
}

/** Converts a roman numeral (I, II, III, IV, ... up to a few thousand) to an integer, or null if invalid. */
function romanToInt(roman) {
  const VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const upper = (roman || '').toUpperCase();
  if (!upper || !/^[IVXLCDM]+$/.test(upper)) return null;
  let total = 0;
  for (let i = 0; i < upper.length; i += 1) {
    const current = VALUES[upper[i]];
    const next = VALUES[upper[i + 1]];
    if (next && current < next) total -= current;
    else total += current;
  }
  return total > 0 ? total : null;
}

/**
 * Matches a roman-numeral question start (e.g. "I.", "IV)"). Opt-in only —
 * see questionDetector.js for why this isn't part of matchQuestionStart.
 * @param {string} text
 * @returns {{ number:number, matchedLength:number } | null}
 */
export function matchRomanQuestionStart(text) {
  if (!text) return null;
  const match = ROMAN_QUESTION_MARKER.exec(text);
  if (!match) return null;
  const number = romanToInt(match[1]);
  if (number === null) return null;
  return { number, matchedLength: match[0].length };
}

// ---------------------------------------------------------------------------
// Option-marker matching
// ---------------------------------------------------------------------------

/**
 * Tries every OPTION_MARKERS pattern in priority order and returns the
 * normalized label (A-F) + how much of the line the marker consumed.
 * @param {string} text
 * @returns {{ label:string, matchedLength:number } | null}
 */
export function matchOptionMarker(text) {
  if (!text) return null;
  for (const pattern of OPTION_MARKERS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const label = normalizeOptionLabel(match[1]);
    if (!label) continue;
    return { label, matchedLength: match[0].length };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Answer-key line matching
// ---------------------------------------------------------------------------

/**
 * Matches a single answer-key line (e.g. "1. A", "1-A", "Q1: C", "5. A,C",
 * "4. 2") and returns the parsed question number + correct answer.
 * For a single-letter MCQ answer, `label` is a normalized string ("A").
 * For a multiple-correct answer ("A,C"), `label` is an array (["A","C"]).
 * For a numerical/integer-type answer ("2", "-3.5"), `label` is the numeric
 * value as a string, left un-normalized so it can be compared directly
 * against a typed numeric response.
 * @param {string} text
 * @returns {{ number:number, label:string|string[] } | null}
 */
export function matchAnswerKeyLine(text) {
  if (!text) return null;
  const match = ANSWER_KEY_LINE.exec(text.trim());
  if (!match) return null;
  const number = parseInt(match[1], 10);
  if (Number.isNaN(number)) return null;

  const rawValue = match[2];
  // Numeric (integer/decimal, optionally negative) answer — used for
  // NUMERICAL-type questions. Left as-is, not run through option-label
  // normalization.
  if (/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
    return { number, label: rawValue };
  }

  // One or more comma/slash/ampersand-separated option letters.
  const parts = rawValue.split(/[,/&]/).map((p) => normalizeOptionLabel(p.trim())).filter(Boolean);
  if (parts.length === 0) return null;
  return { number, label: parts.length === 1 ? parts[0] : parts };
}

/**
 * Finds all answer-key entries in a line or block of text.
 * Handles tabular multi-column key lines (e.g. "1. 4  32. 3  63. 1  94. 6")
 * and space-separated grids ("1-A 2-C 3-B ...").
 * @param {string} text
 * @returns {Array<{ number:number, label:string|string[] }>}
 */
export function matchAllAnswerKeyEntries(text) {
  if (!text) return [];
  const regex = /(?:Q\.?\s*)?0*(\d{1,4})\s*[.):-]\s*\(?([A-Fa-f1-4](?:\s*[,/&]\s*[A-Fa-f1-4])*|-?\d+(?:\.\d+)?)\)?/g;
  const entries = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const number = parseInt(match[1], 10);
    const rawValue = match[2];
    if (Number.isNaN(number)) continue;
    let label = rawValue;
    if (!/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      const parts = rawValue.split(/[,/&]/).map((p) => normalizeOptionLabel(p.trim()) || p.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      label = parts.length === 1 ? parts[0] : parts;
    }
    entries.push({ number, label });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

// Detects section/part headers, e.g. "Section A", "Part B - Chemistry",
// "Module 2", "Exercise 3", or a bare subject name used as a header
// ("Physics", "General Knowledge"). Capture group 1 is the marker/subject,
// group 2 is anything trailing it on the same line.
export const SECTION_HEADER_PATTERN =
  /^\s*(section\s*[-:]?\s*[A-Z0-9]+|part\s*[-:]?\s*[A-Z0-9]+|module\s*[-:]?\s*\d+|exercise\s*[-:]?\s*\d+|unit\s*[-:]?\s*\d+)\s*[-:]?\s*(.*)$|^\s*(physics|chemistry|biology|mathematics|maths|english|hindi|history|geography|civics|economics|reasoning|general\s+knowledge|general\s+awareness|general\s+studies|quantitative\s+aptitude|computer\s+science)\s*[:\-–]?\s*$/i;

// ---------------------------------------------------------------------------
// Numerical / integer-type question hints
// ---------------------------------------------------------------------------

// Phrases that indicate a question expects a typed numeric/integer answer
// rather than options, e.g. "Integer Type", "the value of x is ____",
// "correct up to two decimal places", "nearest integer".
export const NUMERICAL_ANSWER_HINT =
  /integer\s+type|numerical\s+(value|answer|type)|correct\s+(up\s*to|to)\s+\w+\s+decimal|nearest\s+integer|answer\s+in\s+integer|fill\s+in\s+the\s+blank|_{3,}/i;

// ---------------------------------------------------------------------------
// Noise-line detection (headers/footers/instructions/boilerplate)
// ---------------------------------------------------------------------------

// Matches boilerplate lines that should never be treated as question/option
// content: general instructions, marks/time metadata, candidate/roll-number
// fields, institute/publisher/copyright lines, contact info, and page
// furniture (page numbers, barcodes, QR codes, watermarks).
const NOISE_LINE_PATTERNS = [
  /^\s*(general\s+)?instructions\s*:?\s*$/i,
  /^\s*(maximum|max\.?)\s*marks\s*:?/i,
  /^\s*time\s*(allowed|duration)\s*:?/i,
  /^\s*(candidate|student)\s*('s)?\s*name\s*:?/i,
  /^\s*roll\s*(no\.?|number)\s*:?/i,
  /^\s*(institute|institution|college|school)\s*name\s*:?/i,
  /^\s*(all\s+)?rights\s+reserved/i,
  /^\s*©.*$/,
  /^\s*copyright\s*(©|\(c\))?/i,
  /^\s*www\.[^\s]+/i,
  /^\s*https?:\/\/[^\s]+/i,
  /^\s*(phone|mobile|contact)\s*(no\.?|number)?\s*:?/i,
  /^\s*e-?mail\s*:?/i,
  /^\s*page\s*\d+(\s*(of|\/)\s*\d+)?\s*$/i,
  /^\s*\d+\s*\/\s*\d+\s*$/, // bare "3/50" page footer
  /^\s*\[?barcode\]?\s*$/i,
  /^\s*\[?qr\s*code\]?\s*$/i,
  /^\s*\[?watermark\]?\s*$/i,
  /^\s*(advertisement|sponsored)\s*:?$/i,
  /^\s*publisher\s*:?/i,
  /^\s*this\s+paper\s+contains/i,
  /^\s*do\s+not\s+open\s+this\s+booklet/i,
  /^\s*read\s+the\s+following\s+instructions\s+carefully/i,
];

// Phrases that only ever appear inside a "General Instructions" block, never
// inside an actual question stem. Numbered instruction items ("1. This
// paper contains 5 questions.", "2. All questions are compulsory.") would
// otherwise be mis-tokenized as QUESTION_START ("1.") by the generic
// bare-number marker pattern. isNoiseLine() checks these against the text
// with any leading "1." / "1)" / "(1)" enumeration marker stripped off, so
// the instruction is caught regardless of its list numbering.
const INSTRUCTION_CONTENT_PATTERNS = [
  /this\s+(paper|booklet|test|question\s*paper)\s+contains/i,
  /all\s+questions?\s+(are|is)\s+compulsory/i,
  /each\s+question\s+carr(y|ies)/i,
  /(there\s+is|no)\s+negative\s+marking/i,
  /negative\s+marking\s+(is|of)/i,
  /use\s+of\s+calculator/i,
  /do\s+not\s+write\s+(your\s+name|anything)/i,
  /darken\s+the\s+(appropriate|correct)\s+circle/i,
  /use\s+(only\s+)?(a\s+)?(blue|black)\s+(ball\s*point\s*)?pen/i,
  /use\s+(an?\s+)?hb\s+pencil/i,
  /no\s+additional\s+(sheets?|pages?)/i,
  /check\s+that\s+this\s+booklet/i,
  /overwriting\s*\/?\s*cutting/i,
  /mobile\s+phones?\s+(are\s+)?(not\s+allowed|prohibited)/i,
  /rough\s+work\s+(should|must)\s+be\s+done/i,
  /answer\s+sheet\s+will\s+be/i,
  /omr\s+sheet/i,
];

/** Strips a leading enumeration marker ("1.", "1)", "(1)", "i.") so instruction-content patterns can be tested against the remaining text. */
function stripLeadingEnumeration(text) {
  return text.replace(/^\s*\(?[0-9]{1,3}[.)]?\)?\s*/, '').replace(/^\s*\(?[ivxIVX]{1,4}[.)]\s*/, '');
}

/** True if a line's content (ignoring any leading list-number) is a known instruction-block phrase rather than real question/option content. */
export function isInstructionContentLine(text) {
  if (!text) return false;
  const stripped = stripLeadingEnumeration(text.trim());
  return INSTRUCTION_CONTENT_PATTERNS.some((pattern) => pattern.test(stripped) || pattern.test(text));
}

/**
 * True if a line is boilerplate that should never be parsed as question or
 * option content (instructions, headers/footers, metadata, watermarks, etc).
 * @param {string} text
 * @returns {boolean}
 */
export function isNoiseLine(text) {
  if (!text) return true;
  const value = text.trim();
  if (!value) return true;
  if (NOISE_LINE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  return isInstructionContentLine(value);
}
