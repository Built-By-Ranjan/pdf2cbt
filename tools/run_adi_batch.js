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
import { extractAnswerKey } from '../paper2cbt/src/services/answerKeyService.js';
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

// Dev Set (11 files) - Note: Challenges 4 & 13 were moved here from hold-out due to inspection/debugging
export const DEV_FILES = [
  'Challenge 1_All PYQs of JEE Main 2019.pdf',
  'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf',
  'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf',
  'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf',
  'Challenge 5_Top 200 Questions of JEE Main 2025 Physics.pdf',
  'Challenge 6_Top 200 Questions of JEE Main 2021 Physics.pdf',
  'Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf',
  'Challenge 8_Top 200 Questions of JEE Main 2026 Physics.pdf',
  'Challenge 9_Theoretical Ques 2020 to 2023 JEE Main.pdf',
  'Challenge 11_Rank Booster Questions Physics.pdf',
  'Challenge 13_Top 100 Graphical Questions.pdf',
];

// Clean Hold-out Set (2 files) - Strictly uninspected during development
export const HOLDOUT_FILES = [
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
        .trim();
      if (text) topHeaders.push({ text, column: 0, y: row.y });
    } else {
      if (leftItems.length > 0) {
        const text = leftItems
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str)
          .join(' ')
          .trim();
        if (text) leftCol.push({ text, column: 1, y: row.y });
      }
      if (rightItems.length > 0) {
        const text = rightItems
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str)
          .join(' ')
          .trim();
        if (text) rightCol.push({ text, column: 2, y: row.y });
      }
    }
  }

  return [...topHeaders, ...leftCol, ...rightCol];
}

async function renderPageToImage(page, scale = 1.5) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { buffer: canvas.toBuffer('image/png'), width: viewport.width, height: viewport.height };
}

async function performOcr(imageBuffer, ocrWorker) {
  const result = await ocrWorker.recognize(imageBuffer);
  const words = result.data.words || [];
  const lines = [];

  for (const w of words) {
    const text = (w.text || '').trim();
    if (!text) continue;
    const y = w.bbox.y0;
    let line = lines.find((l) => Math.abs(l.y - y) <= 6);
    if (!line) {
      line = { y, words: [] };
      lines.push(line);
    }
    line.words.push(w);
  }

  lines.sort((a, b) => a.y - b.y);

  return lines.map((l) => {
    l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const lineText = l.words.map((w) => w.text).join(' ');
    const firstWord = l.words[0];
    const lastWord = l.words[l.words.length - 1];
    return {
      text: lineText,
      bbox: {
        x0: firstWord.bbox.x0,
        y0: firstWord.bbox.y0,
        x1: lastWord.bbox.x1,
        y1: lastWord.bbox.y1,
      },
      x: firstWord.bbox.x0,
      y: firstWord.bbox.y0,
      column: 0,
    };
  });
}

/**
 * Slide Mode: If a PDF is slide-like (1 page = 1 question crop),
 * treat each page as one question crop. Number comes from visible slide number
 * if found, else 1-based sequential page order.
 */
