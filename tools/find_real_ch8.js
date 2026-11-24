import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function findReal() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 4; p <= 34; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (/\b(?:8|47|48|63|64|65)\b/.test(it.str)) {
        if (/^\s*(?:Q\.?\s*)?(?:8|47|48|63|64|65)\s*[.:)]/.test(it.str) || it.str.trim() === '8' || it.str.trim() === '47') {
          console.log(`Page ${p}: "${it.str}" at x=${it.transform[4].toFixed(1)}, y=${it.transform[5].toFixed(1)}`);
        }
      }
    }
    page.cleanup();
  }
}

findReal().catch(console.error);
