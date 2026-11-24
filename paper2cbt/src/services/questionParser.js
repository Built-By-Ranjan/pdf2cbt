// questionParser.js
// Single responsibility: convert a flat, TYPED token stream (from tokenizer +
// sectionDetector) into structured question objects, via an explicit state
// machine — WAITING -> QUESTION -> OPTION -> IMAGE -> END.
//
// This is a complete rewrite of the old regex-driven line walker. Because
// tokenizer already classified every line's TYPE, this parser never needs to
// re-run marker regexes to decide "is this a new question" — it trusts
// QUESTION_START tokens absolutely, which also satisfies the hard
// requirement: a QUESTION_START token ALWAYS closes the current question and
// opens a new one. Question 2 can never be silently merged into Question 1.
//
// Phase D additions:
//   - Inline Ans. (C) / Sol. detection via inlineAnswerDetector
//   - inlineAnswer and solutionText stored on each question
//   - subject field propagated from token.subject
// Phase B additions:
//   - sectionIsInteger flag from sectionDetector forces INTEGER type
//   - displayNumber stored separately from internal ordering
// Phase C additions:
//   - INTEGER question type for no-option questions in integer sections
//   - Decimal-capable numeric input support

import { TOKEN_TYPES, PARSER_STATES, QUESTION_TYPES } from '../utils/constants';
import { matchQuestionStart, ASSERTION_REASON_PATTERN, TRUE_FALSE_PATTERN, MULTIPLE_CHOICE_HINT, NUMERICAL_ANSWER_HINT } from '../utils/regexPatterns';
import { matchOptionLine, splitInlineOptions, splitInlineOptionsWithPrefix, appendOptionContinuation } from './optionParser';
import { containsImageReference } from './tokenizer';
import { nextId } from '../utils/idGenerator';
import { extractInlineAnswerAndSolution, isAnswerOrSolutionLine } from './inlineAnswerDetector';

const MAX_OPTIONS_PER_QUESTION = 8; // guards against runaway false-positive option matches

function classifyQuestionType(questionText, options, sectionIsInteger, section) {
  // Integer section always overrides — no need for a hint in question text
  if (sectionIsInteger && options.length === 0) return QUESTION_TYPES.INTEGER;
  if (ASSERTION_REASON_PATTERN.test(questionText)) return QUESTION_TYPES.ASSERTION_REASON;
  if (options.length === 0) {
    if (NUMERICAL_ANSWER_HINT.test(questionText)) return QUESTION_TYPES.NUMERICAL;
    if (sectionIsInteger) return QUESTION_TYPES.INTEGER;
    // Section-I / MCQ section in exam papers: if options are graphs or images,
    // classify as SINGLE_CHOICE so option buttons appear on CBT screen.
    if (section && /section\s*[-–:]?\s*(?:I|1|A)\b/i.test(section)) {
      return QUESTION_TYPES.SINGLE_CHOICE;
    }
    return QUESTION_TYPES.SUBJECTIVE;
  }
  if (TRUE_FALSE_PATTERN.test(questionText) && options.length <= 2) return QUESTION_TYPES.TRUE_FALSE;
  if (MULTIPLE_CHOICE_HINT.test(questionText)) return QUESTION_TYPES.MULTIPLE_CHOICE;
  return QUESTION_TYPES.SINGLE_CHOICE;
}

/**
 * Extracts the option(s) represented by an OPTION_START token's raw text.
 * Tries inline splitting first (a single line containing several options),
 * falling back to a single option match.
 * Also filters out lines that look like "Ans. (C)" or "Sol. ..." (Phase D).
 * @param {string} text
 * @returns {Array<{label:string, text:string, isImageOption:boolean}>}
 */
function extractOptionsFromLine(text) {
  if (isAnswerOrSolutionLine(text)) return [];
  const inline = splitInlineOptions(text);
  if (inline.length >= 2) return inline;
  const single = matchOptionLine(text);
  return single ? [single] : [];
}

/**
 * Builds a fresh, empty question record.
 */
function createQuestion({ number, text, page, section, sectionIsInteger, subject }) {
  return {
    id: nextId('q'),
    number,
    displayNumber: number, // the number printed on the paper
    question: text || '',
    text: text || '',
    options: [],
    section: section || null,
    sectionIsInteger: sectionIsInteger || false,
    subject: subject || null,
    hasImage: false,
    page,
    pageNumber: page,
    type: QUESTION_TYPES.SINGLE_CHOICE,
    inlineAnswer: null,
    solutionText: null,
  };
}

