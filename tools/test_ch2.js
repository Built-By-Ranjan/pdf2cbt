import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cleanPages } from '../paper2cbt/src/services/pageCleaner.js';
import { normalizePages } from '../paper2cbt/src/services/normalizer.js';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';

const data = new Uint8Array(fs.readFileSync('P:/work/ptocbt/Adi/Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf'));
const doc = await pdfjsLib.getDocument({ data }).promise;

const pages = [];
for (let p = 1; p <= Math.min(10, doc.numPages); p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const text = tc.items.map(i => i.str).join('\n');
  pages.push({
    pageNumber: p,
    width: vp.width,
    height: vp.height,
    text,
    lines: tc.items.map(i => ({ text: i.str, x: i.transform[4], y: i.transform[5], column: 0 })),
    hasTextLayer: true
  });
}

const cleaned = cleanPages(pages);
const normalized = normalizePages(cleaned);
const tokens = tokenizePages(normalized);
const sectioned = annotateSections(tokens);
const subjectAnnotated = annotateSubjects(sectioned);
const questions = parseQuestions(subjectAnnotated);

console.log(`Detected questions in first 10 pages: ${questions.length}`);
questions.slice(0, 10).forEach(q => console.log(`Q${q.number} (P${q.page}): text="${q.text}"`));
