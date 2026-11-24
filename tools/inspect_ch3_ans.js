import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh3() {
  const f = 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let p = doc.numPages - 3; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    console.log(`\n--- Page ${p} items count: ${tc.items.length} ---`);
    for (const it of tc.items.slice(0, 30)) {
      console.log(`x=${it.transform[4].toFixed(1)}, y=${it.transform[5].toFixed(1)}: "${it.str}"`);
    }
    const raw = tc.items.map(i => i.str).join(' ');
    const idx = raw.indexOf('72');
    if (idx !== -1) {
      console.log('Around 72:', raw.substring(Math.max(0, idx - 40), idx + 100));
    }
  }
}

checkCh3().catch(console.error);
