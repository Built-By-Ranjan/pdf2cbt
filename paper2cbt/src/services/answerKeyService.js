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
import { ANSWER_KEY_HEADER, matchAnswerKeyLine, matchAllAnswerKeyEntries } from '../utils/regexPatterns';
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
 * Scans the full token stream for an answer key table and parses raw entries.
 * @param {Array<{type:string, text:string, page:number, subject?:string}>} tokens
 * @returns {Array<{number:number, label:string, subject?:string}>}
 */
function extractRawKeyEntriesFromTokens(tokens) {
  let startIndex = findExplicitHeaderIndex(tokens);

  if (startIndex === -1) {
    const densePage = detectAnswerKeyPageByDensity(tokens);
    if (densePage === -1) return [];
    startIndex = tokens.findIndex((t) => t.page === densePage);
  }

  const rawEntries = [];
  let currentSubject = null;

  for (let i = startIndex; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const text = (tok?.text || '').trim();
    if (!text) continue;

    if (tok.subject) currentSubject = tok.subject;

    const entries = matchAllAnswerKeyEntries(text);
    for (const match of entries) {
      rawEntries.push({
        number: match.number,
        label: match.label,
        subject: currentSubject,
      });
    }
  }

  return rawEntries;
}

/**
 * Maps raw answer key entries to questions using (subject, order) resolution.
 * Handles papers where question numbering restarts per subject (e.g. Maths 1-25,
 * Physics 1-25) by matching to the correct unique question number.
 * @param {Array<{number:number, label:string, subject?:string}>} rawEntries
 * @param {Array<object>} questions
 * @returns {Map<number,string>} question.number -> correct label
 */
export function mapKeyEntriesToQuestions(rawEntries, questions = []) {
  const map = new Map();
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return map;
  if (!questions || questions.length === 0) {
    for (const entry of rawEntries) map.set(entry.number, entry.label);
    return map;
  }

  // Group questions by subject
  const questionsBySubject = new Map();
  for (const q of questions) {
    const s = q.subject || 'General';
    if (!questionsBySubject.has(s)) questionsBySubject.set(s, []);
    questionsBySubject.get(s).push(q);
  }

  const hasMultipleSubjects = questionsBySubject.size > 1;
  const entriesHaveSubjects = rawEntries.some((e) => e.subject);

  if (hasMultipleSubjects && entriesHaveSubjects) {
    for (const entry of rawEntries) {
      const s = entry.subject || 'General';
      const subjectQs = questionsBySubject.get(s) || [];
      const q =
        subjectQs.find((item) => item.displayNumber === entry.number) ||
        subjectQs[entry.number - 1];
      if (q) map.set(q.number, entry.label);
    }
  } else if (hasMultipleSubjects && rawEntries.some((e, idx) => idx > 0 && e.number <= rawEntries[idx - 1].number)) {
    // Answer key restarts numbering per subject (e.g. 1..25, then 1..25)
    const subjects = [...questionsBySubject.keys()];
    let currentSubjIdx = 0;
    let lastNum = -1;

    for (const entry of rawEntries) {
      if (entry.number <= lastNum && currentSubjIdx + 1 < subjects.length) {
        currentSubjIdx += 1;
      }
      lastNum = entry.number;

      const currentSubject = subjects[currentSubjIdx];
      const subjectQs = questionsBySubject.get(currentSubject) || [];
      const q =
        subjectQs.find((item) => item.displayNumber === entry.number) ||
        subjectQs[entry.number - 1];
      if (q) {
        map.set(q.number, entry.label);
      } else if (questions[entry.number - 1]) {
        map.set(questions[entry.number - 1].number, entry.label);
      }
    }
  } else {
    // Single continuous numbering or 1:1 positional match
    if (rawEntries.length === questions.length) {
      rawEntries.forEach((entry, idx) => {
        map.set(questions[idx].number, entry.label);
      });
    } else {
      for (const entry of rawEntries) {
        const q =
          questions.find((item) => item.displayNumber === entry.number) ||
          questions.find((item) => item.number === entry.number);
        if (q) map.set(q.number, entry.label);
        else map.set(entry.number, entry.label);
      }
    }
  }

  return map;
}

/**
 * Scans the full token stream for an answer key and parses it into a
 * number->label map. Accepts pre-parsed inline answers and merges them in.
 * Uses (subject, order) mapping to resolve questions whose numbering restarts.
 * @param {Array<{type:string, text:string, page:number}>} tokens
 * @param {Array<object>} [questions]
 * @returns {Map<number,string> | null}
 */
export function extractAnswerKey(tokens, questions = []) {
  const rawKeyEntries = extractRawKeyEntriesFromTokens(tokens);
  const trailingKey = rawKeyEntries.length > 0 ? mapKeyEntriesToQuestions(rawKeyEntries, questions) : null;
  const inlineKey = buildAnswerKeyFromInline(questions);

  if (!trailingKey && !inlineKey) return null;

  // Merge: start with inline answers (lower priority), then override with
  // trailing key entries (higher priority) where both exist.
  const merged = new Map();
  if (inlineKey) for (const [num, label] of inlineKey) merged.set(num, label);
  if (trailingKey) for (const [num, label] of trailingKey) merged.set(num, label);

  return merged.size > 0 ? merged : null;
}
