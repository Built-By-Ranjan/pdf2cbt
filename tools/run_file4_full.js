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
import { classifyNonQuestionPage } from '../paper2cbt/src/services/instructionParser.js';

const PDF_PATH = path.resolve('P:/work/ptocbt/test file/QP-CMSE-26-SrgryGynaeObstPvntSclMdcnPaper-II-03082026.pdf');
const CACHE_PATH = path.resolve('P:/work/ptocbt/tools/file4_32pages_cache.json');

function detectTwoColumnGutter(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const minX = Math.floor(width * 0.44);
  const maxX = Math.floor(width * 0.56);
  const regionWidth = maxX - minX;

  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(minX, 0, regionWidth, height);
  const data = imgData.data;

  const columnDarkness = new Uint32Array(regionWidth);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * regionWidth * 4;
    for (let x = 0; x < regionWidth; x++) {
      const idx = rowOffset + x * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (gray < 180) {
        columnDarkness[x]++;
      }
    }
  }

  let minDark = Infinity;
  let bestX = -1;
  for (let x = 0; x < regionWidth; x++) {
    if (columnDarkness[x] < minDark) {
      minDark = columnDarkness[x];
      bestX = minX + x;
    }
  }

  if (minDark < height * 0.03) {
    return bestX;
  }
  return null;
}

