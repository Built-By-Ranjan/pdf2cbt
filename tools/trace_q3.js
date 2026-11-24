import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { cleanPages } from '../src/services/pageCleaner.js';
import { normalizePages } from '../src/services/normalizer.js';
import { tokenizePages } from '../src/services/tokenizer.js';
import { annotateSections } from '../src/services/sectionDetector.js';
import { annotateSubjects } from '../src/services/subjectDetector.js';
import { classifyNonQuestionPage } from '../src/services/instructionParser.js';
import { extractAllPages } from './test_extract_helper.js';

import { TOKEN_TYPES, PARSER_STATES, QUESTION_TYPES } from '../src/utils/constants.js';
import { matchQuestionStart } from '../src/utils/regexPatterns.js';
import { extractInlineAnswerAndSolution, isAnswerOrSolutionLine } from '../src/services/inlineAnswerDetector.js';

async function run() {
  const file3Actual = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3Actual));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const extractedPages = await extractAllPages(doc);
  const p3 = extractedPages.find(p => p.pageNumber === 3);
  console.log('Page 3 raw lines with Ans:', p3.lines.filter(l => l.text.includes('Ans')));

  const questionPages = extractedPages.filter(p => !classifyNonQuestionPage(p.text));
  const cleaned = cleanPages(questionPages);
  const p3Cleaned = cleaned.find(p => p.pageNumber === 3);
  console.log('Page 3 cleaned lines with Ans:', p3Cleaned.lines.filter(l => l.text.includes('Ans')));

  const normalized = normalizePages(cleaned);
  const p3Norm = normalized.find(p => p.pageNumber === 3);
  console.log('Page 3 normalized lines with Ans:', p3Norm.lines.filter(l => l.text.includes('Ans')));

  const tokens = tokenizePages(normalized);
  const p3Tokens = tokens.filter(t => t.pageNumber === 3 && t.text.includes('Ans'));
  console.log('Page 3 tokens with Ans:', p3Tokens);
}

run().catch(console.error);
