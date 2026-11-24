import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkAns() {
  const f = 'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const found = new Map();
  for (let p = doc.numPages - 3; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const raw = tc.items.map(i => i.str).join(' ');
    console.log(`Page ${p} raw length: ${raw.length}`);
    const matches = raw.matchAll(/(?:Q\.?\s*)?(\d{1,3})\s*[.:\-–)]\s*\(?([A-Da-d0-9.-]+)\)?/g);
    for (const m of matches) {
      const q = parseInt(m[1], 10);
      if (q >= 1 && q <= 200) {
        found.set(q, m[2]);
      }
    }
  }
  for (let i = 1; i <= 200; i++) {
    if (!found.has(i)) {
      console.log(`Missing answer key for Q${i}`);
    }
  }
}

checkAns().catch(console.error);
