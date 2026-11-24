import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { annotateSubjects } from '../src/services/subjectDetector.js';
import { parseQuestions } from '../src/services/questionParser.js';
import { classifyNonQuestionPage, parseInstructions } from '../src/services/instructionParser.js';
import { extractAllPages } from './test_extract_helper.js';
import { extractAnswerKey } from '../src/services/answerKeyService.js';
import { computeResult } from '../src/services/scoringService.js';
import { DEFAULT_SETTINGS } from '../src/utils/constants.js';

async function run() {
  console.log('Loading File 3 for end-to-end scoring simulation...');
  const file3Path = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3Path));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);
  const questionPages = extractedPages.filter(p => !classifyNonQuestionPage(p.text));
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);
  const answerKey = extractAnswerKey(subjectAnnotated, questions);

  console.log(`Parsed ${questions.length} questions, answer key size: ${answerKey ? answerKey.size : 0}`);

  // Simulate user responses:
  // - Questions 1-20 (Maths MCQ): answer correctly
  // - Questions 21-25 (Maths Integer): answer 3 correctly, 1 wrongly, skip 1
  // - Questions 26-35 (Physics MCQ): answer correctly
  // - Questions 36-45 (Physics MCQ): answer wrongly
  // - Questions 46-50 (Physics Integer): skip
  // - Questions 51-75 (Chemistry): skip
  const responses = new Map();

  // Maths 1-20
  for (let i = 1; i <= 20; i++) {
    responses.set(i, answerKey.get(i));
  }
  // Maths 21-25 (Integer)
  responses.set(21, answerKey.get(21));
  responses.set(22, answerKey.get(22));
  responses.set(23, answerKey.get(23));
  responses.set(24, '999'); // wrong
  // 25 skipped

  // Physics 26-35: correct
  for (let i = 26; i <= 35; i++) {
    responses.set(i, answerKey.get(i));
  }
  // Physics 36-45: wrong
  for (let i = 36; i <= 45; i++) {
    const correctAns = answerKey.get(i);
    const wrongAns = correctAns === 'A' ? 'B' : 'A';
    responses.set(i, wrongAns);
  }

  const marking = {
    ...DEFAULT_SETTINGS,
    correctMarks: 4,
    negativeMarks: 1,
    skipMarks: 0,
  };

  const result = computeResult(questions, responses, answerKey, marking);

  console.log('\n--- SIMULATED EXAM RESULT ---');
  console.log(`Total: ${result.total}`);
  console.log(`Attempted: ${result.attempted}, Skipped: ${result.skipped}`);
  console.log(`Correct: ${result.correct}, Wrong: ${result.wrong}`);
  console.log(`Score: ${result.score} / ${result.maxPossibleScore} (${result.percentage}%)`);
  console.log(`Accuracy: ${result.accuracy}%`);

  console.log('\n--- SUBJECT-WISE BREAKDOWN ---');
  result.sectionWise.forEach(s => {
    console.log(`  ${s.section}: Total=${s.total}, Correct=${s.correct}, Wrong=${s.wrong}, Score=${s.score}/${s.maxScore} (${s.percentage}%)`);
  });

  // Verify correctness of simulation:
  // Expected correct: 20 (Maths MCQ) + 3 (Maths Int) + 10 (Physics MCQ) = 33
  // Expected wrong: 1 (Maths Int) + 10 (Physics MCQ) = 11
  // Expected score: 33 * 4 - 11 * 1 = 132 - 11 = 121
  if (result.correct === 33 && result.wrong === 11 && result.score === 121) {
    console.log('\n>>> SCORING VERIFICATION: 100% SUCCESSFUL <<<');
  } else {
    console.error('\n>>> SCORING MISMATCH! Expected correct: 33, wrong: 11, score: 121');
  }
}

run().catch(console.error);
