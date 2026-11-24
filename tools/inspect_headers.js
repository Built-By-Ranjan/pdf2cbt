import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { detectSubjectFromLine } from '../src/services/subjectDetector.js';

// Load and tokenize Page 4
async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (const pageNum of [4, 6, 8]) {
    const page = await doc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // simple lines
    const text = tc.items.map(it => it.str).join(' ');
    console.log(`\n=== PAGE ${pageNum} RAW FIRST 300 CHARS ===`);
    console.log(text.slice(0, 300));
  }
}

run().catch(console.error);
