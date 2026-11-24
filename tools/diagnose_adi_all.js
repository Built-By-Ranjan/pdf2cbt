import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

const ADI_FILES = [
  { file: 'Challenge 1_All PYQs of JEE Main 2019.pdf', id: 'challenge_1', title: 'Challenge 1: All PYQs of JEE Main 2019', isSlide: true, expected: 70 },
  { file: 'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf', id: 'challenge_2', title: 'Challenge 2: Top 200 Questions of JEE Main 2023 Physics', expected: 200 },
  { file: 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf', id: 'challenge_3', title: 'Challenge 3: Top 200 Questions of JEE Main 2024 Physics', expected: 200 },
  { file: 'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf', id: 'challenge_4', title: 'Challenge 4: Top 200 Questions of JEE Main 2022 Physics', expected: 200 },
  { file: 'Challenge 5_Top 200 Questions of JEE Main 2025 Physics.pdf', id: 'challenge_5', title: 'Challenge 5: Top 200 Questions of JEE Main 2025 Physics', expected: 200 },
  { file: 'Challenge 6_Top 200 Questions of JEE Main 2021 Physics.pdf', id: 'challenge_6', title: 'Challenge 6: Top 200 Questions of JEE Main 2021 Physics', expected: 200 },
  { file: 'Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf', id: 'challenge_7', title: 'Challenge 7: Top 100 Questions of JEE Main 2020 Physics', expected: 100 },
  { file: 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf', id: 'challenge_8', title: 'Challenge 8: Top 200 Questions of JEE Main 2026 Physics', expected: 200 },
  { file: 'Challenge 9_Theoretical Ques 2020 to 2023 JEE Main.pdf', id: 'challenge_9', title: 'Challenge 9: Theoretical Questions 2020 to 2023 JEE Main', expected: 110 },
  { file: 'Challenge 11_Rank Booster Questions Physics.pdf', id: 'challenge_11', title: 'Challenge 11: Rank Booster Questions Physics', expected: 50 },
  { file: 'Challenge 13_Top 100 Graphical Questions.pdf', id: 'challenge_13', title: 'Challenge 13: Top 100 Graphical Questions', isSlide: true, expected: 96 },
  { file: 'Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf', id: 'challenge_14', title: 'Challenge 14: 30 Experiment & Instruments Questions', expected: 30 },
  { file: 'Challenge 15_Top 50 Circuit Questions_Full Physics.pdf', id: 'challenge_15', title: 'Challenge 15: Top 50 Circuit Questions (Full Physics)', expected: 50 },
];

async function diagnose() {
  const qRegex = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/;

  for (const entry of ADI_FILES) {
    const full = path.join(ADI_DIR, entry.file);
    if (!fs.existsSync(full)) {
      console.log(`[NOT FOUND] ${entry.file}`);
      continue;
    }
    const data = new Uint8Array(fs.readFileSync(full));
    const doc = await pdfjsLib.getDocument({ data }).promise;

    console.log(`\n========================================`);
    console.log(`${entry.id} (${entry.file}): ${doc.numPages} pages. Expected: ~${entry.expected}`);

    // Check answer keys
    const answerKeys = new Map();
    for (let p = Math.max(1, doc.numPages - 6); p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const raw = tc.items.map(i => i.str).join(' ');
      
      const matches = raw.matchAll(/(?:Q\.?\s*)?(\d{1,3})\s*[.:\-–)]\s*\(?([A-Da-d0-9.-]+)\)?/g);
      for (const m of matches) {
        const q = parseInt(m[1], 10);
        const ans = m[2].trim().toUpperCase();
        if (q > 0 && q <= 350) {
          answerKeys.set(q, { ans, page: p });
        }
      }
      if (/answer/i.test(raw) || matches) {
        // print snippet
        const sample = raw.slice(0, 150).replace(/\s+/g, ' ');
        // console.log(`  P${p} sample: ${sample}`);
      }
      page.cleanup();
    }
    console.log(`  Answer keys found: ${answerKeys.size} (Keys range: min ${Math.min(...answerKeys.keys()) || 0} to max ${Math.max(...answerKeys.keys()) || 0})`);

    if (entry.isSlide) {
      console.log(`  Slide PDF: numPages = ${doc.numPages}. Slides 2 to ${doc.numPages - 1} = ${doc.numPages - 2} question slides.`);
      continue;
    }

    // Two-column text inspection
    const allFoundQ = new Set();
    const col1Q = [];
    const col2Q = [];
    const colSplitMismatch = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const raw = tc.items.map(i => i.str).join(' ');

      if (
        /^\s*200\s+PHYSICS\s+QUESTIONS/i.test(raw) ||
        /INTRODUCTION\s+PHYSICS\s+EDUNITI/i.test(raw) ||
        (/INDEX\s+TOP\s+200/i.test(raw) && /Chapter/i.test(raw)) ||
        /OFFICIAL\s+ANSWER\s+KEY/i.test(raw) ||
        /TABLE\s+OF\s+CONTENTS/i.test(raw)
      ) {
        page.cleanup();
        continue;
      }

      for (const it of tc.items) {
        const m = it.str.match(qRegex);
        if (m) {
          const qNum = parseInt(m[1], 10);
          if (qNum > 0 && qNum <= 300) {
            const x = it.transform[4];
            const y = it.transform[5];
            allFoundQ.add(qNum);
            // check x coordinate distribution
            if (x < 150) {
              col1Q.push({ qNum, p, x, y });
            } else {
              col2Q.push({ qNum, p, x, y });
              if (x < 270) {
                colSplitMismatch.push({ qNum, p, x, y });
              }
            }
          }
        }
      }
      page.cleanup();
    }

    const sorted = [...allFoundQ].sort((a, b) => a - b);
    const missing = [];
    const maxQ = sorted[sorted.length - 1] || 0;
    for (let i = 1; i <= maxQ; i++) {
      if (!allFoundQ.has(i)) missing.push(i);
    }
    console.log(`  Questions text found: ${allFoundQ.size} (Max Q: ${maxQ})`);
    if (missing.length > 0) {
      console.log(`  Missing in 1..${maxQ}: ${missing.join(', ')}`);
    } else {
      console.log(`  NO GAPS from 1 to ${maxQ}!`);
    }
    if (colSplitMismatch.length > 0) {
      console.log(`  Items with 150 <= x < 270 (would fail with midX=270): ${colSplitMismatch.length} items (e.g. Q: ${colSplitMismatch.map(c => c.qNum).slice(0, 10).join(', ')})`);
    }
  }
}

diagnose().catch(console.error);