async function processSlidePdf(filename, doc) {
  const startTime = Date.now();
  const numPages = doc.numPages;
  const pages = [];

  for (let pNum = 1; pNum <= numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const textContent = await page.getTextContent();
    const str = textContent.items.map((i) => i.str).join(' ').trim();
    pages.push({
      pageNumber: pNum,
      width: page.view[2],
      height: page.view[3],
      text: str,
      lines: textContent.items.map((it) => ({
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
      })),
    });
    page.cleanup();
  }

  // Identify Answer Key pages
  const answerKeyPages = [];
  const keyMap = new Map();

  for (const p of pages) {
    if (/answer\s*(?:s|-)?\s*key\b|^\s*answers?\s*[:.-]?\s*$/i.test(p.text)) {
      answerKeyPages.push(p.pageNumber);
      const matches = p.text.matchAll(/\b(\d{1,3})\s*[.:\-–]?\s*\(?([A-Da-d0-9]+)\)?/g);
      for (const m of matches) {
        const qNum = parseInt(m[1], 10);
        const ans = m[2].toUpperCase();
        if (!keyMap.has(qNum)) {
          keyMap.set(qNum, ans);
        }
      }
    }
  }

  // Identify Cover / Index / Link-only pages
  const nonQuestionPages = new Set(answerKeyPages);
  for (const p of pages) {
    if (nonQuestionPages.has(p.pageNumber)) continue;
    if (p.pageNumber === 1) {
      nonQuestionPages.add(p.pageNumber);
      continue;
    }
    // Index / syllabus slide
    if (/s\.no\.\s+chapters|table of contents|introduction\s+jee\s+main|syllabus/i.test(p.text)) {
      nonQuestionPages.add(p.pageNumber);
      continue;
    }
    // Promotional / app link only slide
    if (p.text.length < 50 && /solution|eduniti app/i.test(p.text) && !/\d{1,3}\./.test(p.text)) {
      nonQuestionPages.add(p.pageNumber);
      continue;
    }
  }

  const questionSlidePages = pages.filter((p) => !nonQuestionPages.has(p.pageNumber));

  // Build 1 question per question slide
  const questions = questionSlidePages.map((p, idx) => {
    let detectedNum = null;
    const numMatch = p.text.match(/\b(?:Q\.?|Question\s*)?(\d{1,3})\s*[.):]/i);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n > 0 && n <= 300) detectedNum = n;
    }

    const qNum = idx + 1; // 1-based order
    return {
      number: qNum,
      displayNumber: detectedNum || qNum,
      page: p.pageNumber,
      pageNumber: p.pageNumber,
      type: QUESTION_TYPES.HYBRID,
      hasImage: true,
      question: p.text.slice(0, 100),
      options: [
        { label: 'A', text: '(1)', isImageOption: true },
        { label: 'B', text: '(2)', isImageOption: true },
        { label: 'C', text: '(3)', isImageOption: true },
        { label: 'D', text: '(4)', isImageOption: true },
      ],
      subject: 'Physics',
      confidence: 1.0,
    };
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  const flags = [];
  if (filename.includes('Challenge 13')) {
    flags.push('slide_mode(1page=1Q); pending_expected_verification');
  } else {
    flags.push('slide_mode(1page=1Q)');
  }

  const answersMapped = questions.filter((q) => keyMap.has(q.number)).length;

  return {
    filename,
    pages: numPages,
    pdfType: 'slide',
    timeTaken: `${durationSec}s`,
    questionsFound: questions.length,
    subjectsDetected: 'Physics',
    singleCount: 0,
    multiCount: 0,
    integerCount: 0,
    hybridCount: questions.length,
    subjectiveCount: 0,
    unknownCount: 0,
    mcqCount: 0,
    answersMapped,
    solutionsFound: 0,
    workedSolutions: 0,
    answerOnlyFallbacks: 0,
    flags: flags.join('; '),
  };
}

