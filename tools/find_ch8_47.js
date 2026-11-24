import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const f = 'P:/work/ptocbt/Adi/Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  console.log('Doc pages:', doc.numPages);
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (let i = 0; i < tc.items.length; i++) {
      const it = tc.items[i];
      if (/\b(?:47|48|63|64)\b/.test(it.str)) {
        console.log(`P${p} [i=${i}]: x=${it.transform[4].toFixed(1)}, y=${it.transform[5].toFixed(1)}, str="${it.str}"`);
        // print neighboring items
        for (let j = -2; j <= 3; j++) {
          if (j !== 0 && tc.items[i + j]) {
            const nb = tc.items[i + j];
            console.log(`   nb[${j}]: x=${nb.transform[4].toFixed(1)}, y=${nb.transform[5].toFixed(1)}, str="${nb.str}"`);
          }
        }
      }
    }
    page.cleanup();
  }
}

main().catch(console.error);
