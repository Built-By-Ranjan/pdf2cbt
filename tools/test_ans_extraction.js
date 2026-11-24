import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

const ADI_FILES = [
  { file: 'Challenge 1_All PYQs of JEE Main 2019.pdf', id: 'challenge_1', expected: 24 },
  { file: 'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf', id: 'challenge_2', expected: 200 },
  { file: 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf', id: 'challenge_3', expected: 200 },
  { file: 'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf', id: 'challenge_4', expected: 200 },
  { file: 'Challenge 5_Top 200 Questions of JEE Main 2025 Physics.pdf', id: 'challenge_5', expected: 200 },
  { file: 'Challenge 6_Top 200 Questions of JEE Main 2021 Physics.pdf', id: 'challenge_6', expected: 200 },
  { file: 'Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf', id: 'challenge_7', expected: 100 },
  { file: 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf', id: 'challenge_8', expected: 200 },
  { file: 'Challenge 9_Theoretical Ques 2020 to 2023 JEE Main.pdf', id: 'challenge_9', expected: 141 },
  { file: 'Challenge 11_Rank Booster Questions Physics.pdf', id: 'challenge_11', expected: 20 },
  { file: 'Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf', id: 'challenge_14', expected: 30 },
  { file: 'Challenge 15_Top 50 Circuit Questions_Full Physics.pdf', id: 'challenge_15', expected: 50 },
];

async function testAnswerExtraction() {
  for (const entry of ADI_FILES) {
    const full = path.join(ADI_DIR, entry.file);
    const data = new Uint8Array(fs.readFileSync(full));
    const doc = await pdfjsLib.getDocument({ data }).promise;

    const answerKeyMap = new Map();
    const candidateTexts = [];

    for (let p = Math.max(1, doc.numPages - 6); p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const raw = tc.items.map(i => i.str).join(' ');

      // SKIP student fill-in sheets!
      if (/FILL\s+YOUR\s+ANSWER/i.test(raw)) {
        page.cleanup();
        continue;
      }

      candidateTexts.push(raw);

      // Pass 1: Strict dot-separated or colon-separated Q. ANS
      const matches = raw.matchAll(/(?:^|\s)(\d{1,3})\s*[.:\-–)]\s*([A-Za-z0-9]+)/g);
      for (const m of matches) {
        const qNum = parseInt(m[1], 10);
        let ans = m[2].trim().toUpperCase();
        if (qNum >= 1 && qNum <= entry.expected + 5 && !/^(PAGE|YEAR|JEE|MAIN|TOTAL|ANS|TOP|QUESTIONS|PHYSICS)$/i.test(ans)) {
          if (!answerKeyMap.has(qNum)) {
            answerKeyMap.set(qNum, ans);
          }
        }
      }
      page.cleanup();
    }

    // Pass 2: Targeted gap search for any missing Q
    for (let i = 1; i <= entry.expected; i++) {
      if (!answerKeyMap.has(i)) {
        const gapRegex = new RegExp(`(?:^|\\s)${i}\\s+([A-Za-z0-9]+)`, 'g');
        for (const text of candidateTexts) {
          const m = gapRegex.exec(text);
          if (m) {
            const ans = m[1].trim().toUpperCase();
            if (!/^(PAGE|YEAR|JEE|MAIN|TOTAL|ANS|TOP|QUESTIONS|PHYSICS)$/i.test(ans)) {
              answerKeyMap.set(i, ans);
              break;
            }
          }
        }
      }
    }

    const missing = [];
    for (let i = 1; i <= entry.expected; i++) {
      if (!answerKeyMap.has(i)) missing.push(i);
    }
    console.log(`${entry.id}: Found ${answerKeyMap.size}/${entry.expected}. Missing: ${missing.length > 0 ? missing.join(', ') : 'NONE! 100% matched!'}`);
  }
}

testAnswerExtraction().catch(console.error);
