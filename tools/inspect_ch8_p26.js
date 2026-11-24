import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh8P26() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(26);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (it.str.includes('47') || it.str.includes('48')) {
      console.log(`item: "${it.str}"`);
    }
  }
}

checkCh8P26().catch(console.error);
