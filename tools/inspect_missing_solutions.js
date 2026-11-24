import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../paper2cbt/src/services/pageCleaner.js';
import { normalizePages } from '../paper2cbt/src/services/normalizer.js';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';
import { classifyNonQuestionPage } from '../paper2cbt/src/services/instructionParser.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const filePath = 'P:/work/ptocbt/test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf';
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);
  const questionPages = extractedPages.filter(p => !classifyNonQuestionPage(p.text));
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  const missing = questions.filter(q => !q.solutionText);
  console.log(`Missing solution count: ${missing.length} / ${questions.length}`);
  console.log('Missing question numbers:', missing.map(q => q.number));

  missing.forEach(q => {
    console.log(`\n--- Question ${q.number} (${q.subject}, type: ${q.type}) ---`);
    console.log('Text:', q.question.slice(0, 100));
    console.log('InlineAns:', q.inlineAnswer);
    // Find tokens for this question
    const qTokens = subjectAnnotated.filter(t => t.page === q.page);
    console.log(`Tokens on page ${q.page}:`);
    let found = false;
    for (const t of qTokens) {
      if (t.text.includes(String(q.number) + '.') || t.text.includes('Question ' + String(q.number))) {
        found = true;
      }
      if (found) {
        console.log(`  [${t.type}] ${t.text.slice(0, 80)}`);
        if (t.text.includes('Sol') || t.text.includes('Ans')) {
          console.log(`    ^^^ ANS/SOL TOKEN: "${t.text}"`);
        }
        // stop if next question
        if (t.type === 'QUESTION_START' && !t.text.includes(String(q.number))) {
          break;
        }
      }
    }
  });
}

run().catch(console.error);
