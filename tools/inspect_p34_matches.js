import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkP34() {
  const f = 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(34);
  const tc = await page.getTextContent();
  const raw = tc.items.map(i => i.str).join(' ');

  const re = /(\b\d{1,3})\s*(?:[.]|\s{2,})\s*([A-Za-z0-9]+)/g;
  const matches = [...raw.matchAll(re)];
  console.log(`Found ${matches.length} matches with re.`);
  const qMap = new Map();
  for (const m of matches) {
    const q = parseInt(m[1], 10);
    const ans = m[2];
    if (q >= 1 && q <= 100 && !qMap.has(q) && !/^(PAGE|YEAR|JEE|MAIN|TOTAL|ANS|TOP|QUESTIONS|PHYSICS)$/i.test(ans)) {
      qMap.set(q, ans);
    }
  }
  const missing = [];
  for (let i = 1; i <= 100; i++) {
    if (!qMap.has(i)) missing.push(i);
  }
  console.log(`Missing on P34 (out of 100): ${missing.length > 0 ? missing.join(', ') : 'NONE! 100% matched!'}`);
  console.log('Q31:', qMap.get(31));
}

checkP34().catch(console.error);
