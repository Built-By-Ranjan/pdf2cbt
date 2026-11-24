import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 4; p <= 9; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map(it => it.str).filter(Boolean);
    console.log(`\n================ PAGE ${p} ================`);
    for (let i = 0; i < items.length; i++) {
      const s = items[i];
      if (/^\s*\d{1,2}\s*[.)]?$/.test(s) || /^\s*1[0139]\b/.test(s) || /^\s*2[345]\b/.test(s) || /^\s*5[3456]\b/.test(s) || /^\s*71\b/.test(s)) {
        console.log(`Item ${i}: "${s}" next 5 items:`, items.slice(i, i + 6).join(' | '));
      }
    }
  }
}

run().catch(console.error);
