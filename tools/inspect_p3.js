import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh8P3() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(3);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (/^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/.test(it.str)) {
      console.log(`P3 item: "${it.str}" at x=${it.transform[4]}, y=${it.transform[5]}`);
    }
  }
}

checkCh8P3().catch(console.error);
