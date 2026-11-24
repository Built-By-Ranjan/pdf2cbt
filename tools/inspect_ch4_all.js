import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function run() {
  const filePath = path.join(ADI_DIR, 'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let totalQMarkers = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map(i => i.str).filter(s => s && s.trim());
    // Find numbers followed by dot e.g. "1.", "2."
    const qMatches = items.filter(s => /^\d{1,3}\.$/.test(s.trim()));
    if (qMatches.length > 0) {
      console.log(`Page ${p}: found ${qMatches.length} questions: [${qMatches.join(', ')}]`);
      totalQMarkers += qMatches.length;
    }
  }
  console.log(`Total question markers found across all pages: ${totalQMarkers}`);
}

run();
