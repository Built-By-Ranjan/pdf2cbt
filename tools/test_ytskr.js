import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { annotateSubjects } from '../src/services/subjectDetector.js';
import { parseQuestions } from '../src/services/questionParser.js';
import { classifyNonQuestionPage } from '../src/services/instructionParser.js';
import { matchQuestionStart } from '../src/utils/regexPatterns.js';

async function run() {
  console.log('Loading ytskr.pdf...');
  const data = new Uint8Array(fs.readFileSync(path.resolve('../test file/ytskr.pdf')));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  console.log('Num pages:', doc.numPages);

  const cachePath = path.resolve('./ytskr_ocr_cache.json');
  let extractedPages = [];

  if (fs.existsSync(cachePath)) {
    console.log('Loading OCR text from cache...');
    extractedPages = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } else {
    const worker = await createWorker('eng');

    for (let i = 1; i <= doc.numPages; i++) {
      console.log(`Rendering and OCR on page ${i}/${doc.numPages}...`);
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const buf = canvas.toBuffer('image/png');

      const res = await worker.recognize(buf);
      const scale = 1.5;
      const rawLines = (res.data.lines || []).map(l => ({
        text: (l.text || '').trim(),
        x: l.bbox.x0 / scale,
        y: page.view[3] - (l.bbox.y0 / scale),
        bbox: l.bbox,
        confidence: l.confidence,
      })).filter(l => l.text.length > 0);

      // Single or two-column detection
      const midX = page.view[2] * 0.5;
      const leftQStarts = rawLines.filter(l => l.x < midX && matchQuestionStart(l.text)).length;
      const rightQStarts = rawLines.filter(l => l.x >= midX && matchQuestionStart(l.text)).length;
      const isTwoCol = leftQStarts >= 2 && rightQStarts >= 2;

      let lines;
      if (isTwoCol) {
        const left = rawLines.filter(l => l.x < midX).sort((a, b) => b.y - a.y).map(l => ({ ...l, column: 0 }));
        const right = rawLines.filter(l => l.x >= midX).sort((a, b) => b.y - a.y).map(l => ({ ...l, column: 1 }));
        lines = [...left, ...right];
      } else {
        lines = rawLines.sort((a, b) => b.y - a.y).map(l => ({ ...l, column: 0 }));
      }

      const text = lines.map(l => l.text).join('\n');
      extractedPages.push({
        pageNumber: i,
        width: page.view[2],
        height: page.view[3],
        text,
        lines,
        hasTextLayer: true,
      });
    }

    await worker.terminate();
    fs.writeFileSync(cachePath, JSON.stringify(extractedPages, null, 2));
  }

  console.log('Running parsing pipeline on OCR-extracted pages...');
  const questionPages = extractedPages.filter(p => !classifyNonQuestionPage(p.text));
  const cleaned = cleanPages(questionPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);

  tokens.filter(t => t.page === 1 || t.page === 2).forEach(t => {
    if (t.type === 'QUESTION_START') {
      console.log('Page ' + t.page + ' Q_START: ' + t.text.slice(0, 70));
    }
  });

  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  console.log(`TOTAL QUESTIONS DETECTED: ${questions.length}`);
  const bySubject = {};
  questions.forEach(q => {
    bySubject[q.subject || 'Unknown'] = (bySubject[q.subject || 'Unknown'] || 0) + 1;
  });
  console.log('Breakdown by Subject:', bySubject);
  const byType = {};
  questions.forEach(q => {
    const k = `${q.subject || 'Unknown'}_${q.type}`;
    byType[k] = (byType[k] || 0) + 1;
  });
  console.log('Breakdown by Subject & Type:', byType);

  const maths = questions.filter(q => q.subject === 'Mathematics').map(q => q.number);
  const physics = questions.filter(q => q.subject === 'Physics').map(q => q.number);
  const chem = questions.filter(q => q.subject === 'Chemistry').map(q => q.number);

  console.log('Maths numbers (count ' + maths.length + '):', maths);
  console.log('Physics numbers (count ' + physics.length + '):', physics);
  console.log('Chemistry numbers (count ' + chem.length + '):', chem);
}

run().catch(console.error);
