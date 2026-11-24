import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const ADI_DIR = 'P:/work/ptocbt/Adi';
const PUBLIC_EXAMS_DIR = 'P:/work/ptocbt/paper2cbt/public/exams';
const OUTPUT_DATA_FILE = 'P:/work/ptocbt/paper2cbt/src/data/preloadedExams.js';

const ADI_FILES = [
  { file: 'Challenge 1_All PYQs of JEE Main 2019.pdf', id: 'challenge_1', title: 'Challenge 1: All PYQs of JEE Main 2019', isSlide: true },
  { file: 'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf', id: 'challenge_2', title: 'Challenge 2: Top 200 Questions of JEE Main 2023 Physics' },
  { file: 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf', id: 'challenge_3', title: 'Challenge 3: Top 200 Questions of JEE Main 2024 Physics' },
  { file: 'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf', id: 'challenge_4', title: 'Challenge 4: Top 200 Questions of JEE Main 2022 Physics' },
  { file: 'Challenge 5_Top 200 Questions of JEE Main 2025 Physics.pdf', id: 'challenge_5', title: 'Challenge 5: Top 200 Questions of JEE Main 2025 Physics' },
  { file: 'Challenge 6_Top 200 Questions of JEE Main 2021 Physics.pdf', id: 'challenge_6', title: 'Challenge 6: Top 200 Questions of JEE Main 2021 Physics' },
  { file: 'Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf', id: 'challenge_7', title: 'Challenge 7: Top 100 Questions of JEE Main 2020 Physics' },
  { file: 'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf', id: 'challenge_8', title: 'Challenge 8: Top 200 Questions of JEE Main 2026 Physics' },
  { file: 'Challenge 9_Theoretical Ques 2020 to 2023 JEE Main.pdf', id: 'challenge_9', title: 'Challenge 9: Theoretical Questions 2020 to 2023 JEE Main' },
  { file: 'Challenge 11_Rank Booster Questions Physics.pdf', id: 'challenge_11', title: 'Challenge 11: Rank Booster Questions Physics' },
  { file: 'Challenge 13_Top 100 Graphical Questions.pdf', id: 'challenge_13', title: 'Challenge 13: Top 100 Graphical Questions', isSlide: true },
  { file: 'Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf', id: 'challenge_14', title: 'Challenge 14: 30 Experiment & Instruments Questions' },
  { file: 'Challenge 15_Top 50 Circuit Questions_Full Physics.pdf', id: 'challenge_15', title: 'Challenge 15: Top 50 Circuit Questions (Full Physics)' },
];

function autoTrimCanvas(srcCanvas, padding = 12) {
  const ctx = srcCanvas.getContext('2d');
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a > 30 && (r < 235 || g < 235 || b < 235)) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return srcCanvas;

  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(w - cropX, (maxX - minX) + padding * 2);
  const cropH = Math.min(h - cropY, (maxY - minY) + padding * 2);

  const trimmed = createCanvas(cropW, cropH);
  const tCtx = trimmed.getContext('2d');
  tCtx.fillStyle = '#ffffff';
  tCtx.fillRect(0, 0, cropW, cropH);
  tCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return trimmed;
}

