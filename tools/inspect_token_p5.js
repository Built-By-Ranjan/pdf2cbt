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
  const cleaned = cleanPages(pages);
  const norm = normalizePages(cleaned);
  const cp5 = norm.find(p => p.pageNumber === 5);
  for (let i = 24; i <= 30; i++) {
    console.log(`norm line ${i}:`, cp5.lines[i]);
  }

  const tokens = tokenizePages([cp5]);
  for (let i = 24; i <= 30; i++) {
    console.log(`token ${i}:`, tokens[i]);
  }
}

run().catch(console.error);
