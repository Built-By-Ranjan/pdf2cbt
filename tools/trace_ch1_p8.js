import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cleanPages } from '../paper2cbt/src/services/pageCleaner.js';
import { normalizePages } from '../paper2cbt/src/services/normalizer.js';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';
import { parseQuestions } from '../paper2cbt/src/services/questionParser.js';

const data = new Uint8Array(fs.readFileSync('P:/work/ptocbt/Adi/Challenge 1_All PYQs of JEE Main 2019.pdf'));
const doc = await pdfjsLib.getDocument({ data }).promise;

const page = await doc.getPage(8);
const tc = await page.getTextContent();
const rawText = tc.items.map(i => i.str).join('\n');
const lines = tc.items.map(i => ({ text: i.str, x: i.transform[4], y: i.transform[5], column: 0 }));

const pages = [{ pageNumber: 8, width: page.view[2], height: page.view[3], lines, text: rawText, hasTextLayer: true }];
const cleaned = cleanPages(pages);
console.log('Cleaned lines:', cleaned[0].lines.map(l => l.text).filter(Boolean));
const tokens = tokenizePages(normalizePages(cleaned));
console.log('Tokens:', tokens.map(t => ({ type: t.type, text: t.text })));
const questions = parseQuestions(annotateSubjects(annotateSections(tokens)));
console.log('Parsed questions:', questions.length);
questions.forEach(q => console.log('Q:', q.number, q.text));