async function processExam(entry) {
  const filePath = path.join(ADI_DIR, entry.file);
  const examId = entry.id;
  const examOutDir = path.join(PUBLIC_EXAMS_DIR, examId);
  fs.mkdirSync(examOutDir, { recursive: true });

  console.log(`\nProcessing: ${entry.title}`);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;

  const answerKeyMap = new Map();
  const candidateTexts = [];

  // Answer key detection from end of doc
  for (let p = Math.max(1, numPages - 6); p <= numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const raw = tc.items.map(i => i.str).join(' ');

    if (/FILL\s+YOUR\s+ANSWER/i.test(raw)) {
      page.cleanup();
      continue;
    }

    candidateTexts.push(raw);

    // Pass 1: Strict dot/colon delimited Q. ANS
    const matches = raw.matchAll(/(?:^|\s)(\d{1,3})\s*[.:]\s*([A-Za-z0-9]+)/g);
    for (const m of matches) {
      const qNum = parseInt(m[1], 10);
      let ans = m[2].trim().toUpperCase();
      if (qNum >= 1 && qNum <= 350 && !/^(PAGE|YEAR|JEE|MAIN|TOTAL|ANS|TOP|QUESTIONS|PHYSICS)$/i.test(ans)) {
        if (!answerKeyMap.has(qNum)) {
          answerKeyMap.set(qNum, ans);
        }
      }
    }
    page.cleanup();
  }

  // Pass 2: Targeted gap search for any missing Q (e.g. Q31 printed without dot)
  const maxDetectedQ = Math.max(...answerKeyMap.keys(), 0);
  for (let i = 1; i <= maxDetectedQ; i++) {
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

  const structuredQuestions = [];
  const scale = 2.0; // 2x high resolution
  const qRegex = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/;

  if (entry.isSlide) {
    // Slide mode: 1 page = 1 question (skip title and answer key slides)
    let qNum = 1;
    for (let pNum = 2; pNum < numPages; pNum++) {
      const page = await doc.getPage(pNum);
      const vp = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();

      const trimmed = autoTrimCanvas(canvas, 16);
      const fileName = `Q${String(qNum).padStart(3, '0')}.png`;
      const outPath = path.join(examOutDir, fileName);
      fs.writeFileSync(outPath, trimmed.toBuffer('image/png'));

      structuredQuestions.push({
        id: `${examId}_q${qNum}`,
        number: qNum,
        displayNumber: qNum,
        type: 'HYBRID',
        hasImage: true,
        subject: 'Physics',
        section: 'Physics',
        imageUrl: `/exams/${examId}/${fileName}`,
        options: [
          { label: 'A', text: '(1)', isImageOption: true },
          { label: 'B', text: '(2)', isImageOption: true },
          { label: 'C', text: '(3)', isImageOption: true },
          { label: 'D', text: '(4)', isImageOption: true },
        ],
        correctAnswer: answerKeyMap.get(qNum) || null,
      });

      qNum++;
    }
  } else {
    // 2-column or multi-question mode
    const questionItems = new Map(); // qNum -> { pageNum, col, topY, endY, cX, cY, cW, cH }

    for (let pNum = 1; pNum <= numPages; pNum++) {
      const page = await doc.getPage(pNum);
      const vp = page.getViewport({ scale });
      const tc = await page.getTextContent();

      const pageW = vp.width / scale;
      const pageH = vp.height / scale;
      const midX = pageW * 0.5;

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

      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const col1 = [];
      const col2 = [];
      let footerTopY = pageH - 26;

      for (let i = 0; i < tc.items.length; i++) {
        const it = tc.items[i];
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4];
        const y = it.transform[5];
        const topY = pageH - y;

        if (/Solution\s+Link|Mohit\s+Goenka|LEARN\s+LIKE\s+NEVER|EDUNITI\s*$/i.test(it.str) && topY > pageH * 0.75) {
          if (topY < footerTopY) footerTopY = topY;
        }

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
          // Eduniti Left column markers are at x < 60; Right column markers are at x >= 250
          if (x < 200) {
            col1.push({ qNum, topY, x });
          } else {
            col2.push({ qNum, topY, x });
          }
        }
      }

      col1.sort((a, b) => a.topY - b.topY);
      col2.sort((a, b) => a.topY - b.topY);

      if (col1.length === 0 && col2.length === 0) {
        page.cleanup();
        continue;
      }

      // Column 1 (Left Half)
      for (let i = 0; i < col1.length; i++) {
        const cur = col1[i];
        const next = col1[i + 1];
        const startY = Math.max(0, cur.topY - 18);
        const endY = next ? (next.topY - 20) : (footerTopY - 6);
        if (endY - startY < 20) continue;

        const cX = Math.floor(0 * scale);
        const cY = Math.floor(startY * scale);
        const cW = Math.ceil(midX * scale);
        const cH = Math.ceil((endY - startY) * scale);

        const raw = createCanvas(cW, cH);
        const rCtx = raw.getContext('2d');
        rCtx.fillStyle = '#ffffff';
        rCtx.fillRect(0, 0, cW, cH);
        rCtx.drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

        const trimmed = autoTrimCanvas(raw, 12);
        const fileName = `Q${String(cur.qNum).padStart(3, '0')}.png`;
        fs.writeFileSync(path.join(examOutDir, fileName), trimmed.toBuffer('image/png'));
        questionItems.set(cur.qNum, { fileName, qNum: cur.qNum });
      }

      // Column 2 (Right Half)
      for (let i = 0; i < col2.length; i++) {
        const cur = col2[i];
        const next = col2[i + 1];
        const startY = Math.max(0, cur.topY - 18);
        const endY = next ? (next.topY - 20) : (footerTopY - 6);
        if (endY - startY < 20) continue;

        const cX = Math.floor(midX * scale);
        const cY = Math.floor(startY * scale);
        const cW = Math.ceil((pageW - midX) * scale);
        const cH = Math.ceil((endY - startY) * scale);

        const raw = createCanvas(cW, cH);
        const rCtx = raw.getContext('2d');
        rCtx.fillStyle = '#ffffff';
        rCtx.fillRect(0, 0, cW, cH);
        rCtx.drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

        const trimmed = autoTrimCanvas(raw, 12);
        const fileName = `Q${String(cur.qNum).padStart(3, '0')}.png`;
        fs.writeFileSync(path.join(examOutDir, fileName), trimmed.toBuffer('image/png'));
        questionItems.set(cur.qNum, { fileName, qNum: cur.qNum });
      }

      page.cleanup();
    }

    const sortedQNums = [...questionItems.keys()].sort((a, b) => a - b);
    for (const qNum of sortedQNums) {
      const item = questionItems.get(qNum);
      structuredQuestions.push({
        id: `${examId}_q${qNum}`,
        number: qNum,
        displayNumber: qNum,
        type: 'HYBRID',
        hasImage: true,
        subject: 'Physics',
        section: 'Physics',
        imageUrl: `/exams/${examId}/${item.fileName}`,
        options: [
          { label: 'A', text: '(1)', isImageOption: true },
          { label: 'B', text: '(2)', isImageOption: true },
          { label: 'C', text: '(3)', isImageOption: true },
          { label: 'D', text: '(4)', isImageOption: true },
        ],
        correctAnswer: answerKeyMap.get(qNum) || null,
      });
    }
  }

  const keyObj = {};
  for (const [k, v] of answerKeyMap.entries()) {
    keyObj[k] = v;
  }

  console.log(`  ✓ ${entry.id}: ${structuredQuestions.length} questions saved, ${answerKeyMap.size} answers configured.`);

  return {
    id: entry.id,
    title: entry.title,
    filename: entry.file,
    subject: 'Physics',
    totalQuestions: structuredQuestions.length,
    answerCount: answerKeyMap.size,
    questions: structuredQuestions,
    answerKey: keyObj,
  };
}

async function run() {
  fs.mkdirSync(PUBLIC_EXAMS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_DATA_FILE), { recursive: true });

  const allExams = [];
  for (const entry of ADI_FILES) {
    try {
      const examData = await processExam(entry);
      allExams.push(examData);
    } catch (err) {
      console.error(`Error on ${entry.file}:`, err);
    }
  }

  const fileContent = `// Pre-loaded exams generated from Adi Physics Collection\nexport const PRELOADED_EXAMS = ${JSON.stringify(allExams, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_DATA_FILE, fileContent, 'utf-8');
  console.log(`\nAll 13 Adi exams processed, cropped, and saved to: ${OUTPUT_DATA_FILE}`);
}

run().catch(console.error);