/**
 * A question is only kept if it has real content — this discards phantom
 * questions created by an occasional false-positive QUESTION_START match on
 * a stray numbered line with no following content.
 */
function isValidQuestion(q) {
  return (
    Boolean(q) &&
    (q.question.trim().length > 0 ||
      q.options.length > 0 ||
      q.hasImage ||
      q.number !== null)
  );
}

/**
 * Parses a typed token stream into structured question objects using an
 * explicit state machine.
 * @param {Array<{type:string, text:string, page:number, section?:string|null, sectionIsInteger?:boolean, subject?:string|null}>} tokens
 * @returns {Array<object>}
 */
export function parseQuestions(tokens) {
  const questions = [];
  let current = null;
  let state = PARSER_STATES.WAITING;
  let imageReturnState = PARSER_STATES.WAITING;
  let sectionOrSubjectChanged = true;
  let lastSubject = null;
  let lastSection = null;

  const finalizeCurrent = () => {
    if (isValidQuestion(current)) {
      // Phase D: strip inline answer/solution from question text
      const { cleanText, inlineAnswer, solutionText } = extractInlineAnswerAndSolution(current.question);
      current.question = cleanText;
      if (inlineAnswer) current.inlineAnswer = inlineAnswer;
      if (solutionText) current.solutionText = solutionText;
      // If paper provided inline answer but no worked solution text, populate solutionText with answer
      if (!current.solutionText && current.inlineAnswer) {
        current.solutionText = `Ans. (${current.inlineAnswer})`;
      }
      current.text = current.question;

      current.type = classifyQuestionType(
        current.question,
        current.options,
        current.sectionIsInteger,
        current.section
      );

      // Phase C: If an MCQ question has no text options (e.g. options are graphs or diagrams),
      // synthesize default options A-D so CBT screen renders option buttons for the cropped image.
      if (
        current.type === QUESTION_TYPES.SINGLE_CHOICE &&
        current.options.length === 0
      ) {
        current.options = ['A', 'B', 'C', 'D'].map((label) => ({
          label,
          text: '',
          isImageOption: true,
        }));
      }

      current.options = current.options.slice(0, MAX_OPTIONS_PER_QUESTION);
      questions.push(current);
    }
    current = null;
  };

  for (const token of tokens) {
    if (state === PARSER_STATES.END) break; // answer-key section reached; stop parsing questions

    if (token.subject !== lastSubject || token.section !== lastSection) {
      sectionOrSubjectChanged = true;
      lastSubject = token.subject;
      lastSection = token.section;
    }

    switch (token.type) {
      case TOKEN_TYPES.QUESTION_START: {
        const marker = matchQuestionStart(token.text);

        // Guard against false-positive numbered lines inside question/option text:
        // Within the same subject & section:
        // 1. Numbers <= current.number (statements 1-4, math enumerations, or duplicates)
        // 2. Wild forward jumps (> current.number + 4) caused by OCR noise, formulas, or table percentages
        const isInternalOrNoise =
          current &&
          marker?.number &&
          current.number &&
          !sectionOrSubjectChanged &&
          (marker.number <= current.number || marker.number > current.number + 4);

        if (isInternalOrNoise) {
          // Treat as text continuation on current question or option
          if (state === PARSER_STATES.OPTION && current.options.length > 0) {
            const lastIndex = current.options.length - 1;
            current.options[lastIndex] = appendOptionContinuation(current.options[lastIndex], token.text);
          } else {
            current.question = `${current.question} ${token.text}`.trim();
          }
          break;
        }

        finalizeCurrent();
        sectionOrSubjectChanged = false;
        const remainder = marker ? token.text.slice(marker.matchedLength).trim() : token.text.trim();

        // The question marker and its options can be glued onto one line
        // ("Q2. Prime number? A) 4  B) 6  C) 7  D) 9") — the whole line
        // arrives as a single QUESTION_START token, so without this check
        // the inline options would be silently swallowed into the question
        // text instead of being parsed as options.
        const inline = splitInlineOptionsWithPrefix(remainder);
        const questionText = inline ? inline.prefix : remainder;

        current = createQuestion({
          number: marker?.number ?? null,
          text: questionText,
          page: token.page,
          section: token.section,
          sectionIsInteger: token.sectionIsInteger || false,
          subject: token.subject || null,
        });
        if (containsImageReference(questionText)) current.hasImage = true;

        if (inline) {
          current.options.push(...inline.options);
          if (inline.options.some((o) => o.isImageOption)) current.hasImage = true;
          state = PARSER_STATES.OPTION;
        } else {
          state = PARSER_STATES.QUESTION;
        }
        break;
      }

      case TOKEN_TYPES.OPTION_START: {
        if (!current) break; // an option line with no open question — stray content, ignore
        // Phase D: reject option lines that are actually answer/solution lines
        if (isAnswerOrSolutionLine(token.text)) {
          state = PARSER_STATES.SOLUTION;
          const { inlineAnswer, solutionText } = extractInlineAnswerAndSolution(token.text);
          if (inlineAnswer && !current.inlineAnswer) current.inlineAnswer = inlineAnswer;
          if (solutionText) {
            current.solutionText = (current.solutionText ? current.solutionText + ' ' : '') + solutionText;
          }
          break;
        }
        if (state === PARSER_STATES.SOLUTION) {
          // If already in solution, an apparent option line is actually part of worked solution
          current.solutionText = (current.solutionText ? current.solutionText + ' ' : '') + token.text;
          break;
        }
        const options = extractOptionsFromLine(token.text);
        if (options.length === 0) break;
        current.options.push(...options);
        if (options.some((o) => o.isImageOption)) current.hasImage = true;
        state = PARSER_STATES.OPTION;
        break;
      }

      case TOKEN_TYPES.IMAGE: {
        if (current) {
          current.hasImage = true;
          if (state === PARSER_STATES.OPTION && current.options.length > 0) {
            current.options[current.options.length - 1].isImageOption = true;
          }
        }
        imageReturnState = state === PARSER_STATES.IMAGE ? imageReturnState : state;
        state = PARSER_STATES.IMAGE;
        break;
      }

      case TOKEN_TYPES.TEXT: {
        if (state === PARSER_STATES.IMAGE) state = imageReturnState; // image line was standalone; resume prior context

        if (!current || state === PARSER_STATES.WAITING) break; // junk before first question

        // Phase D: solution state accumulation
        if (state === PARSER_STATES.SOLUTION) {
          if (isAnswerOrSolutionLine(token.text)) {
            const { inlineAnswer, solutionText } = extractInlineAnswerAndSolution(token.text);
            if (inlineAnswer && !current.inlineAnswer) current.inlineAnswer = inlineAnswer;
            if (solutionText) {
              current.solutionText = (current.solutionText ? current.solutionText + ' ' : '') + solutionText;
            }
          } else {
            current.solutionText = (current.solutionText ? current.solutionText + ' ' : '') + token.text;
          }
          break;
        }

        // Phase D: check if this TEXT token introduces an inline answer/solution
        if (isAnswerOrSolutionLine(token.text)) {
          state = PARSER_STATES.SOLUTION;
          const { inlineAnswer, solutionText } = extractInlineAnswerAndSolution(token.text);
          if (inlineAnswer && !current.inlineAnswer) current.inlineAnswer = inlineAnswer;
          if (solutionText) {
            current.solutionText = (current.solutionText ? current.solutionText + ' ' : '') + solutionText;
          }
          break;
        }

        if (state === PARSER_STATES.OPTION && current.options.length > 0) {
          const lastIndex = current.options.length - 1;
          current.options[lastIndex] = appendOptionContinuation(current.options[lastIndex], token.text);
          if (containsImageReference(token.text)) {
            current.options[lastIndex].isImageOption = true;
            current.hasImage = true;
          }
        } else if (state === PARSER_STATES.QUESTION) {
          current.question = `${current.question} ${token.text}`.trim();
          if (containsImageReference(token.text)) current.hasImage = true;
        }
        break;
      }

      case TOKEN_TYPES.ANSWER_KEY: {
        // Reaching the answer key means the question list is complete —
        // answerKeyService parses this section separately from the full
        // token list, so questionParser just stops here.
        finalizeCurrent();
        state = PARSER_STATES.END;
        break;
      }

      case TOKEN_TYPES.SECTION:
      case TOKEN_TYPES.HEADER:
      case TOKEN_TYPES.FOOTER:
      default:
        // No content impact; section text is already carried on each token
        // via sectionDetector, and header/footer noise was mostly stripped
        // upstream by pageCleaner.
        break;
    }
  }

  finalizeCurrent();

  // Phase D: Detect if question numbers restart per subject or contain duplicates:
  const seenNumbers = new Set();
  let hasDuplicates = false;
  for (const q of questions) {
    if (q.number !== null && seenNumbers.has(q.number)) {
      hasDuplicates = true;
      break;
    }
    if (q.number !== null) seenNumbers.add(q.number);
  }

  return questions.map((q, index) => {
    const origNumber = q.number ?? index + 1;
    return {
      ...q,
      number: hasDuplicates ? index + 1 : origNumber,
      displayNumber: origNumber,
    };
  });
}
