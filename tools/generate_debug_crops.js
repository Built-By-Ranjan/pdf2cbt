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
import { detectAllBoundaries, assignEndBoundaries, buildBoundaryMap } from '../paper2cbt/src/services/boundaryDetector.js';

const DEBUG_CROPS_ROOT = 'P:/work/ptocbt/debug-crops';

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

export async function cropPdfQuestions(pdfPath, outFolderName, cachedPages = null) {
  const outDir = path.join(DEBUG_CROPS_ROOT, outFolderName);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`\nGenerating crops for: ${outFolderName}`);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let pages = [];
  if (cachedPages) {
    pages = cachedPages;
  } else {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1.0 });
      const tc = await page.getTextContent();
      const lines = groupIntoColumnAwareLines(tc, vp.width);
      pages.push({
        pageNumber: p,
        width: vp.width,
        height: vp.height,
        lines,
        text: lines.map((l) => l.text).join('\n'),
        hasTextLayer: lines.length > 0,
      });
      page.cleanup();
    }
  }

  const cleaned = cleanPages(pages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  const rawBoundaries = detectAllBoundaries(pages);
  const completedBoundaries = assignEndBoundaries(rawBoundaries, pages);
  const boundaryMap = buildBoundaryMap(completedBoundaries);

  console.log(`  Parsed ${questions.length} questions. Cropping at 1.5x scale...`);

  // Cache rendered page canvases for fast cropping
  const pageCanvasMap = new Map();
  const scale = 1.5;

  async function getPageCanvas(pNum) {
    if (pageCanvasMap.has(pNum)) return pageCanvasMap.get(pNum);
    const page = await doc.getPage(pNum);
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    pageCanvasMap.set(pNum, { canvas, vp, width: page.view[2], height: page.view[3] });
    page.cleanup();
    return pageCanvasMap.get(pNum);
  }

  let savedCount = 0;
  for (const q of questions) {
    const boundary = boundaryMap.get(q.number);
    let pageNum = q.pageNumber || (boundary ? boundary.pageNumber : 1);
    let startY = boundary ? boundary.startY : 0;
    let endY = boundary ? boundary.endY : 0;
    let startX = boundary ? boundary.startX : 0;
    let endX = boundary ? boundary.endX : 0;

    const pageInfo = await getPageCanvas(pageNum);
    if (!pageInfo) continue;

    if (!boundary || endY <= startY) {
      // Fallback: estimate region from question line position
      const pageLines = pages.find((p) => p.pageNumber === pageNum)?.lines || [];
      const qLine = pageLines.find((l) => l.text.includes(String(q.number)));
      if (qLine) {
        const topY = pageInfo.height - qLine.y;
        startY = Math.max(0, topY - 10);
        endY = Math.min(pageInfo.height, topY + 120);
        startX = qLine.column === 1 ? pageInfo.width * 0.5 : 0;
        endX = qLine.column === 1 ? pageInfo.width : pageInfo.width * 0.5;
      } else {
        startY = 50;
        endY = pageInfo.height - 50;
        startX = 0;
        endX = pageInfo.width;
      }
    }

    const margin = 6;
    const cropX = Math.max(0, Math.floor((startX - margin) * scale));
    const cropY = Math.max(0, Math.floor((startY - margin) * scale));
    const cropW = Math.min(pageInfo.canvas.width - cropX, Math.ceil((endX - startX + margin * 2) * scale));
    const cropH = Math.min(pageInfo.canvas.height - cropY, Math.ceil((endY - startY + margin * 2) * scale));

    if (cropW > 10 && cropH > 10) {
      const cropCanvas = createCanvas(cropW, cropH);
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.fillStyle = '#ffffff';
      cropCtx.fillRect(0, 0, cropW, cropH);
      cropCtx.drawImage(pageInfo.canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const outPath = path.join(outDir, `Q${String(q.number).padStart(3, '0')}.png`);
      fs.writeFileSync(outPath, cropCanvas.toBuffer('image/png'));
      savedCount++;
    }
  }

  console.log(`  ✓ Saved ${savedCount} question crops to ${outDir}`);
  return savedCount;
}

async function runAll() {
  console.log('Generating visual proof crops into /debug-crops/ ...');

  // 1. File 1 (IIT Growth)
  await cropPdfQuestions(
    'P:/work/ptocbt/test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf',
    '114001_IIT_GROWTH_3'
  );

  // 2. File 2 (IIT Excel)
  await cropPdfQuestions(
    'P:/work/ptocbt/test file/122004_IIT_EXCEL (May)_MINOR-04_[02-08-2026]_Student Copy.pdf',
    '122004_IIT_EXCEL'
  );

  // 3. File 4 (UPSC CMSE - 32 pages)
  let file4Pages = null;
  const file4CachePath = 'P:/work/ptocbt/tools/file4_32pages_cache.json';
  if (fs.existsSync(file4CachePath)) {
    const file4Cache = JSON.parse(fs.readFileSync(file4CachePath, 'utf-8'));
    file4Pages = Object.keys(file4Cache)
      .map(Number)
      .sort((a, b) => a - b)
      .map((pNum) => file4Cache[pNum]);
  }
  await cropPdfQuestions(
    'P:/work/ptocbt/test file/QP-CMSE-26-SrgryGynaeObstPvntSclMdcnPaper-II-03082026.pdf',
    'QP-CMSE-26',
    file4Pages
  );

  // 4. Adi File: Challenge 14
  await cropPdfQuestions(
    'P:/work/ptocbt/Adi/Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf',
    'Challenge_14'
  );

  // 5. Adi File: Challenge 15
  await cropPdfQuestions(
    'P:/work/ptocbt/Adi/Challenge 15_Top 50 Circuit Questions_Full Physics.pdf',
    'Challenge_15'
  );

  // 6. Adi File: Challenge 7
  await cropPdfQuestions(
    'P:/work/ptocbt/Adi/Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf',
    'Challenge_7'
  );

  console.log('\nAll visual proof crops generated successfully!');
}

runAll().catch(console.error);
