import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const f = 'P:/work/ptocbt/Adi/Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = 1; p <= 34; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (let i = 0; i < tc.items.length; i++) {
      const it = tc.items[i];
      // check if it looks like a question number: 45, 46, 47, 48, 49, 50, 62, 63, 64, 65
      const m = it.str.match(/^\s*(\d{1,3})\s*$/);
      const m2 = it.str.match(/^\s*(\d{1,3})\s*[.)]/);
      const val = m ? parseInt(m[1], 10) : (m2 ? parseInt(m2[1], 10) : null);
      if (val && [45, 46, 47, 48, 49, 50, 61, 62, 63, 64, 65, 66].includes(val)) {
        console.log(`P${p}: Q${val} at x=${it.transform[4].toFixed(1)}, y=${it.transform[5].toFixed(1)}, str="${it.str}"`);
      }
    }
    page.cleanup();
  }
}

main().catch(console.error);
