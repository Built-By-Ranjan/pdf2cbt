import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';

import { cleanPages } from '../paper2cbt/src/services/pageCleaner.js';
import { normalizePages } from '../paper2cbt/src/services/normalizer.js';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';
import { extractAnswerKey, mapKeyEntriesToQuestions } from '../paper2cbt/src/services/answerKeyService.js';
import { classifyNonQuestionPage } from '../paper2cbt/src/services/instructionParser.js';
import { QUESTION_TYPES } from '../paper2cbt/src/utils/constants.js';

const ADI_DIR = 'P:/work/ptocbt/Adi';
const OCR_CACHE_FILE = 'P:/work/ptocbt/tools/adi_ocr_cache.json';

let ocrCache = {};
if (fs.existsSync(OCR_CACHE_FILE)) {
  try {
    ocrCache = JSON.parse(fs.readFileSync(OCR_CACHE_FILE, 'utf-8'));
  } catch { /* ignore */ }
}

function saveOcrCache() {
  try {
    fs.writeFileSync(OCR_CACHE_FILE, JSON.stringify(ocrCache, null, 2));
  } catch { /* ignore */ }
}

export const DEV_FILES = [
  'Challenge 1_All PYQs of JEE Main 2019.pdf',
  'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf',
  'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf',
  'Challenge 5_Top 200 Questions of JEE Main 2025 Physics.pdf',
  'Challenge 6_Top 200 Questions of JEE Main 2021 Physics.pdf',
  'Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf',
  'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf',
  'Challenge 9_Theoretical Ques 2020 to 2023 JEE Main.pdf',
  'Challenge 11_Rank Booster Questions Physics.pdf',
];

export const HOLDOUT_FILES = [
  'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf',
  'Challenge 13_Top 100 Graphical Questions.pdf',
  'Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf',
  'Challenge 15_Top 50 Circuit Questions_Full Physics.pdf',
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

  const COLUMN_GAP_RATIO = 0.08;
  const gapThreshold = pageWidth * COLUMN_GAP_RATIO;
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
      const text = row.items
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        const leftX = Math.min(...row.items.map((it) => it.x));
        topHeaders.push({ text, x: leftX, y: row.y, column: 0 });
      }
      continue;
    }

    if (leftItems.length > 0) {
      const text = leftItems
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        const leftX = Math.min(...leftItems.map((it) => it.x));
        leftCol.push({ text, x: leftX, y: row.y, column: 0 });
      }
    }

    if (rightItems.length > 0) {
      const text = rightItems
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        const leftX = Math.min(...rightItems.map((it) => it.x));
        rightCol.push({ text, x: leftX, y: row.y, column: 1 });
      }
    }
  }

  return [...topHeaders, ...leftCol, ...rightCol];
}

