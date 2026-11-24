import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { classifyNonQuestionPage } from '../paper2cbt/src/services/instructionParser.js';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function testSlidePages(filename) {
  console.log(`\n=== Testing Slide Pages for ${filename} ===`);
  const filePath = path.join(ADI_DIR, filename);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let coverCount = 0;
  let keyCount = 0;
  let qPages = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(i => i.str).join(' ').trim();
    const lines = text.split('\n').filter(l => l.trim().length > 0);

    const isAnsKey = /answer\s*key/i.test(text);
    const isCover = p === 1 || (/index|table of contents|s\.no\.\s+chapters/i.test(text) && !isAnsKey);

    if (isCover) {
      coverCount++;
      // console.log(`  P${p}: Cover / Index`);
    } else if (isAnsKey) {
      keyCount++;
      // console.log(`  P${p}: Answer Key`);
    } else {
      qPages.push(p);
    }
    page.cleanup();
  }

  console.log(`Total: ${doc.numPages} pages | Cover/Index: ${coverCount} | Answer Key: ${keyCount} | Question Pages: ${qPages.length}`);
}

async function run() {
  await testSlidePages('Challenge 1_All PYQs of JEE Main 2019.pdf');
  await testSlidePages('Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf');
  await testSlidePages('Challenge 13_Top 100 Graphical Questions.pdf');
}

run();
