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

async function testCh4() {
  const filePath = path.join(ADI_DIR, 'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = [];
  for (let pNum = 1; pNum <= doc.numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter(it => it.str && it.str.trim().length > 0);
    // Sort items top-to-bottom
    items.sort((a, b) => b.transform[5] - a.transform[5]);
    const lines = items.map(it => ({ text: it.str, x: it.transform[4], y: it.transform[5] }));
    pages.push({
      pageNumber: pNum,
      lines,
      text: lines.map(l => l.text).join('\n'),
      hasTextLayer: true
    });
    page.cleanup();
  }

  // Non-question pages
  const nonQuestionPages = new Set();
  for (const page of pages) {
    const pageType = classifyNonQuestionPage(page.text || '');
    if (pageType) {
      nonQuestionPages.add(page.pageNumber);
      console.log(`Page ${page.pageNumber} classified as non-question: ${pageType}`);
    }
  }

  const questionPages = pages.filter(p => !nonQuestionPages.has(p.pageNumber));
  console.log(`Question pages: ${questionPages.length} of ${pages.length}`);

  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  console.log(`Total tokens: ${tokens.length}`);
  const qStartTokens = tokens.filter(t => t.type === 'QUESTION_START');
  console.log(`QUESTION_START tokens: ${qStartTokens.length}`);
  if (qStartTokens.length > 0) {
    console.log(`First 10 Q_START tokens:`, qStartTokens.slice(0, 10).map(t => ({ p: t.page, text: t.text })));
  }

  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);
  console.log(`Parsed questions: ${questions.length}`);
  if (questions.length > 0) {
    console.log(`Questions found:`, questions.map(q => q.number));
  }
}

testCh4();