async function processPdfFile(filename, ocrWorker) {
  const filePath = path.join(ADI_DIR, filename);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  // Slide Mode requested for Challenge 1, 4, 13
  const isSlidePdf =
    filename.startsWith('Challenge 1_') ||
    filename.startsWith('Challenge 4_') ||
    filename.startsWith('Challenge 13_');

  if (isSlidePdf) {
    return await processSlidePdf(filename, doc);
  }

  const startTime = Date.now();
  const numPages = doc.numPages;
  const pages = [];
  let ocrPageCount = 0;

  for (let pNum = 1; pNum <= numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const textContent = await page.getTextContent();
    const hasText = textContent.items && textContent.items.length > 5;

    if (hasText) {
      const columnLines = groupIntoColumnAwareLines(textContent, page.view[2]);
      pages.push({
        pageNumber: pNum,
        width: page.view[2],
        height: page.view[3],
        lines: columnLines,
        text: columnLines.map((l) => l.text).join('\n'),
        hasTextLayer: true,
      });
    } else {
      ocrPageCount++;
      const cacheKey = `${filename}_p${pNum}`;
      let ocrLines = ocrCache[cacheKey];

      if (!ocrLines) {
        const { buffer } = await renderPageToImage(page, 1.5);
        ocrLines = await performOcr(buffer, ocrWorker);
        ocrCache[cacheKey] = ocrLines;
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

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Analyze subjects
  const subjects = [...new Set(questions.map((q) => q.subject).filter(Boolean))];

  // Analyze all question types strictly
  let singleCount = 0;
  let multiCount = 0;
  let intCount = 0;
  let hybridCount = 0;
  let subjCount = 0;
  let unknownCount = 0;

  let answersMapped = 0;
  let workedSolutions = 0;
  let answerOnlyFallbacks = 0;

  questions.forEach((q) => {
    if (
      q.type === QUESTION_TYPES.SINGLE_CHOICE ||
      q.type === QUESTION_TYPES.TRUE_FALSE ||
      q.type === QUESTION_TYPES.ASSERTION_REASON
    ) {
      singleCount++;
    } else if (q.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
      multiCount++;
    } else if (q.type === QUESTION_TYPES.INTEGER || q.type === QUESTION_TYPES.NUMERICAL) {
      intCount++;
    } else if (q.type === QUESTION_TYPES.HYBRID) {
      hybridCount++;
    } else if (q.type === QUESTION_TYPES.SUBJECTIVE) {
      subjCount++;
    } else {
      unknownCount++;
    }

    if (q.inlineAnswer || (answerKeyMap && answerKeyMap.has(q.number))) {
      answersMapped++;
    }

    // Distinguish worked solutions from answer-only placeholders
    const isAnsOnly = q.solutionText && /^\s*Ans\.\s*\([A-D0-9-.]+\)\s*$/i.test(q.solutionText.trim());
    const hasWorked = (q.solutionText && !isAnsOnly) || q.solutionImage;

    if (hasWorked) {
      workedSolutions++;
    } else if (isAnsOnly || q.inlineAnswer) {
      answerOnlyFallbacks++;
    }
  });

  // Calculate flags
  const flags = [];

  // Low yield: questions-per-page far below median or under 3 questions from a non-trivial PDF (> 3 pages)
  if (numPages > 3 && questions.length < 3) {
    flags.push(`low_yield(${questions.length}Q/${numPages}p)`);
  }

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

  // MCQs with fewer than 4 options (only for explicit discrete text MCQ types)
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
    singleCount,
    multiCount,
    integerCount: intCount,
    hybridCount,
    subjectiveCount: subjCount,
    unknownCount,
    mcqCount: singleCount + multiCount,
    answersMapped,
    solutionsFound: workedSolutions + answerOnlyFallbacks,
    workedSolutions,
    answerOnlyFallbacks,
    flags: flags.length > 0 ? flags.join('; ') : 'None',
  };
}

function getExpectedCount(filename, expectedCounts) {
  if (!expectedCounts) return null;
  if (expectedCounts[filename] !== undefined) return expectedCounts[filename];
  for (const [key, val] of Object.entries(expectedCounts)) {
    if (filename.startsWith(key) || filename.toLowerCase().startsWith(key.toLowerCase())) {
      return val;
    }
  }
  return null;
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
      console.log(`  -> ${res.questionsFound} Qs (SGL:${res.singleCount}, MLT:${res.multiCount}, INT:${res.integerCount}, HYB:${res.hybridCount}, SUB:${res.subjectiveCount}, UNK:${res.unknownCount}), ${res.answersMapped} Ans. Flags: ${res.flags}`);
    } catch (err) {
      console.error(`  -> Failed: ${err.stack || err.message}`);
      results.push({
        filename: file,
        pages: 0,
        pdfType: 'error',
        timeTaken: '0s',
        questionsFound: 0,
        subjectsDetected: 'None',
        singleCount: 0,
        multiCount: 0,
        integerCount: 0,
        hybridCount: 0,
        subjectiveCount: 0,
        unknownCount: 0,
        mcqCount: 0,
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

  const expectedCountsFile = 'P:/work/ptocbt/tools/expected_counts.json';
  let expectedCounts = null;
  if (fs.existsSync(expectedCountsFile)) {
    try {
      expectedCounts = JSON.parse(fs.readFileSync(expectedCountsFile, 'utf-8'));
    } catch { /* ignore */ }
  }

  // Print DEV SET Table
  console.log('\n=================== DEV SET: BEFORE vs AFTER ===================\n');
  printComparisonTable(DEV_FILES, beforeResults, results, expectedCounts);

  // Print HOLD-OUT SET Table
  console.log('\n=================== HOLD-OUT SET: BEFORE vs AFTER ===================\n');
  printComparisonTable(HOLDOUT_FILES, beforeResults, results, expectedCounts);
}

function printComparisonTable(fileList, beforeRows, afterRows, expectedCounts = null) {
  const headers = [
    'File Name',
    'Pgs',
    'Time(A)',
    'Qs(B)',
    'Qs(A)',
    'Exp',
    'Status',
    'SGL',
    'MLT',
    'INT',
    'HYB',
    'SUB',
    'UNK',
    'Ans',
    'Sol(Wk)',
    'Sol(Ans)',
    'Flags(AFTER)'
  ];
  console.log('| ' + headers.join(' | ') + ' |');
  console.log('| ' + headers.map(() => '---').join(' | ') + ' |');

  for (const filename of fileList) {
    const b = beforeRows?.find((r) => r.filename === filename) || {};
    const a = afterRows?.find((r) => r.filename === filename) || {};

    const exp = getExpectedCount(filename, expectedCounts);
    let status = 'PENDING';
    if (exp !== null && exp !== undefined) {
      status = a.questionsFound === exp ? 'PASS' : `FAIL(exp ${exp}, got ${a.questionsFound})`;
    } else if (filename.includes('Challenge 13')) {
      // User directive: Challenge 13 is reported failing until verified against expected count
      status = 'FAIL(unverified)';
    } else {
      status = 'PENDING(no key)';
    }

    const row = [
      filename.replace(/_/g, ' '),
      a.pages || b.pages || '-',
      a.timeTaken || '-',
      b.questionsFound ?? '-',
      a.questionsFound ?? '-',
      exp ?? 'PENDING',
      status,
      a.singleCount ?? 0,
      a.multiCount ?? 0,
      a.integerCount ?? 0,
      a.hybridCount ?? 0,
      a.subjectiveCount ?? 0,
      a.unknownCount ?? 0,
      a.answersMapped ?? '-',
      a.workedSolutions ?? 0,
      a.answerOnlyFallbacks ?? 0,
      a.flags || 'None'
    ];
    console.log('| ' + row.join(' | ') + ' |');
  }
}

run().catch(console.error);
