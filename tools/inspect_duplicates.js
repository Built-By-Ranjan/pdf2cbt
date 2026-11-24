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
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);

  const nonQuestionPages = new Set();
  for (const p of extractedPages) {
    const type = classifyNonQuestionPage(p.text);
    if (type) nonQuestionPages.add(p.pageNumber);
  }

  const questionPages = extractedPages.filter(p => !nonQuestionPages.has(p.pageNumber));
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  const counts = {};
  for (const q of questions) {
    counts[q.number] = (counts[q.number] || 0) + 1;
  }

  for (const [num, c] of Object.entries(counts)) {
    if (c > 1) {
      console.log(`\nDuplicate Q#${num} (count: ${c}):`);
      const matches = questions.filter(q => q.number === Number(num));
      for (const m of matches) {
        console.log(`  Page ${m.page} [${m.subject}]: "${m.question.slice(0, 70)}" (opts: ${m.options.length})`);
      }
    }
  }
}

run().catch(console.error);
