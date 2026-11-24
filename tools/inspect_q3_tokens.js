import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file3 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const file3Actual = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3Actual));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = await extractAllPages(doc);
  const p3 = pages.find(p => p.pageNumber === 3);
  const cleaned = cleanPages([p3]);
  const norm = normalizePages(cleaned);
  const tokens = tokenizePages(norm);

  for (let i = 0; i < tokens.length; i++) {
    console.log(`Token ${i}: type=${tokens[i].type} text="${tokens[i].text}"`);
  }
}

run().catch(console.error);
