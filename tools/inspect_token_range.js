import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { classifyNonQuestionPage } from '../src/services/instructionParser.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);
  const questionPages = extractedPages.filter(p => !classifyNonQuestionPage(p.text));
  const cleaned = cleanPages(questionPages);
  const norm = normalizePages(cleaned);
  const tokens = tokenizePages(norm);
  const sec = annotateSections(tokens);

  for (let i = 75; i <= 85; i++) {
    console.log(`Token ${i}:`, sec[i]);
  }
}

run().catch(console.error);
