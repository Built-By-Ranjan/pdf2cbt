import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const file3Actual = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3Actual));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let totalAnsMatches = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    const text = tc.items.map(it => it.str).join(' ');
    const matches = [...text.matchAll(/ans(?:wer)?\.?\s*[:.]?\s*\(?\s*([A-Za-z0-9]+)\s*\)?/gi)];
    if (matches.length > 0) {
      console.log(`Page ${i}: ${matches.length} ans matches ->`, matches.map(m => m[0]).join(', '));
      totalAnsMatches += matches.length;
    }
  }
  console.log('Total Ans occurrences in entire document text:', totalAnsMatches);
}

run().catch(console.error);
