// subjectDetector.js
// Phase B: Detect subjects (Maths, Physics, Chemistry, Biology, etc.) from
// headings and annotate every question with its subject.
// No hardcoded subject names for a specific paper — everything is driven by
// pattern matching against common heading forms found in JEE, NEET, SSC,
// UPSC, banking and medical exam papers.
//
// Supported patterns (all case-insensitive):
//   "PART - A : MATHEMATICS"
//   "Part A : Physics"
//   "SECTION - I (PHYSICS)"
//   "PART B: Chemistry"
//   "Biology / Botany"
//   "PART III – Zoology"
//   "Subject: English"
//   A bare subject name as a short standalone line ("PHYSICS", "MATHS")
//
// The detector runs on the RAW token stream (after sectionDetector) and adds
// a `subject` field to every token. questionParser propagates it onto each
// question object.
//
// The subject list is EXTENSIBLE: add new patterns to SUBJECT_PATTERNS below.
// User-defined subjects (from Settings) are merged in at runtime.

import { TOKEN_TYPES } from '../utils/constants';

/**
 * Each entry maps a regex (tested against a line) to a canonical subject name.
 * Order matters: more specific patterns first.
 */
export const SUBJECT_PATTERNS = [
  // Mathematics / Maths
  { pattern: /math(?:ematics)?s?\b/i, subject: 'Mathematics' },
  // Physics
  { pattern: /\bphysics\b/i, subject: 'Physics' },
  // Chemistry
  { pattern: /\bchemistry\b/i, subject: 'Chemistry' },
  // Biology (generic)
  { pattern: /\bbiology\b/i, subject: 'Biology' },
  // Botany
  { pattern: /\bbotany\b/i, subject: 'Botany' },
  // Zoology
  { pattern: /\bzoology\b/i, subject: 'Zoology' },
  // Anatomy
  { pattern: /\banatomy\b/i, subject: 'Anatomy' },
  // Physiology
  { pattern: /\bphysiology\b/i, subject: 'Physiology' },
  // Pathology
  { pattern: /\bpathology\b/i, subject: 'Pathology' },
  // Pharmacology
  { pattern: /\bpharmacology\b/i, subject: 'Pharmacology' },
  // Surgery
  { pattern: /\bsurgery\b/i, subject: 'Surgery' },
  // Gynaecology / Obstetrics
  { pattern: /\bgynae(?:cology)?\b|\bobstet(?:rics)?\b/i, subject: 'Gynaecology & Obstetrics' },
  // Preventive / Social Medicine
  { pattern: /\bpreventive\b|\bsocial\s+medicine\b|\bpsm\b/i, subject: 'Community Medicine' },
  // Microbiology
  { pattern: /\bmicrobiology\b/i, subject: 'Microbiology' },
  // Biochemistry
  { pattern: /\bbiochemistry\b/i, subject: 'Biochemistry' },
  // English
  { pattern: /\benglish\b/i, subject: 'English' },
  // Hindi
  { pattern: /\bhindi\b/i, subject: 'Hindi' },
  // Reasoning / General Intelligence
  { pattern: /\breasoning\b|\bgeneral\s+intelligence\b/i, subject: 'Reasoning' },
  // General Knowledge / Awareness / Studies
  { pattern: /\bgeneral\s+(?:knowledge|awareness|studies)\b|\bgk\b|\bga\b/i, subject: 'General Knowledge' },
  // Quantitative Aptitude
  { pattern: /\bquantitative\s+aptitude\b|\bquant\b/i, subject: 'Quantitative Aptitude' },
  // Computer Science
  { pattern: /\bcomputer\s+(?:science|awareness|fundamentals)\b/i, subject: 'Computer Science' },
  // Economics
  { pattern: /\beconomics\b/i, subject: 'Economics' },
  // History
  { pattern: /\bhistory\b/i, subject: 'History' },
  // Geography
  { pattern: /\bgeography\b/i, subject: 'Geography' },
  // Polity / Civics
  { pattern: /\bpolity\b|\bcivics\b|\bpolitical\s+science\b/i, subject: 'Polity' },
];

