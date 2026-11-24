import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const p6 = await doc.getPage(6);
  const tc = await p6.getTextContent();
  for (let i = 0; i < tc.items.length; i++) {
    const it = tc.items[i];
    if (it.str && it.transform[5] > 720) {
      console.log(`Item ${i}: "${it.str}" x=${it.transform[4]}, y=${it.transform[5]}`);
    }
  }
}

run().catch(console.error);
