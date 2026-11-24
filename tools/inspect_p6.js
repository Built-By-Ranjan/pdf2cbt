import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { annotateSubjects } from '../src/services/subjectDetector.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = await extractAllPages(doc);
  const p6 = pages.find(p => p.pageNumber === 6);
  console.log('--- PAGE 6 LINES ---');
  for (let i = 0; i < 10; i++) {
    console.log(`Line ${i}:`, p6.lines[i]);
  }

  const cleaned = cleanPages([p6]);
  const norm = normalizePages(cleaned);
  const tokens = tokenizePages(norm);
  const sec = annotateSections(tokens);
  const sub = annotateSubjects(sec);

  console.log('\n--- PAGE 6 TOKENS ---');
  for (let i = 0; i < 10; i++) {
    console.log(`Token ${i}: type=${sub[i].type} sec=${sub[i].section} subj=${sub[i].subject} text="${sub[i].text}"`);
  }
}

run().catch(console.error);
