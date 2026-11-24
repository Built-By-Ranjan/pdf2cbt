// instructionParser.js
// Phase B: Parses the instruction / cover page of an exam PDF to extract:
//   - Total time (minutes)
//   - Maximum marks
//   - Per-section question counts
//   - Per-section marking scheme (+correct / -negative / 0 skip)
//   - Section types (MCQ, Integer, Numerical, etc.)
//
// Also detects pages that are purely instructions/metadata/blank so they can
// be skipped by the main parser (never generating phantom questions).
//
// Everything is pattern-driven. No hardcoded numbers.

/**
 * @typedef {Object} SectionSpec
 * @property {string} name        section or part label
 * @property {string} type        'MCQ' | 'INTEGER' | 'NUMERICAL' | 'MULTIPLE'
 * @property {number} [count]     number of questions in this section
 * @property {number} [correct]   marks for correct answer
 * @property {number} [negative]  marks deducted for wrong answer (positive number)
 * @property {number} [skip]      marks for unattempted (usually 0)
 */

/**
 * @typedef {Object} ParsedInstructions
 * @property {number|null} examTimeMinutes
 * @property {number|null} maxMarks
 * @property {SectionSpec[]} sections
 * @property {boolean} hasNegativeMarking
 * @property {string[]} nonQuestionPageTypes  e.g. ['instructions','syllabus','data','blank','cover']
 */

const WORD_TO_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5 };

const TIME_PATTERN =
  /(?:total\s+)?(?:exam|test|paper)?\s*(?:time|duration)\s*[:\-–]?\s*(\d+)\s*(?:min(?:utes?)?|hr(?:s|ours?)?)/i;
const TIME_HOURS_PATTERN =
  /(?:time\s*(?:allowed|duration)?\s*[:\-–]?\s*)?(\d+|one|two|three|four)\s*(?:hour(?:s)?|hr(?:s)?)\s*(?:and)?\s*(\d*)\s*(?:minute(?:s)?|min(?:s)?)?/i;
const MAX_MARKS_PATTERN =
  /(?:maximum|max\.?)\s*marks?\s*[:\-–]?\s*(\d+)/i;
const TOTAL_MARKS_PATTERN =
  /total\s*marks?\s*[:\-–]?\s*(\d+)/i;

// Section marking patterns like "+4 for correct, -1 for wrong"
const MARKING_PATTERN =
  /[+](\d+(?:\.\d+)?)\s*(?:marks?)?\s*(?:for\s*(?:each\s*)?correct|correct\s*answer)/i;
const NEGATIVE_PATTERN =
  /[-–](\d+(?:\.\d+)?)\s*(?:marks?)?\s*(?:for\s*(?:each\s*)?(?:wrong|incorrect)|wrong\s*answer)/i;
const INTEGER_SECTION_PATTERN =
  /(?:section|part)\s*[-–]?\s*[IVXivx\dABC]{1,5}\s*.*(?:integer|numerical\s*value|answer\s*in\s*integer)/i;
const MCQ_SECTION_PATTERN =
  /(?:section|part)\s*[-–]?\s*[IVXivx\dABC]{1,5}\s*.*(?:single\s*(?:correct|choice)|mcq|multiple\s*choice)/i;
const MULTI_CORRECT_PATTERN =
  /(?:section|part)\s*[-–]?\s*[IVXivx\dABC]{1,5}\s*.*(?:multi(?:ple)?\s*correct|more\s*than\s*one)/i;
const Q_COUNT_PATTERN =
  /(\d+)\s*(?:questions?|qs?)\b/i;

/**
 * Heuristics to identify non-question pages by their text content.
 * Returns one of: 'instructions', 'syllabus', 'useful_data', 'blank', 'cover', null
 * @param {string} text
 * @returns {string|null}
 */
export function classifyNonQuestionPage(text) {
  if (!text || text.trim().length < 20) return 'blank';

  const t = text.toLowerCase();

  if (/^\s*$/.test(text)) return 'blank';

  // Instructions page: contains instructions header/candidate info and no MCQ options
  const hasInstructionHeader =
    /read\s+the\s+instructions|general\s+instructions?|instructions?\s+for\s+candidates?|candidate’s\s+signature|invigilator’s\s+signature|centre\s+of\s+examination/i.test(text);
  const hasOptions = /\([A-Da-d]\)|\[[A-Da-d]\]/.test(text);

  if (hasInstructionHeader && !hasOptions) {
    return 'instructions';
  }

  if (
    (t.includes('instruction') || t.includes('general instruction')) &&
    !hasOptions &&
    (t.includes('roll number') || t.includes('test booklet') || t.includes('examination'))
  ) {
    return 'instructions';
  }

  if (t.includes('syllabus') && !hasOptions) {
    return 'syllabus';
  }

  // Index / Table of contents slides or pages
  if (
    (/table\s+of\s+contents|s\.?\s*no\.?\s+chapters?|chapters?\s+total\s+questions|total\s+questions\s+page\s+no/i.test(t) ||
      (t.includes('index') && t.includes('chapters') && !hasOptions))
  ) {
    return 'syllabus';
  }

  // Cover page or blank page: very short text, mostly metadata or header furniture
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const cleanCharCount = text.replace(/\s+/g, '').length;
  const hasQuestionNumbers = /\b\d{1,3}\s*[.):]/.test(text);

  // Promotional or title intro slide without questions (only on very sparse/short pages)
  if (
    lines.length <= 4 &&
    !hasQuestionNumbers &&
    /learn\s+like\s+never\s+before|welcome\s+to|table\s+of\s+contents/i.test(t)
  ) {
    return 'cover';
  }

  if (
    /useful\s+data|physical\s+constants?|fundamental\s+constants?/i.test(text) &&
    !hasOptions
  ) {
    return 'useful_data';
  }

  if (/rough\s*work|space\s*for\s*rough\s*work/i.test(text) && !hasOptions) {
    return 'blank';
  }

  if (cleanCharCount < 60 && !hasQuestionNumbers && !hasOptions) {
    return 'blank';
  }

  if (lines.length <= 4 && !hasOptions && !hasQuestionNumbers) {
    return 'cover';
  }

  if (lines.length < 8 && !hasOptions && /test\s*code|roll\s*no|booklet|student\s*copy|faculty\s*copy/i.test(text)) {
    return 'cover';
  }

  return null;
}

