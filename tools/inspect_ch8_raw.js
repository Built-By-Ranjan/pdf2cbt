import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh8Pages() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const raw = tc.items.map(i => i.str).join(' ');
    for (const q of [47, 48, 63, 64, 65]) {
      if (raw.includes(`${q}.`)) {
        console.log(`P${p}: contains "${q}."`);
      }
    }
  }
}

checkCh8Pages().catch(console.error);
