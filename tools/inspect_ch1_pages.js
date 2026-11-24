import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function run() {
  const filePath = path.join(ADI_DIR, 'Challenge 1_All PYQs of JEE Main 2019.pdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 2; p <= 8; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    console.log(`\n--- Page ${p} ---`);
    const lines = tc.items.filter(i => i.str && i.str.trim());
    lines.forEach(l => console.log(`  [y=${l.transform[5].toFixed(1)}, x=${l.transform[4].toFixed(1)}] ${l.str}`));
  }
}

run();
