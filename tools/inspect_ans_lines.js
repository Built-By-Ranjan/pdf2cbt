import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { extractInlineAnswerAndSolution, isAnswerOrSolutionLine } from '../src/services/inlineAnswerDetector.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file3Actual = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3Actual));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = await extractAllPages(doc);

  for (const p of pages) {
    if (p.pageNumber < 3 || p.pageNumber > 19) continue;
    for (const l of p.lines) {
      if (/ans/i.test(l.text)) {
        const isAns = isAnswerOrSolutionLine(l.text);
        const res = extractInlineAnswerAndSolution(l.text);
        console.log(`P${p.pageNumber}: "${l.text}" -> isAns=${isAns}, extractedAns=${res.inlineAnswer}`);
      }
    }
  }
}

run().catch(console.error);
