import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh13() {
  const f = 'Challenge 13_Top 100 Graphical Questions.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 95; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const raw = tc.items.map(i => i.str).join(' ');
    console.log(`Ch13 Page ${p} text: ${raw.slice(0, 300)}`);
  }
}

checkCh13().catch(console.error);
