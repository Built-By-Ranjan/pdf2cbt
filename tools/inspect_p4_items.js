import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const p4 = await doc.getPage(4);
  const tc = await p4.getTextContent();
  for (let i = 0; i < tc.items.length; i++) {
    const it = tc.items[i];
    if (it.str && /part|math|section/i.test(it.str)) {
      console.log(`Item ${i}: "${it.str}" at x=${it.transform[4]}, y=${it.transform[5]}`);
    }
  }
}

run().catch(console.error);
