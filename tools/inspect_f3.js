import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { annotateSubjects } from '../src/services/subjectDetector.js';
import { parseQuestions } from '../src/services/questionParser.js';
import { classifyNonQuestionPage } from '../src/services/instructionParser.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file3 = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);
  const questionPages = extractedPages.filter(p => !classifyNonQuestionPage(p.text));
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  console.log('--- SAMPLE OF QUESTIONS IN FILE 3 WITHOUT INLINE ANSWER ---');
  const withoutAns = questions.filter(q => !q.inlineAnswer);
  for (let i = 0; i < Math.min(10, withoutAns.length); i++) {
    const q = withoutAns[i];
    console.log(`\nQ#${q.number} (page ${q.page}) [${q.subject}]:`);
    console.log(`  Question text: "${q.question.slice(0, 100)}"`);
    console.log(`  Options (${q.options.length}):`, q.options.map(o => `${o.label}: ${o.text}`).join(' | '));
    console.log(`  Solution text: "${q.solutionText?.slice(0, 70)}"`);
  }
}

run().catch(console.error);