async function processPdfFile(filename, ocrWorker) {
  const startTime = Date.now();
  const filePath = path.join(ADI_DIR, filename);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;

  const pages = [];
  let textPageCount = 0;
  let ocrPageCount = 0;

  for (let pNum = 1; pNum <= numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const lines = groupIntoColumnAwareLines(textContent, viewport.width);
    const rawText = lines.map((l) => l.text).join('\n');

    const hasText = rawText.replace(/\s+/g, '').length >= 30;
    if (hasText) {
      textPageCount++;
      pages.push({
        pageNumber: pNum,
        width: viewport.width,
        height: viewport.height,
        lines,
        text: rawText,
        hasTextLayer: true,
      });
    } else {
      ocrPageCount++;
      const cacheKey = `${filename}_p${pNum}`;
      let ocrLines;
      if (ocrCache[cacheKey]) {
        ocrLines = ocrCache[cacheKey];
      } else {
        // Render and OCR
        const scale = 1.0;
        const ocrViewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(ocrViewport.width), Math.ceil(ocrViewport.height));
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;
        const buf = canvas.toBuffer('image/png');
        const res = await ocrWorker.recognize(buf);

        ocrLines = (res.data.lines || [])
          .map((l) => ({
            text: (l.text || '').trim(),
            bbox: l.bbox,
            x: l.bbox.x0 / scale,
            y: page.view[3] - (l.bbox.y0 / scale),
            column: 0,
          }))
          .filter((l) => l.text.length > 0);

        ocrCache[cacheKey] = ocrLines;
        if (pNum % 5 === 0) saveOcrCache();
      }

      pages.push({
        pageNumber: pNum,
        width: page.view[2],
        height: page.view[3],
        lines: ocrLines,
        text: ocrLines.map((l) => l.text).join('\n'),
        hasTextLayer: true,
      });
    }
    page.cleanup();
  }
  saveOcrCache();

  let pdfType = 'text';
  if (ocrPageCount === numPages) pdfType = 'scanned';
  else if (ocrPageCount > 0) pdfType = 'mixed';

  // Filter non-question pages
  const nonQuestionPages = new Set();
  for (const page of pages) {
    const pageType = classifyNonQuestionPage(page.text || '');
    if (pageType) {
      nonQuestionPages.add(page.pageNumber);
    }
  }
  const questionPages = pages.filter((p) => !nonQuestionPages.has(p.pageNumber));

  // Run pipeline
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  const answerKeyMap = extractAnswerKey(tokens, questions);

  // Note: Question types are determined strictly from question content (options/text)
  // and section headings, never inferred from answer key values (to avoid collision
  // between option numbers 1-4 and integer answers 1-4).

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Analyze subjects
  const subjects = [...new Set(questions.map((q) => q.subject).filter(Boolean))];

  // Analyze question types
  let mcqCount = 0;
  let integerCount = 0;
  let answersMapped = 0;
  let solutionsFound = 0;

  questions.forEach((q) => {
    if (
      q.type === QUESTION_TYPES.SINGLE_CHOICE ||
      q.type === QUESTION_TYPES.MULTIPLE_CHOICE ||
      q.type === QUESTION_TYPES.ASSERTION_REASON ||
      q.type === QUESTION_TYPES.TRUE_FALSE
    ) {
      mcqCount++;
    } else if (q.type === QUESTION_TYPES.INTEGER || q.type === QUESTION_TYPES.NUMERICAL) {
      integerCount++;
    }

    if (q.inlineAnswer || (answerKeyMap && answerKeyMap.has(q.number))) {
      answersMapped++;
    }
    if (q.solutionText || q.solutionImage) {
      solutionsFound++;
    }
  });

  // Calculate flags
  const flags = [];
  const numbers = questions.map((q) => q.number);
  const seenNumbers = new Set();
  const dupes = new Set();
  numbers.forEach((n) => {
    if (seenNumbers.has(n)) dupes.add(n);
    seenNumbers.add(n);
  });
  if (dupes.size > 0) {
    flags.push(`dupes(${[...dupes].slice(0, 3).join(',')}${dupes.size > 3 ? '...' : ''})`);
  }

  // Gaps
  if (numbers.length > 0) {
    const minN = Math.min(...numbers);
    const maxN = Math.max(...numbers);
    let gapCount = 0;
    for (let i = minN; i <= maxN; i++) {
      if (!seenNumbers.has(i)) gapCount++;
    }
    if (gapCount > 0) {
      flags.push(`gaps(${gapCount})`);
    }
  }

  // MCQs with fewer than 4 options
  const under4Opts = questions.filter(
    (q) =>
      (q.type === QUESTION_TYPES.SINGLE_CHOICE || q.type === QUESTION_TYPES.MULTIPLE_CHOICE) &&
      (!q.options || q.options.length < 4)
  ).length;
  if (under4Opts > 0) {
    flags.push(`<4opts(${under4Opts})`);
  }

  // Low confidence
  const lowConf = questions.filter((q) => q.confidence !== undefined && q.confidence < 0.6).length;
  if (lowConf > 0) {
    flags.push(`lowConf(${lowConf})`);
  }

  return {
    filename,
    pages: numPages,
    pdfType,
    timeTaken: `${durationSec}s`,
    questionsFound: questions.length,
    subjectsDetected: subjects.length > 0 ? subjects.join(',') : 'None',
    mcqCount,
    integerCount,
    answersMapped,
    solutionsFound,
    flags: flags.length > 0 ? flags.join('; ') : 'None',
  };
}

