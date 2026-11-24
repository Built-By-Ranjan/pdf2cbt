import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const f = 'P:/work/ptocbt/Adi/Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (const p of [11, 13, 14]) {
    console.log(`\n=== PAGE ${p} ===`);
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (let i = 0; i < tc.items.length; i++) {
      const it = tc.items[i];
      if (it.str.trim()) {
        console.log(`[i=${i}] x=${it.transform[4].toFixed(1)}, y=${it.transform[5].toFixed(1)}: "${it.str}"`);
      }
    }
    page.cleanup();
  }
}

main().catch(console.error);
