import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function find47() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (/^\s*(?:Q\.?\s*)?(?:8|47|48|63|64|65)\s*[.)]/.test(it.str)) {
        console.log(`P${p}: found exact item: "${it.str}" at x=${it.transform[4]}, y=${it.transform[5]}`);
      }
    }
  }
}

find47().catch(console.error);
