import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh8() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const qRegex = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      const m = it.str.match(qRegex);
      if (m) {
        const qNum = parseInt(m[1], 10);
        if ([8, 47, 48, 63, 64, 65].includes(qNum)) {
          console.log(`P${p} (w=${page.view[2]}, h=${page.view[3]}): Q${qNum} at x=${it.transform[4].toFixed(1)}, y=${it.transform[5].toFixed(1)}, text="${it.str}"`);
        }
      }
    }
    page.cleanup();
  }
}

checkCh8().catch(console.error);
