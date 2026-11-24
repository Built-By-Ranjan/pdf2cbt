import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { annotateSubjects } from '../src/services/subjectDetector.js';
import { parseQuestions } from '../src/services/questionParser.js';
import { extractAnswerKey } from '../src/services/answerKeyService.js';
import { classifyNonQuestionPage, parseInstructions } from '../src/services/instructionParser.js';
import { extractAllPages } from './test_extract_helper.js';

export async function testPdf(pdfPath) {
  console.log(`\n======================================================`);
  console.log(`TESTING: ${path.basename(pdfPath)}`);
  console.log(`======================================================`);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);
  console.log(`Extracted ${extractedPages.length} pages.`);

  const nonQuestionPages = new Set();
  const instructionTexts = [];
  for (const p of extractedPages) {
    const type = classifyNonQuestionPage(p.text);
    if (type) {
      nonQuestionPages.add(p.pageNumber);
      console.log(`Page ${p.pageNumber} non-question: ${type}`);
      if (type === 'instructions') instructionTexts.push(p.text);
    }
  }

  const instructions = parseInstructions(instructionTexts.join('\n'));
  console.log('Instructions parsed:', instructions);

  const questionPages = extractedPages.filter(p => !nonQuestionPages.has(p.pageNumber));
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);
  const answerKey = extractAnswerKey(subjectAnnotated, questions);

  console.log(`\nTOTAL QUESTIONS DETECTED: ${questions.length}`);
  const bySubject = {};
  const byType = {};
  for (const q of questions) {
    const subj = q.subject || 'Unknown';
    bySubject[subj] = (bySubject[subj] || 0) + 1;
    const key = `${subj}_${q.type}`;
    byType[key] = (byType[key] || 0) + 1;
  }
  console.log('Breakdown by Subject:', bySubject);
  console.log('Breakdown by Subject & Type:', byType);
  console.log('Answer key size:', answerKey ? answerKey.size : 0);

  const inlineCount = questions.filter(q => q.inlineAnswer).length;
  const solCount = questions.filter(q => q.solutionText).length;
  console.log(`Inline answers detected: ${inlineCount}, Solution texts detected: ${solCount}`);

  return { questions, answerKey, bySubject, byType };
}

async function run() {
  const dir = path.resolve('../test file');
  const files = [
    '114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf',
    '122004_IIT_EXCEL (May)_MINOR-04_[02-08-2026]_Student Copy.pdf',
    '133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf',
  ];

  for (const f of files) {
    await testPdf(path.join(dir, f));
  }
}

run().catch(console.error);
