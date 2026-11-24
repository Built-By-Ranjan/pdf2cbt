// scoringService.js
// Single responsibility: compute exam results from user responses. Supports
// positive/negative marking, partial credit on multiple-correct questions,
// per-question accuracy/percentage, and a section-wise breakdown.

import { QUESTION_TYPES } from '../utils/constants';

/**
 * @typedef {Object} MarkingScheme
 * @property {number} correctMarks
 * @property {number} negativeMarks   positive number; applied as a deduction
 * @property {number} skipMarks       usually 0
 * @property {boolean} [partialMarking] if true, multiple-correct questions
 *   award proportional credit for partially-correct selections instead of
 *   all-or-nothing
 */

/**
 * Compares two answers by value: handles string equality, letter-to-number
 * mapping (A=1, B=2, C=3, D=4), and floating point equality with 0.01 tolerance.
 */
function compareByValue(userVal, correctVal) {
  if (userVal === undefined || userVal === null || correctVal === undefined || correctVal === null) {
    return false;
  }
  const uStr = String(userVal).trim().replace(/^[([{<"']+|[)\]}>"']+$/g, '').trim().toUpperCase();
  const cStr = String(correctVal).trim().replace(/^[([{<"']+|[)\]}>"']+$/g, '').trim().toUpperCase();
  if (!uStr || !cStr) return false;
  if (uStr === cStr) return true;

  // Letter <-> Number mapping (A=1, B=2, C=3, D=4)
  const letterToNum = { A: '1', B: '2', C: '3', D: '4' };
  if (letterToNum[uStr] && letterToNum[uStr] === cStr) return true;
  if (letterToNum[cStr] && letterToNum[cStr] === uStr) return true;

  // Floating-point numeric comparison
  const uNum = parseFloat(uStr);
  const cNum = parseFloat(cStr);
  if (!Number.isNaN(uNum) && !Number.isNaN(cNum) && Math.abs(uNum - cNum) < 0.01) {
    return true;
  }

  return false;
}

function normalizeSelection(selected) {
  if (selected === undefined || selected === null || selected === '') return [];
  return Array.isArray(selected) ? selected : [selected];
}

/**
 * Scores a single multiple-correct-type question, optionally with partial
 * marking: full marks for an exact match, proportional credit for a
 * correct-but-incomplete subset (never for selecting any wrong option).
 * @param {string[]} selected
 * @param {string[]} correctLabels
 * @param {MarkingScheme} marking
 * @returns {{ outcome:string, marks:number }}
 */
function scoreMultipleCorrect(selected, correctLabels, marking) {
  const correctSet = new Set(correctLabels);
  const selectedSet = new Set(selected);
  const hasWrongSelection = [...selectedSet].some((label) => !correctSet.has(label));

  if (hasWrongSelection) {
    return { outcome: 'Wrong', marks: -Math.abs(marking.negativeMarks) };
  }

  const correctSelectedCount = [...selectedSet].filter((label) => correctSet.has(label)).length;
  if (correctSelectedCount === correctSet.size) {
    return { outcome: 'Correct', marks: marking.correctMarks };
  }
  if (correctSelectedCount > 0 && marking.partialMarking) {
    const partial = (marking.correctMarks * correctSelectedCount) / correctSet.size;
    return { outcome: 'Partially Correct', marks: Number(partial.toFixed(4)) };
  }
  return { outcome: 'Wrong', marks: -Math.abs(marking.negativeMarks) };
}

/**
 * @param {Array<object>} questions
 * @param {Map<number, string|string[]>} responses questionNumber -> selected label(s)
 * @param {Map<number, string|string[]>|null} answerKey questionNumber -> correct label(s)
 * @param {MarkingScheme} marking
 * @returns {object} full result including overall + per-question + section-wise breakdown
 */
export function computeResult(questions, responses, answerKey, marking) {
  const total = questions.length;
  let attempted = 0;
  let skipped = 0;

  const questionWise = questions.map((q) => {
    const selected = normalizeSelection(responses.get(q.number));
    const isAttempted = selected.length > 0;
    if (isAttempted) attempted += 1;
    else skipped += 1;

    return {
      number: q.number,
      question: q.question,
      section: q.section || null,
      subject: q.subject || null,
      type: q.type,
      selected: isAttempted ? (selected.length === 1 ? selected[0] : selected) : null,
      status: isAttempted ? 'Attempted' : 'Not Attempted',
    };
  });

  const base = { total, attempted, skipped, questionWise };

  if (!answerKey) {
    return { ...base, hasAnswerKey: false };
  }

  let correct = 0;
  let wrong = 0;
  let partiallyCorrect = 0;
  let score = 0;
  const sectionTotals = new Map(); // section -> { score, maxScore, correct, wrong, total }

  const scoredQuestionWise = questionWise.map((qw) => {
    const rawCorrectAnswer = answerKey.get(qw.number);
    const correctLabels = normalizeSelection(rawCorrectAnswer);
    const selectedLabels = normalizeSelection(qw.selected);

    let outcome = 'Skipped';
    let marks = marking.skipMarks || 0;

    if (qw.type === QUESTION_TYPES.SUBJECTIVE) {
      // Free-text answers aren't auto-gradable against a letter-based answer
      // key — report attempted/skipped without contributing to score.
      outcome = selectedLabels.length > 0 ? 'Not Auto-Graded' : 'Skipped';
    } else if (selectedLabels.length > 0 && correctLabels.length > 0) {
      if (qw.type === QUESTION_TYPES.MULTIPLE_CHOICE || correctLabels.length > 1) {
        ({ outcome, marks } = scoreMultipleCorrect(selectedLabels, correctLabels, marking));
      } else if (qw.type === QUESTION_TYPES.HYBRID) {
        // Hybrid: compare by value (letter match, number match, letter-to-number mapping, float comparison)
        const isCorrect = compareByValue(selectedLabels[0], correctLabels[0]);
        if (isCorrect) {
          outcome = 'Correct';
          marks = marking.correctMarks;
        } else {
          outcome = 'Wrong';
          marks = -Math.abs(marking.negativeMarks);
        }
      } else if (qw.type === QUESTION_TYPES.INTEGER || qw.type === QUESTION_TYPES.NUMERICAL) {
        // Phase C: Numeric comparison with small tolerance
        const userNum = parseFloat(selectedLabels[0]);
        const correctNum = parseFloat(correctLabels[0]);
        const isCorrect =
          !Number.isNaN(userNum) &&
          !Number.isNaN(correctNum) &&
          Math.abs(userNum - correctNum) < 0.01;

        if (isCorrect) {
          outcome = 'Correct';
          marks = marking.correctMarks;
        } else {
          outcome = 'Wrong';
          marks = -Math.abs(marking.negativeMarks);
        }
      } else {
        const isCorrect =
          selectedLabels.length === 1 &&
          String(selectedLabels[0]).trim().toUpperCase() ===
            String(correctLabels[0]).trim().toUpperCase();
        if (isCorrect) {
          outcome = 'Correct';
          marks = marking.correctMarks;
        } else {
          outcome = 'Wrong';
          marks = -Math.abs(marking.negativeMarks);
        }
      }
    }

    if (outcome === 'Correct') correct += 1;
    else if (outcome === 'Wrong') wrong += 1;
    else if (outcome === 'Partially Correct') partiallyCorrect += 1;

    score += marks;

    const sectionKey = qw.subject || qw.section || 'General';
    if (!sectionTotals.has(sectionKey)) {
      sectionTotals.set(sectionKey, { section: sectionKey, score: 0, maxScore: 0, correct: 0, wrong: 0, total: 0 });
    }
    const sectionEntry = sectionTotals.get(sectionKey);
    sectionEntry.score += marks;
    sectionEntry.maxScore += marking.correctMarks;
    sectionEntry.total += 1;
    if (outcome === 'Correct') sectionEntry.correct += 1;
    if (outcome === 'Wrong') sectionEntry.wrong += 1;

    return {
      ...qw,
      correctAnswer: correctLabels.length ? (correctLabels.length === 1 ? correctLabels[0] : correctLabels) : null,
      outcome,
      marks,
    };
  });

  const maxPossibleScore = total * marking.correctMarks;
  const percentage = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;
  const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

  return {
    total,
    attempted,
    skipped,
    hasAnswerKey: true,
    questionWise: scoredQuestionWise,
    correct,
    wrong,
    partiallyCorrect,
    score: Number(score.toFixed(4)),
    maxPossibleScore,
    percentage: Number(percentage.toFixed(2)),
    accuracy: Number(accuracy.toFixed(2)),
    sectionWise: [...sectionTotals.values()].map((s) => ({
      ...s,
      score: Number(s.score.toFixed(4)),
      percentage: s.maxScore > 0 ? Number(((s.score / s.maxScore) * 100).toFixed(2)) : 0,
    })),
  };
}
