import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

import { cleanPages } from '../paper2cbt/src/services/pageCleaner.js';
import { normalizePages } from '../paper2cbt/src/services/normalizer.js';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';
import { classifyNonQuestionPage } from '../paper2cbt/src/services/instructionParser.js';
import { detectAllBoundaries, assignEndBoundaries, buildBoundaryMap } from '../paper2cbt/src/services/boundaryDetector.js';

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

function groupIntoColumnAwareLines(textContent, pageWidth) {
  const items = (textContent.items || []).filter((it) => it.str && it.str.trim().length > 0);
  if (items.length === 0) return [];
  const rows = [];
  const Y_TOLERANCE = 3;
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ str: item.str, x });
  }
  rows.sort((a, b) => b.y - a.y);
  const midX = pageWidth * 0.5;
  const leftCol = [];
  const rightCol = [];
  const topHeaders = [];
  const gapThreshold = pageWidth * 0.08;
  let firstParallelY = -Infinity;
  for (const row of rows) {
    const xs = row.items.map((it) => it.x);
    const sortedXs = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < sortedXs.length - 1; i++) {
      if (sortedXs[i + 1] - sortedXs[i] >= gapThreshold) {
        firstParallelY = Math.max(firstParallelY, row.y);
        break;
      }
    }
  }
  for (const row of rows) {
    const leftItems = row.items.filter((it) => it.x < midX);
    const rightItems = row.items.filter((it) => it.x >= midX);
    if (row.y > firstParallelY + Y_TOLERANCE) {
      const text = row.items.sort((a, b) => a.x - b.x).map((it) => it.str).join(' ').trim();
      if (text) topHeaders.push({ text, column: 0, y: row.y });
    } else {
      if (leftItems.length > 0) {
        const text = leftItems.sort((a, b) => a.x - b.x).map((it) => it.str).join(' ').trim();
        if (text) leftCol.push({ text, column: 1, y: row.y });
      }
      if (rightItems.length > 0) {
        const text = rightItems.sort((a, b) => a.x - b.x).map((it) => it.str).join(' ').trim();
        if (text) rightCol.push({ text, column: 2, y: row.y });
      }
    }
  }
  return [...topHeaders, ...leftCol, ...rightCol];
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

  const pages = [];
  const answerKeyMap = new Map();

  for (let pNum = 1; pNum <= numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const vp = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();
    const str = tc.items.map(i => i.str).join(' ').trim();
    const columnLines = groupIntoColumnAwareLines(tc, vp.width);

    pages.push({
      pageNumber: pNum,
      width: vp.width,
      height: vp.height,
      lines: columnLines,
      text: columnLines.map(l => l.text).join('\n'),
      rawText: str
    });
    page.cleanup();
  }

  // Answer key detection from end of doc
  for (const page of pages) {
    if (/answer\s*(?:s|-)?\s*key\b|^\s*answers?\s*[:.-]?\s*$/i.test(page.rawText)) {
      const matches = page.rawText.matchAll(/(?:Q\.?\s*)?(\d{1,3})\s*[.:\-–)]\s*\(?([A-Da-d0-9.-]+)\)?/g);
      for (const m of matches) {
        const qNum = parseInt(m[1], 10);
        const ans = m[2].trim().toUpperCase();
        if (qNum > 0 && qNum <= 300) {
          answerKeyMap.set(qNum, ans);
        }
      }
    }
  }

  const nonQuestionPages = new Set();
  for (const page of pages) {
    const pageType = classifyNonQuestionPage(page.text || '');
    if (pageType) {
      nonQuestionPages.add(page.pageNumber);
    }
    if (/answer\s*(?:s|-)?\s*key\b/i.test(page.rawText)) {
      nonQuestionPages.add(page.pageNumber);
    }
  }

  const questionPages = entry.isSlide
    ? pages.filter((p) => p.pageNumber > 1 && p.pageNumber < numPages)
    : pages.filter((p) => !nonQuestionPages.has(p.pageNumber));

  const scale = 1.5;
  const pageCanvasMap = new Map();
  async function getPageCanvas(pNum) {
    if (pageCanvasMap.has(pNum)) return pageCanvasMap.get(pNum);
    const page = await doc.getPage(pNum);
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    const result = { canvas, width: vp.width, height: vp.height };
    pageCanvasMap.set(pNum, result);
    return result;
  }

  const structuredQuestions = [];

  if (entry.isSlide) {
    // Slide mode (1 page = 1 question)
    for (let idx = 0; idx < questionPages.length; idx++) {
      const p = questionPages[idx];
      const qNum = idx + 1;
      const pageInfo = await getPageCanvas(p.pageNumber);

      const fileName = `Q${String(qNum).padStart(3, '0')}.png`;
      const outPath = path.join(examOutDir, fileName);
      fs.writeFileSync(outPath, pageInfo.canvas.toBuffer('image/png'));

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
        correctAnswer: answerKeyMap.get(qNum) || null
      });
    }
  } else {
    // Normal multi-question cropping
    const cleaned = cleanPages(questionPages);
    const normalized = normalizePages(cleaned);
    const tokens = tokenizePages(normalized);
    const sectioned = annotateSections(tokens);
    const subjectAnnotated = annotateSubjects(sectioned);
    const parsed = parseQuestions(subjectAnnotated);

    const rawBoundaries = detectAllBoundaries(questionPages);
    const completedBoundaries = assignEndBoundaries(rawBoundaries, questionPages);
    const boundaryMap = buildBoundaryMap(completedBoundaries);

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      const qNum = q.number;
      const boundary = boundaryMap.get(qNum);
      const targetPageNum = boundary?.pageNumber ?? q.pageNumber ?? questionPages[0].pageNumber;
      const pageInfo = await getPageCanvas(targetPageNum);

      const startX = boundary?.startX ?? 0;
      const endX = boundary?.endX ?? (pageInfo.width / scale);
      const startY = boundary?.startY ?? 0;
      const endY = boundary?.endY ?? (pageInfo.height / scale);

      const cropX = Math.max(0, Math.floor(startX * scale));
      const cropY = Math.max(0, Math.floor(startY * scale));
      const cropW = Math.min(pageInfo.canvas.width - cropX, Math.ceil((endX - startX) * scale));
      const cropH = Math.min(pageInfo.canvas.height - cropY, Math.ceil((endY - startY) * scale));

      const fileName = `Q${String(qNum).padStart(3, '0')}.png`;
      if (cropW > 10 && cropH > 10) {
        const cropCanvas = createCanvas(cropW, cropH);
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.fillStyle = '#ffffff';
        cropCtx.fillRect(0, 0, cropW, cropH);
        cropCtx.drawImage(pageInfo.canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const outPath = path.join(examOutDir, fileName);
        fs.writeFileSync(outPath, cropCanvas.toBuffer('image/png'));
      }

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
        correctAnswer: answerKeyMap.get(qNum) || null
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
    answerKey: keyObj
  };
}

async function run() {
  fs.mkdirSync(PUBLIC_EXAMS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_DATA_FILE), { recursive: true });

  let existingExams = [];
  if (fs.existsSync(OUTPUT_DATA_FILE)) {
    try {
      const existingCode = fs.readFileSync(OUTPUT_DATA_FILE, 'utf-8');
      const jsonMatch = existingCode.match(/export const PRELOADED_EXAMS = (\[[\s\S]*\]);/);
      if (jsonMatch) {
        existingExams = JSON.parse(jsonMatch[1]);
      }
    } catch (e) {
      existingExams = [];
    }
  }

  const allExams = [];
  for (const entry of ADI_FILES) {
    try {
      const existing = existingExams.find((e) => e.id === entry.id);
      if (existing && existing.questions && existing.questions.length > 0 && entry.id !== 'challenge_13') {
        console.log(`Re-using existing ${entry.id} (${existing.questions.length} questions)`);
        allExams.push(existing);
        continue;
      }
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
