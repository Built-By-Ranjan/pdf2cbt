import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

export function isSlideLikeDoc(pages) {
  if (!pages || pages.length < 4) return false;

  let slidePages = 0;
  for (const p of pages) {
    const rawText = (p.text || '').trim();
    const cleanChars = rawText.replace(/\s+/g, '').length;
    // In slide-like pages, text layer has either very few chars (< 250) or average chars per line is very low (< 25)
    const lines = (p.lines || []).filter(l => (l.text || l).trim().length > 0);
    const avgLineLen = lines.length > 0 ? cleanChars / lines.length : 0;
    if (cleanChars < 250 || avgLineLen < 25 || lines.length <= 8) {
      slidePages++;
    }
  }

  return (slidePages / pages.length) >= 0.75;
}

export async function parseSlideDoc(filename, doc) {
  const numPages = doc.numPages;
  const pages = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();
    const str = tc.items.map(i => i.str).join(' ').trim();
    pages.push({
      pageNumber: p,
      width: vp.width,
      height: vp.height,
      text: str,
      lines: tc.items.map(it => ({ text: it.str, x: it.transform[4], y: it.transform[5] }))
    });
    page.cleanup();
  }

  // Identify Answer Key pages
  const answerKeyPages = [];
  const keyMap = new Map();

  for (const p of pages) {
    if (/answer\s*key/i.test(p.text)) {
      answerKeyPages.push(p.pageNumber);
      // Parse answers on this key page
      // e.g. "1. c 2. b 3. d" or "1. (C) 2. (B)"
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

  // Identify Cover / Index pages
  const nonQuestionPages = new Set(answerKeyPages);
  for (const p of pages) {
    if (nonQuestionPages.has(p.pageNumber)) continue;
    if (p.pageNumber === 1) {
      nonQuestionPages.add(p.pageNumber);
      continue;
    }
    // Index slide
    if (/s\.no\.\s+chapters|table of contents|introduction\s+jee\s+main/i.test(p.text)) {
      nonQuestionPages.add(p.pageNumber);
      continue;
    }
    // Solution link only slide
    if (p.text.length < 50 && /solution/i.test(p.text) && !/\d{1,3}\./.test(p.text)) {
      nonQuestionPages.add(p.pageNumber);
      continue;
    }
  }

  // Filter remaining pages as question slides
  const questionSlidePages = pages.filter(p => !nonQuestionPages.has(p.pageNumber));

  // Build 1 question per question slide
  const questions = questionSlidePages.map((p, idx) => {
    // Try to find slide question number
    let detectedNum = null;
    const numMatch = p.text.match(/\b(?:Q\.?|Question\s*)?(\d{1,3})\s*[.):]/i);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n > 0 && n <= 300) detectedNum = n;
    }

    const qNum = idx + 1; // 1-based sequential slide question number
    return {
      number: qNum,
      displayNumber: detectedNum || qNum,
      pageNumber: p.pageNumber,
      type: 'HYBRID',
      hasImage: true,
      text: p.text.slice(0, 100),
      options: ['A', 'B', 'C', 'D'].map(label => ({ label, text: '', isImageOption: true }))
    };
  });

  return {
    pages: numPages,
    isSlide: true,
    questionCount: questions.length,
    coverPages: nonQuestionPages.size - answerKeyPages.length,
    answerKeyPages: answerKeyPages.length,
    answersMapped: questions.filter(q => keyMap.has(q.number)).length,
    questions
  };
}

async function run() {
  for (const f of [
    'Challenge 1_All PYQs of JEE Main 2019.pdf',
    'Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf',
    'Challenge 13_Top 100 Graphical Questions.pdf'
  ]) {
    const filePath = path.join(ADI_DIR, f);
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const res = await parseSlideDoc(f, doc);
    console.log(`\n${f}:`);
    console.log(`  Total pages: ${res.pages} | Question slides: ${res.questionCount} | Cover: ${res.coverPages} | Key pages: ${res.answerKeyPages} | Answers mapped: ${res.answersMapped}`);
  }
}

run();
