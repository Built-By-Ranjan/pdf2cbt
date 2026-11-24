import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function testCh8() {
  const f = 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const qRegex = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/;
  const found = new Set();

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rawText = tc.items.map(it => it.str).join(' ');

    if (
      /^\s*200\s+PHYSICS\s+QUESTIONS/i.test(rawText) ||
      /INTRODUCTION\s+PHYSICS\s+EDUNITI/i.test(rawText) ||
      (/INDEX/i.test(rawText) && (/Chapter/i.test(rawText) || /S\.No/i.test(rawText) || /Page\s+No/i.test(rawText))) ||
      /OFFICIAL\s+ANSWER\s+KEY/i.test(rawText) ||
      /FILL\s+YOUR\s+ANSWER/i.test(rawText) ||
      /TABLE\s+OF\s+CONTENTS/i.test(rawText)
    ) {
      page.cleanup();
      continue;
    }

    for (let i = 0; i < tc.items.length; i++) {
      const it = tc.items[i];
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];

      let qNum = null;
      const m = it.str.match(qRegex);
      if (m) {
        qNum = parseInt(m[1], 10);
      } else if (/^\s*(?:Q\.?\s*)?(\d{1,3})\s*$/.test(it.str) && (x < 60 || (x >= 250 && x <= 310))) {
        // Look ahead for dot in next few items
        for (let j = 1; j <= 3; j++) {
          const nextIt = tc.items[i + j];
          if (nextIt && /^\s*[.)]/.test(nextIt.str) && Math.abs(nextIt.transform[5] - y) < 4) {
            qNum = parseInt(it.str.trim(), 10);
            break;
          }
        }
      }

      if (qNum && qNum > 0 && qNum <= 200) {
        found.add(qNum);
      }
    }
    page.cleanup();
  }

  const missing = [];
  for (let i = 1; i <= 200; i++) {
    if (!found.has(i)) missing.push(i);
  }
  console.log(`Challenge 8 questions found: ${found.size}/200. Missing: ${missing.length > 0 ? missing.join(', ') : 'NONE! 100%'}`);
}

testCh8().catch(console.error);
