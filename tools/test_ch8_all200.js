import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const f = 'P:/work/ptocbt/Adi/Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf';
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const qRegex = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/;
  const foundQNums = new Set();

  for (let pNum = 1; pNum <= doc.numPages; pNum++) {
    const page = await doc.getPage(pNum);
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
      } else if (x < 60 || (x >= 250 && x <= 310)) {
        let combinedStr = it.str;
        let curX = x;
        let matchedTokens = 0;
        for (let j = 1; j <= 4; j++) {
          const nextIt = tc.items[i + j];
          if (nextIt && Math.abs(nextIt.transform[5] - y) < 4 && nextIt.transform[4] >= curX && (nextIt.transform[4] - curX) < 25) {
            combinedStr += nextIt.str;
            curX = nextIt.transform[4];
            const testM = combinedStr.match(/^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/);
            if (testM) {
              qNum = parseInt(testM[1], 10);
              matchedTokens = j;
              break;
            }
          } else {
            break;
          }
        }
        if (matchedTokens > 0) {
          i += matchedTokens;
        }
      }

      if (qNum && qNum > 0 && qNum <= 350) {
        foundQNums.add(qNum);
      }
    }
    page.cleanup();
  }

  const missing = [];
  for (let i = 1; i <= 200; i++) {
    if (!foundQNums.has(i)) missing.push(i);
  }
  console.log(`Total found: ${foundQNums.size} / 200`);
  console.log(`Missing:`, missing);
}

main().catch(console.error);
