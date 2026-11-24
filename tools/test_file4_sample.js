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
import { matchQuestionStart } from '../src/utils/regexPatterns.js';

async function run() {
  const filePath = path.resolve('../test file/QP-CMSE-26-SrgryGynaeObstPvntSclMdcnPaper-II-03082026.pdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const cachePath = './file4_sample_cache.json';
  let extractedPages = [];

  if (fs.existsSync(cachePath)) {
    console.log('Loading File 4 sample OCR from cache...');
    extractedPages = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } else {
    console.log('Running OCR on pages 2-5 of File 4...');
    const worker = await createWorker('eng');

    for (let pNum = 2; pNum <= 5; pNum++) {
      const page = await doc.getPage(pNum);
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

      // Check if two-column
      const midX = page.view[2] * 0.5;
      const leftQStarts = rawLines.filter(l => l.x < midX && matchQuestionStart(l.text)).length;
      const rightQStarts = rawLines.filter(l => l.x >= midX && matchQuestionStart(l.text)).length;
      const isTwoColumn = leftQStarts >= 1 && rightQStarts >= 1;

      let lines;
      if (isTwoColumn) {
        const left = rawLines.filter(l => l.x < midX).sort((a, b) => b.y - a.y).map(l => ({ ...l, column: 0 }));
        const right = rawLines.filter(l => l.x >= midX).sort((a, b) => b.y - a.y).map(l => ({ ...l, column: 1 }));
        lines = [...left, ...right];
      } else {
        lines = rawLines.sort((a, b) => b.y - a.y).map(l => ({ ...l, column: 0 }));
      }

      extractedPages.push({
        pageNumber: pNum,
        width: page.view[2],
        height: page.view[3],
        lines,
        text: lines.map(l => l.text).join('\n'),
        hasTextLayer: true,
      });
    }

    await worker.terminate();
    fs.writeFileSync(cachePath, JSON.stringify(extractedPages, null, 2));
  }

  console.log('Testing question parsing on sample pages...');
  const cleaned = cleanPages(extractedPages);
  const normalized = normalizePages(cleaned);
  const tokens = tokenizePages(normalized);
  const sectioned = annotateSections(tokens);
  const subjectAnnotated = annotateSubjects(sectioned);
  const questions = parseQuestions(subjectAnnotated);

  console.log(`Detected questions on pages 2-5: ${questions.length}`);
  questions.forEach(q => {
    console.log(`  Q${q.number}: type=${q.type}, options=${q.options.map(o => o.label).join(',')}, text=${q.question.slice(0, 50)}...`);
  });
}

run().catch(console.error);