async function run() {
  const allFiles = [...DEV_FILES, ...HOLDOUT_FILES];
  console.log(`Starting Batch Runner on ${allFiles.length} PDFs...`);
  console.log(`Dev Set (${DEV_FILES.length}):`, DEV_FILES);
  console.log(`Hold-out Set (${HOLDOUT_FILES.length}):`, HOLDOUT_FILES);

  const ocrWorker = await createWorker('eng');
  const results = [];

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const isHoldout = HOLDOUT_FILES.includes(file);
    const tag = isHoldout ? '[HOLD-OUT]' : '[DEV]';
    console.log(`\n(${i + 1}/${allFiles.length}) Processing ${tag} ${file}...`);
    try {
      const res = await processPdfFile(file, ocrWorker);
      res.isHoldout = isHoldout;
      results.push(res);
      console.log(`  -> ${res.questionsFound} questions found, ${res.mcqCount} MCQs, ${res.integerCount} Integers, ${res.answersMapped} Answers mapped. Flags: ${res.flags}`);
    } catch (err) {
      console.error(`  -> Failed: ${err.stack || err.message}`);
      results.push({
        filename: file,
        pages: 0,
        pdfType: 'error',
        timeTaken: '0s',
        questionsFound: 0,
        subjectsDetected: 'None',
        mcqCount: 0,
        integerCount: 0,
        answersMapped: 0,
        solutionsFound: 0,
        flags: `ERROR: ${err.message}`,
        isHoldout,
      });
    }
  }

  await ocrWorker.terminate();

  const beforeFile = 'P:/work/ptocbt/tools/adi_batch_before.json';
  const beforeResults = fs.existsSync(beforeFile)
    ? JSON.parse(fs.readFileSync(beforeFile, 'utf-8'))
    : null;

  fs.writeFileSync('P:/work/ptocbt/tools/adi_batch_after.json', JSON.stringify(results, null, 2));
  console.log('\nSaved AFTER results to P:/work/ptocbt/tools/adi_batch_after.json');

  // Print DEV SET Table
  console.log('\n=================== DEV SET: BEFORE vs AFTER ===================\n');
  printComparisonTable(DEV_FILES, beforeResults, results);

  // Print HOLD-OUT SET Table
  console.log('\n=================== HOLD-OUT SET: BEFORE vs AFTER ===================\n');
  printComparisonTable(HOLDOUT_FILES, beforeResults, results);
}

function printComparisonTable(fileList, beforeRows, afterRows) {
  const headers = [
    'File Name',
    'Pages',
    'Time (A)',
    'Qs (B)',
    'Qs (A)',
    'MCQ (B)',
    'MCQ (A)',
    'Int (B)',
    'Int (A)',
    'Ans (B)',
    'Ans (A)',
    'Flags (AFTER)'
  ];
  console.log('| ' + headers.join(' | ') + ' |');
  console.log('| ' + headers.map(() => '---').join(' | ') + ' |');

  for (const filename of fileList) {
    const b = beforeRows?.find((r) => r.filename === filename) || {};
    const a = afterRows?.find((r) => r.filename === filename) || {};
    const row = [
      filename.replace(/_/g, ' '),
      a.pages || b.pages || '-',
      a.timeTaken || '-',
      b.questionsFound ?? '-',
      a.questionsFound ?? '-',
      b.mcqCount ?? '-',
      a.mcqCount ?? '-',
      b.integerCount ?? '-',
      a.integerCount ?? '-',
      b.answersMapped ?? '-',
      a.answersMapped ?? '-',
      a.flags || 'None'
    ];
    console.log('| ' + row.join(' | ') + ' |');
  }
}

run().catch(console.error);