/**
 * A heading line that explicitly introduces a subject part, e.g.:
 *   "PART - A : MATHEMATICS"
 *   "SECTION I – PHYSICS"
 *   "Part B: Chemistry"
 */
const SUBJECT_HEADING_PREFIX =
  /^(?:part|section|unit|module|subject)\s*[-–—:.]?\s*[A-Za-z0-9]{0,4}\s*[-–—:.]?\s*/i;

/**
 * Returns the canonical subject name if a line introduces a subject section,
 * or null if it's not a subject heading.
 * @param {string} text
 * @param {Array<{pattern:RegExp, subject:string}>} [extraPatterns]
 * @returns {string|null}
 */
export function detectSubjectFromLine(text, extraPatterns = []) {
  const all = [...SUBJECT_PATTERNS, ...extraPatterns];
  const stripped = text.replace(SUBJECT_HEADING_PREFIX, '').trim();
  for (const { pattern, subject } of all) {
    if (pattern.test(stripped) || pattern.test(text)) return subject;
  }
  return null;
}

/**
 * Returns true if a line is ONLY a subject/section heading (not mixed with
 * question content). Used to decide whether to emit a SUBJECT token.
 * @param {string} text
 * @returns {boolean}
 */
function isSubjectHeadingLine(text) {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length > 60) return false;
  // Must not start with a question marker or option marker
  if (/^\s*\d{1,4}\s*[.):]/.test(trimmed)) return false;
  if (/^\s*\(?[A-Da-d1-4]\s*[.):]/.test(trimmed)) return false;

  // If it has explicit heading prefix ("PART A: PHYSICS", "SECTION - I : MATHEMATICS")
  if (SUBJECT_HEADING_PREFIX.test(trimmed)) {
    return SUBJECT_PATTERNS.some(({ pattern }) => pattern.test(trimmed));
  }

  // Standalone subject title: short (<= 35 chars), at most 4 words, must not contain sentence/prose words
  if (trimmed.length > 35) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 4) return false;
  if (/\b(?:of|in|the|for|by|to|at|an|a|is|are|was|were|has|have|had|with|from|into|about|after|before|which|what|where|when|who|how|consider|following|steps|repair|patient|infant|disease|syndrome|causes|treatment|regarding|between|during|under|over|find|calculate|select)\b/i.test(trimmed)) {
    return false;
  }

  // Must match one of the subject patterns
  return SUBJECT_PATTERNS.some(({ pattern }) => pattern.test(trimmed));
}

/**
 * Annotates every token in the stream with the currently-active subject.
 * Runs AFTER annotateSections. Tokens before the first subject heading get
 * subject: null (which the UI renders as 'General').
 * @param {Array<object>} tokens
 * @param {Array<{pattern:RegExp, subject:string}>} [extraPatterns]
 * @returns {Array<object>}
 */
export function annotateSubjects(tokens, extraPatterns = []) {
  let currentSubject = null;

  return tokens.map((token) => {
    if (
      token.type === TOKEN_TYPES.SECTION ||
      token.type === TOKEN_TYPES.HEADER ||
      token.type === TOKEN_TYPES.TEXT
    ) {
      if (isSubjectHeadingLine(token.text)) {
        const detected = detectSubjectFromLine(token.text, extraPatterns);
        if (detected) currentSubject = detected;
      }
    }
    return { ...token, subject: currentSubject };
  });
}

/**
 * Extracts the list of unique subjects found in a set of questions.
 * @param {Array<{subject?:string|null}>} questions
 * @returns {string[]}
 */
export function extractSubjectList(questions) {
  const seen = new Set();
  for (const q of questions) {
    if (q.subject) seen.add(q.subject);
  }
  return [...seen];
}