async function run() {
  console.log(`Loading PDF from ${PDF_PATH}...`);
  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;
  console.log(`PDF has ${numPages} pages.`);

  let pageDataMap = {};
  if (fs.existsSync(CACHE_PATH)) {
    console.log(`Loading cached OCR data from ${CACHE_PATH}...`);
    pageDataMap = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  }

  const worker = await createWorker('eng');

  for (let pNum = 1; pNum <= numPages; pNum++) {
    if (pageDataMap[pNum]) {
      continue;
    }

    console.log(`[OCR] Processing Page ${pNum}/${numPages}...`);
    const page = await doc.getPage(pNum);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const gutterX = detectTwoColumnGutter(canvas);
    let lines = [];

    if (gutterX !== null && gutterX > 100 && gutterX < canvas.width - 100) {
      // Split left and right
      const leftCanvas = createCanvas(gutterX, canvas.height);
      leftCanvas.getContext('2d').drawImage(canvas, 0, 0, gutterX, canvas.height, 0, 0, gutterX, canvas.height);
      const leftBuf = leftCanvas.toBuffer('image/png');

      const rightWidth = canvas.width - gutterX;
      const rightCanvas = createCanvas(rightWidth, canvas.height);
      rightCanvas.getContext('2d').drawImage(canvas, gutterX, 0, rightWidth, canvas.height, 0, 0, rightWidth, canvas.height);
      const rightBuf = rightCanvas.toBuffer('image/png');

      const [leftRes, rightRes] = await Promise.all([
        worker.recognize(leftBuf),
        worker.recognize(rightBuf),
      ]);

      const leftLines = (leftRes.data.lines || [])
        .map((l) => ({
          text: (l.text || '').trim(),
          bbox: l.bbox,
          x: l.bbox.x0 / scale,
          y: page.view[3] - (l.bbox.y0 / scale),
          column: 0,
        }))
        .filter((l) => l.text.length > 0);

      const rightLines = (rightRes.data.lines || [])
        .map((l) => ({
          text: (l.text || '').trim(),
          bbox: {
            ...l.bbox,
            x0: l.bbox.x0 + gutterX,
            x1: l.bbox.x1 + gutterX,
          },
          x: (l.bbox.x0 + gutterX) / scale,
          y: page.view[3] - (l.bbox.y0 / scale),
          column: 1,
        }))
        .filter((l) => l.text.length > 0);

      lines = [...leftLines, ...rightLines];
    } else {
      const buf = canvas.toBuffer('image/png');
      const res = await worker.recognize(buf);
      lines = (res.data.lines || [])
        .map((l) => ({
          text: (l.text || '').trim(),
          bbox: l.bbox,
          x: l.bbox.x0 / scale,
          y: page.view[3] - (l.bbox.y0 / scale),
          column: 0,
        }))
        .filter((l) => l.text.length > 0);
    }

    pageDataMap[pNum] = {
      pageNumber: pNum,
      width: page.view[2],
      height: page.view[3],
      lines,
      text: lines.map((l) => l.text).join('\n'),
      hasTextLayer: true,
    };

    // Save incremental cache every 5 pages
    if (pNum % 5 === 0 || pNum === numPages) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(pageDataMap, null, 2));
    }
  }

  await worker.terminate();
  fs.writeFileSync(CACHE_PATH, JSON.stringify(pageDataMap, null, 2));

  // Convert map to sorted pages array
  const extractedPages = Object.keys(pageDataMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((pNum) => pageDataMap[pNum]);

  console.log(`Running pipeline on ${extractedPages.length} pages...`);
  const nonQuestionPages = new Set();
  for (const page of extractedPages) {
    const pageType = classifyNonQuestionPage(page.text || '');
    if (pageType) {
      nonQuestionPages.add(page.pageNumber);
      console.log(`  Dropped Page ${page.pageNumber}: ${pageType}`);
    }
  }

  const questionPages = extractedPages.filter((p) => !nonQuestionPages.has(p.pageNumber));
  console.log(`Processing ${questionPages.length} question pages...`);

  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  console.log('\n================ FILE 4 ANALYSIS RESULTS ================');
  console.log(`Total questions detected: ${questions.length}`);
  
  // Per-page question counts
  const pageCountMap = {};
  const questionNumbers = [];
  questions.forEach((q) => {
    const p = q.pageNumber || (q.bbox ? q.bbox.pageNumber : 'unknown');
    pageCountMap[p] = (pageCountMap[p] || 0) + 1;
    questionNumbers.push(q.number);
  });

  console.log('\nPer-page question distribution:');
  for (let p = 1; p <= numPages; p++) {
    console.log(`  Page ${String(p).padStart(2, ' ')}: ${pageCountMap[p] || 0} questions`);
  }

  // Check for gaps and duplicates in numbering
  console.log('\nQuestion numbering analysis:');
  const seen = new Map();
  const duplicates = [];
  for (const num of questionNumbers) {
    seen.set(num, (seen.get(num) || 0) + 1);
    if (seen.get(num) === 2) {
      duplicates.push(num);
    }
  }

  const minNum = Math.min(...questionNumbers);
  const maxNum = Math.max(...questionNumbers);
  const missing = [];
  for (let i = minNum; i <= maxNum; i++) {
    if (!seen.has(i)) {
      missing.push(i);
    }
  }

  console.log(`Number range: Q${minNum} to Q${maxNum}`);
  console.log(`Duplicate numbers (${duplicates.length}): ${duplicates.length > 0 ? duplicates.join(', ') : 'None'}`);
  console.log(`Missing numbers in sequence (${missing.length}): ${missing.length > 0 ? missing.join(', ') : 'None'}`);

  // Summary by question type
  const typeCounts = {};
  questions.forEach((q) => {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
  });
  console.log('\nQuestion types:', typeCounts);

  // Sample questions
  console.log('\nFirst 5 questions:');
  questions.slice(0, 5).forEach((q) => {
    console.log(`  Q${q.number} (P${q.pageNumber}): [${q.type}] options=${q.options?.length} text="${q.text?.slice(0, 60)}..."`);
  });

  console.log('\nLast 5 questions:');
  questions.slice(-5).forEach((q) => {
    console.log(`  Q${q.number} (P${q.pageNumber}): [${q.type}] options=${q.options?.length} text="${q.text?.slice(0, 60)}..."`);
  });

  // Write detailed result to json
  fs.writeFileSync('P:/work/ptocbt/tools/file4_full_summary.json', JSON.stringify({
    totalQuestions: questions.length,
    pageCountMap,
    duplicates,
    missing,
    typeCounts,
    questions: questions.map(q => ({
      number: q.number,
      displayNumber: q.displayNumber,
      page: q.pageNumber,
      type: q.type,
      optionsCount: q.options?.length || 0,
      textSnippet: q.text?.slice(0, 80)
    }))
  }, null, 2));

  console.log('\nSaved full summary to tools/file4_full_summary.json');
}

run().catch((err) => {
  console.error('Error during File 4 full processing:', err);
  process.exit(1);
});