/**
 * Parses the instruction text from one or more pages (concatenated or joined)
 * and returns structured exam metadata.
 * @param {string} instructionText
 * @returns {ParsedInstructions}
 */
export function parseInstructions(instructionText) {
  const result = {
    examTimeMinutes: null,
    maxMarks: null,
    sections: [],
    hasNegativeMarking: false,
    nonQuestionPageTypes: [],
  };

  if (!instructionText) return result;

  // --- Time ---
  const hoursMatch = TIME_HOURS_PATTERN.exec(instructionText);
  if (hoursMatch) {
    const rawH = hoursMatch[1].toLowerCase();
    const hours = WORD_TO_NUM[rawH] || parseInt(rawH, 10);
    const mins = parseInt(hoursMatch[2] || '0', 10);
    result.examTimeMinutes = hours * 60 + (Number.isNaN(mins) ? 0 : mins);
  } else {
    const timeMatch = TIME_PATTERN.exec(instructionText);
    if (timeMatch) {
      const val = parseInt(timeMatch[1], 10);
      // If unit is hours, convert
      result.examTimeMinutes = timeMatch[0].toLowerCase().includes('hr') ? val * 60 : val;
    }
  }

  // --- Max marks ---
  const marksMatch = MAX_MARKS_PATTERN.exec(instructionText) || TOTAL_MARKS_PATTERN.exec(instructionText);
  if (marksMatch) result.maxMarks = parseInt(marksMatch[1], 10);

  // --- Negative marking ---
  if (NEGATIVE_PATTERN.test(instructionText)) result.hasNegativeMarking = true;
  if (/no\s+negative\s+marking/i.test(instructionText)) result.hasNegativeMarking = false;

  // --- Section specs ---
  const lines = instructionText.split('\n');
  for (const line of lines) {
    if (INTEGER_SECTION_PATTERN.test(line)) {
      const spec = { name: line.trim().slice(0, 60), type: 'INTEGER' };
      const countMatch = Q_COUNT_PATTERN.exec(line);
      if (countMatch) spec.count = parseInt(countMatch[1], 10);
      const posMatch = MARKING_PATTERN.exec(line);
      if (posMatch) spec.correct = parseFloat(posMatch[1]);
      const negMatch = NEGATIVE_PATTERN.exec(line);
      if (negMatch) spec.negative = parseFloat(negMatch[1]);
      result.sections.push(spec);
    } else if (MULTI_CORRECT_PATTERN.test(line)) {
      const spec = { name: line.trim().slice(0, 60), type: 'MULTIPLE' };
      const countMatch = Q_COUNT_PATTERN.exec(line);
      if (countMatch) spec.count = parseInt(countMatch[1], 10);
      result.sections.push(spec);
    } else if (MCQ_SECTION_PATTERN.test(line)) {
      const spec = { name: line.trim().slice(0, 60), type: 'MCQ' };
      const countMatch = Q_COUNT_PATTERN.exec(line);
      if (countMatch) spec.count = parseInt(countMatch[1], 10);
      result.sections.push(spec);
    }
  }

  return result;
}

/**
 * Builds a marking scheme object from ParsedInstructions, with
 * per-section overrides where available.
 * Falls back to the app DEFAULT_SETTINGS values.
 * @param {ParsedInstructions} instructions
 * @param {object} defaults  { correctMarks, negativeMarks, skipMarks }
 * @returns {{ global: object, sections: Map<string, object> }}
 */
export function buildMarkingScheme(instructions, defaults) {
  const global = { ...defaults };

  if (instructions.sections.length > 0) {
    // Use first MCQ section's marking if available
    const mcq = instructions.sections.find((s) => s.type === 'MCQ');
    if (mcq?.correct) global.correctMarks = mcq.correct;
    if (mcq?.negative) global.negativeMarks = mcq.negative;
  }

  const sectionMap = new Map();
  for (const spec of instructions.sections) {
    const marking = {
      correctMarks: spec.correct ?? global.correctMarks,
      negativeMarks: spec.negative ?? global.negativeMarks,
      skipMarks: spec.skip ?? 0,
      type: spec.type,
    };
    sectionMap.set(spec.name, marking);
  }

  return { global, sections: sectionMap };
}
