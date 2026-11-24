import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { extractAllPages } from './test_extract_helper.js';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = await extractAllPages(doc);
  const p5 = pages.find(p => p.pageNumber === 5);
  console.log('p5 lines count:', p5.lines.length);
  for (let i = 0; i < p5.lines.length; i++) {
    if (/section/i.test(p5.lines[i].text)) {
      console.log(`p5 line ${i}:`, p5.lines[i]);
    }
  }

  const cleaned = cleanPages(pages);
  const cp5 = cleaned.find(p => p.pageNumber === 5);
  console.log('cleaned p5 lines count:', cp5.lines.length);
  for (let i = 0; i < cp5.lines.length; i++) {
    if (/section/i.test(cp5.lines[i].text)) {
      console.log(`cleaned p5 line ${i}:`, cp5.lines[i]);
    }
  }
}

run().catch(console.error);
