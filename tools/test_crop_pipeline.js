import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../paper2cbt/src/services/pageCleaner.js';
import { normalizePages } from '../paper2cbt/src/services/normalizer.js';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';
import { classifyNonQuestionPage } from '../paper2cbt/src/services/instructionParser.js';

const ADI_DIR = 'P:/work/ptocbt/Adi';

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

async function testAll() {
  const files = fs.readdirSync(ADI_DIR).filter(f => f.endsWith('.pdf'));
  for (const f of files) {
    const filePath = path.join(ADI_DIR, f);
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
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
    const nonQuestionPages = new Set();
    for (const page of pages) {
      const pageType = classifyNonQuestionPage(page.text || '');
      if (pageType) {
        nonQuestionPages.add(page.pageNumber);
      }
    }
    const questionPages = pages.filter((p) => !nonQuestionPages.has(p.pageNumber));
    const cleaned = cleanPages(questionPages);
    const normalized = normalizePages(cleaned);
    const tokens = tokenizePages(normalized);
    const sectioned = annotateSections(tokens);
    const subjectAnnotated = annotateSubjects(sectioned);
    const questions = parseQuestions(subjectAnnotated);
    console.log(`${f.padEnd(60)} -> ${questions.length} questions`);
  }
}

testAll();
