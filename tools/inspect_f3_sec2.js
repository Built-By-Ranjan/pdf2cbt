import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file3Actual = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3Actual));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = await extractAllPages(doc);
  // find Section II on math
  for (const p of pages) {
    if (p.text.includes('SECTION - II') || p.text.includes('21.')) {
      console.log(`\n=== PAGE ${p.pageNumber} ===`);
      const lines = p.lines.filter(l => /21\.|22\.|Ans\.|Sol\./i.test(l.text));
      for (const l of lines) {
        console.log(`  "${l.text}"`);
      }
    }
  }
}

run().catch(console.error);
