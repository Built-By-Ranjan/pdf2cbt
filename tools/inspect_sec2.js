import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = await extractAllPages(doc);
  const p5 = pages.find(p => p.pageNumber === 5);
  const cleaned = cleanPages([p5]);
  const norm = normalizePages(cleaned);
  const tokens = tokenizePages(norm);
  const sec = annotateSections(tokens);

  for (let i = 0; i < sec.length; i++) {
    const t = sec[i];
    if (/section/i.test(t.text)) {
      console.log(`Token ${i}: type=${t.type} text="${t.text}" sec="${t.section}" secInt=${t.sectionIsInteger}`);
    }
  }
}

run().catch(console.error);
