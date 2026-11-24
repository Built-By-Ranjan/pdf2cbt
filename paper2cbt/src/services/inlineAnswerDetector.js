// inlineAnswerDetector.js
// Phase D: Detects inline answers and solutions embedded within question text.
// Handles:
//   "Ans. (C)"         — common in faculty/answer copies
//   "Ans: B"
//   "Answer: (D)"
//   "Ans.(C)  Sol. ..."
//   "Sol. The force is..."  (solution text without an explicit answer)
//   Also detects solution blocks that follow the question.
//
// The detector runs on each question's accumulated text BEFORE it is finalized,
// strips the answer/solution parts from the visible question text, and stores
// them in separate fields:
//   question.inlineAnswer: string | null    e.g. "C"
//   question.solutionText: string | null    the solution prose
//
// This runs inside questionParser.js when finalizing each question.

// Matches "Ans. (C)", "Ans: B", "Answer: (D)", "Ans.(C)", "Ans ( 2 )", "Ans. (4)"
const INLINE_ANS_PATTERN =
  /\bans(?:wer)?\s*\.?\s*[:.]?\s*\(?\s*([A-Za-z]|-?\d+(?:\.\d+)?)\s*\)?/i;

// Matches "Sol." or "Solution:" or "Explanation:" at the start of a line
const SOL_START_PATTERN =
  /(?:^|\n)\s*(?:sol(?:ution)?|explanation|hint)\s*[.:–-]?\s*/i;

// Matches the full "Ans. (C) Sol. ..." block at the end of question text
const ANS_SOL_BLOCK_PATTERN =
  /\bans(?:wer)?\s*\.?\s*[:.]?\s*\(?\s*([A-Za-z]|-?\d+(?:\.\d+)?)\s*\)?\s*\.?\s*(?:sol(?:ution)?|explanation|hint)?\s*[.:–-]?\s*([\s\S]*)?$/i;

/**
 * Strips inline answer and solution from question text.
 * @param {string} fullText  the accumulated question text (may include "Ans. (C) Sol. ...")
 * @returns {{ cleanText: string, inlineAnswer: string|null, solutionText: string|null }}
 */
export function extractInlineAnswerAndSolution(fullText) {
  if (!fullText) return { cleanText: '', inlineAnswer: null, solutionText: null };

  let inlineAnswer = null;
  let solutionText = null;
  let cleanText = fullText;

  // Try to match the full Ans+Sol block at the end of the text
  const ansSolMatch = ANS_SOL_BLOCK_PATTERN.exec(fullText);
  if (ansSolMatch) {
    const raw = ansSolMatch[1]?.trim();
    inlineAnswer = /^[a-zA-Z]$/.test(raw) ? raw.toUpperCase() : raw;
    solutionText = ansSolMatch[2]?.trim() || null;
    // Strip the entire block from the question text
    cleanText = fullText.slice(0, ansSolMatch.index).trim();
  } else {
    // Try just an answer without a solution
    const ansMatch = INLINE_ANS_PATTERN.exec(fullText);
    if (ansMatch) {
      const raw = ansMatch[1]?.trim();
      inlineAnswer = /^[a-zA-Z]$/.test(raw) ? raw.toUpperCase() : raw;
      cleanText = fullText.slice(0, ansMatch.index).trim();
      // Check if there's a solution after the answer
      const afterAns = fullText.slice(ansMatch.index + ansMatch[0].length);
      const solMatch = SOL_START_PATTERN.exec(afterAns);
      if (solMatch) {
        solutionText = afterAns.slice(solMatch.index + solMatch[0].length).trim() || null;
      }
    } else {
      // Check for a standalone solution block
      const solMatch = SOL_START_PATTERN.exec(fullText);
      if (solMatch) {
        solutionText = fullText.slice(solMatch.index + solMatch[0].length).trim() || null;
        cleanText = fullText.slice(0, solMatch.index).trim();
      }
    }
  }

  return {
    cleanText,
    inlineAnswer: inlineAnswer || null,
    solutionText: solutionText || null,
  };
}

/**
 * Checks whether an option text looks like a solution line that was
 * accidentally parsed as an option (e.g. "Ans. (C)" or "Sol. The velocity...").
 * Returns true if the text should be DISCARDED from options.
 * @param {string} optionText
 * @returns {boolean}
 */
export function isAnswerOrSolutionLine(optionText) {
  if (!optionText) return false;
  if (INLINE_ANS_PATTERN.test(optionText)) return true;
  if (/^\s*sol(?:ution)?\s*[.:-]/i.test(optionText)) return true;
  if (/^\s*explanation\s*[.:-]/i.test(optionText)) return true;
  return false;
}

/**
 * Builds an answer key from inline answers found in questions.
 * Maps question number → correct answer label.
 * @param {Array<{number:number, inlineAnswer:string|null}>} questions
 * @returns {Map<number, string>|null}
 */
export function buildAnswerKeyFromInline(questions) {
  const map = new Map();
  for (const q of questions) {
    if (q.inlineAnswer) map.set(q.number, q.inlineAnswer);
  }
  return map.size > 0 ? map : null;
}
