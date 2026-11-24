import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
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

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text.includes('20') || t.text.includes('21') || t.text.includes('SECTION')) {
      console.log(`Token ${i}: type=${t.type} text="${t.text}"`);
    }
  }
}

run().catch(console.error);
