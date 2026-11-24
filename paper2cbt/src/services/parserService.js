// parserService.js
// Orchestrates the full pipeline exactly as specified:
//
//   PDF -> Classifier -> OCR -> Cleaner -> Normalizer -> Tokenizer
//       -> Section Detector -> Subject Detector -> Question Parser
//       -> Option Parser -> Inline Answer Detector -> Answer Key Service
//       -> Boundary Detector -> Region Cropper -> IndexedDB Save -> JSON
//
// Phase additions:
//   A: boundaryDetector + regionCropper (image-first design)
//   B: subjectDetector + instructionParser (non-question page detection)
//   D: answerKeyService now receives parsed questions for inline answer merging
//   F: indexedDbService for large-data persistence

import { loadPdfDocument, extractAllPages, renderPageToImage } from './pdfService';
import { classifyPdf } from './pdfClassifier';
import { ocrPagesInBatches, terminateOcrWorker, OCR_LANGUAGES } from './ocrService';
import { cleanPages } from './pageCleaner';
import { normalizePages } from './normalizer';
import { tokenizePages } from './tokenizer';
import { annotateSections } from './sectionDetector';
import { annotateSubjects } from './subjectDetector';
import { parseQuestions } from './questionParser';
import { extractAnswerKey } from './answerKeyService';
import { classifyNonQuestionPage, parseInstructions } from './instructionParser';
import { detectAllBoundaries, assignEndBoundaries, buildBoundaryMap } from './boundaryDetector';
import { cropRegionToBlob } from './regionCropper';
import { saveQuestions, saveAnswerKey, clearAll, saveBlobsBatch } from './indexedDbService';
import { PDF_TYPES, PROCESSING_STAGES, OCR_RENDER_SCALE, LARGE_DOCUMENT_PAGE_THRESHOLD } from '../utils/constants';
import { matchQuestionStart } from '../utils/regexPatterns';
import { resetIdCounter } from '../utils/idGenerator';

/**
 * @typedef {Object} ParseOptions
 * @property {string} [ocrLanguage] one of OCR_LANGUAGES — defaults to ENGLISH
 * @property {{cancelled:boolean}} [cancelToken] flip .cancelled = true to stop mid-run
 * @property {boolean} [cropImages] whether to crop question images (Phase A, default: true)
 * @property {number} [cropScale] scale for region cropping (default: CROP_RENDER_SCALE)
 */

/**
 * Runs the entire pipeline on a PDF File object.
 * @param {File} file
 * @param {(stage:string, detail?:object) => void} [onProgress]
 * @param {ParseOptions} [options]
 * @returns {Promise<{
 *   questions: Array<object>,
 *   answerKey: Map<number,string>|null,
 *   pdfType: string,
 *   pageCount: number,
 *   pages: Array<{pageNumber:number, width:number, height:number, rotation:number, hasTextLayer:boolean}>,
 *   ocrFailedPages: number[],
 *   instructions: object|null,
 * }>}
 */
export async function parsePdfToQuestions(file, onProgress = () => {}, options = {}) {
  const { ocrLanguage = OCR_LANGUAGES.ENGLISH, cancelToken, cropImages = true } = options;

  resetIdCounter('q');
  resetIdCounter('tok');

  // Phase F: Clear old data before a new parse run
  await clearAll();

  onProgress(PROCESSING_STAGES.READING_FILE);
  let pdfDoc;
  try {
    pdfDoc = await loadPdfDocument(file);
  } catch (err) {
    onProgress(PROCESSING_STAGES.ERROR, { message: err?.message || String(err) });
    throw err;
  }

  const pageCount = pdfDoc.numPages;
  onProgress(PROCESSING_STAGES.DETECTING_TYPE, { pageCount });

  // Stage 1: extract every page's embedded text layer + metadata.
  const extractedPages = await extractAllPages(pdfDoc, (done, total) => {
    onProgress(PROCESSING_STAGES.EXTRACTING_TEXT, { done, total });
  });

  // Stage 2: Classifier — decide which pages need OCR.
  const classification = classifyPdf(extractedPages);
  const pdfType = classification.type;
  const pagesNeedingOcr = new Set(classification.ocrPages);

  onProgress(PROCESSING_STAGES.DETECTING_TYPE, { pdfType, ocrPageCount: pagesNeedingOcr.size });

  let ocrFailedPages = [];

  // Stage 3: OCR only the pages that lack a usable text layer.
  if (pagesNeedingOcr.size > 0) {
    const pageImages = [];
    for (const pageNumber of pagesNeedingOcr) {
      if (cancelToken?.cancelled) break;
      // eslint-disable-next-line no-await-in-loop
      const imageDataUrl = await renderPageToImage(pdfDoc, pageNumber, { totalPages: pageCount });
      pageImages.push({ pageNumber, imageDataUrl });
    }

    onProgress(PROCESSING_STAGES.RUNNING_OCR, { total: pageImages.length, done: 0 });
    const { results: ocrResults, failed } = await ocrPagesInBatches(pageImages, {
      lang: ocrLanguage,
      cancelToken,
      onProgress: (done, total) => onProgress(PROCESSING_STAGES.RUNNING_OCR, { done, total }),
    });
    ocrFailedPages = failed;

    for (const page of extractedPages) {
      if (ocrResults.has(page.pageNumber)) {
        const ocrData = ocrResults.get(page.pageNumber);
        const ocrText = typeof ocrData === 'string' ? ocrData : ocrData.text;
        const ocrLines = typeof ocrData === 'object' && Array.isArray(ocrData.lines) ? ocrData.lines : [];

        page.text = ocrText;
        page.hasTextLayer = true;

        if (ocrLines && ocrLines.length > 0) {
          const scale =
            pageCount > LARGE_DOCUMENT_PAGE_THRESHOLD ? OCR_RENDER_SCALE * 0.75 : OCR_RENDER_SCALE;

          const rawLines = ocrLines.map((l) => {
            const x = l.bbox.x0 / scale;
            const y = page.height - l.bbox.y0 / scale;
            return {
              text: l.text,
              x,
              y,
              bbox: l.bbox,
              confidence: l.confidence,
              column: l.column ?? 0,
            };
          });

          // Phase A / File 4: If OCR already tagged columns:
          const hasCol1 = rawLines.some((l) => l.column === 1);
          if (hasCol1) {
            const left = rawLines.filter((l) => l.column === 0).sort((a, b) => b.y - a.y);
            const right = rawLines.filter((l) => l.column === 1).sort((a, b) => b.y - a.y);
            page.lines = [...left, ...right];
            page.text = page.lines.map((l) => l.text).join('\n');
          } else {
            // Check if this is a two-column scanned page
            const midX = (page.width || 595) * 0.5;
            const leftQStarts = rawLines.filter((l) => l.x < midX && matchQuestionStart(l.text)).length;
            const rightQStarts = rawLines.filter((l) => l.x >= midX && matchQuestionStart(l.text)).length;
            const isTwoColumn = leftQStarts >= 2 && rightQStarts >= 2;

            if (isTwoColumn) {
              const left = rawLines
                .filter((l) => l.x < midX)
                .sort((a, b) => b.y - a.y)
                .map((l) => ({ ...l, column: 0 }));
              const right = rawLines
                .filter((l) => l.x >= midX)
                .sort((a, b) => b.y - a.y)
                .map((l) => ({ ...l, column: 1 }));
              page.lines = [...left, ...right];
              page.text = page.lines.map((l) => l.text).join('\n');
            } else {
              page.lines = rawLines.sort((a, b) => b.y - a.y).map((l) => ({ ...l, column: 0 }));
            }
          }
        } else {
          page.lines = undefined;
        }
      }
    }
    await terminateOcrWorker();
  }

  // Phase B: Identify non-question pages (instructions, syllabus, etc.)
  // and parse instruction text to extract exam metadata.
  const instructionTexts = [];
  const nonQuestionPages = new Set();
  for (const page of extractedPages) {
    const pageType = classifyNonQuestionPage(page.text || '');
    if (pageType) {
      nonQuestionPages.add(page.pageNumber);
      if (pageType === 'instructions') instructionTexts.push(page.text || '');
    }
  }
  const instructionText = instructionTexts.join('\n');
  const instructions = instructionText ? parseInstructions(instructionText) : null;

  // Stage 4: Cleaner — strip headers/footers/boilerplate, page-aware.
  onProgress(PROCESSING_STAGES.CLEANING);
  const questionPages = extractedPages.filter((p) => !nonQuestionPages.has(p.pageNumber));
  const cleanedPages = cleanPages(questionPages);

  // Stage 5: Normalizer — per-page text cleanup, pages never merged.
  onProgress(PROCESSING_STAGES.NORMALIZING);
  const normalizedPages = normalizePages(cleanedPages);

  // Stage 6: Tokenizer — typed tokens per page, preserving column order.
  onProgress(PROCESSING_STAGES.TOKENIZING);
  const tokens = tokenizePages(normalizedPages);

  // Stage 7: Section Detector — annotate each token with its active section
  // AND whether that section is an INTEGER-type section.
  onProgress(PROCESSING_STAGES.DETECTING_SECTIONS);
  const sectionedTokens = annotateSections(tokens);

  // Phase B: Subject Detector — annotate each token with the active subject.
  const subjectAnnotatedTokens = annotateSubjects(sectionedTokens);

  // Stage 8 + 9: Question Parser + Option Parser -> structured questions.
  onProgress(PROCESSING_STAGES.PARSING_QUESTIONS);
  const questions = parseQuestions(subjectAnnotatedTokens);

  // Phase D: Extract answer key — now also passes parsed questions so inline
  // answers from faculty copy (Ans. (C)) are merged with trailing key tables.
  onProgress(PROCESSING_STAGES.PARSING_ANSWER_KEY);
  const answerKey = extractAnswerKey(subjectAnnotatedTokens, questions);

  // Phase A: Region Cropping — compute bounding boxes and crop each question.
  if (cropImages && questions.length > 0) {
    onProgress(PROCESSING_STAGES.CROPPING_REGIONS, { total: questions.length, done: 0 });

    // Build boundary map from text-layer pages (pages with structured lines).
    const pagesWithLines = extractedPages.filter(
      (p) => Array.isArray(p.lines) && p.lines.length > 0 && !nonQuestionPages.has(p.pageNumber)
    );
    const rawBoundaries = detectAllBoundaries(pagesWithLines);
    const boundaries = assignEndBoundaries(rawBoundaries, extractedPages);
    const boundaryMap = buildBoundaryMap(boundaries);

    const blobRecords = [];
    let cropDone = 0;

    for (const question of questions) {
      if (cancelToken?.cancelled) break;

      const boundary = boundaryMap.get(question.number);
      let imageBlob = null;

      if (boundary) {
        // eslint-disable-next-line no-await-in-loop
        imageBlob = await cropRegionToBlob(pdfDoc, {
          pageNumber: boundary.pageNumber,
          startY: boundary.startY,
          endY: boundary.endY,
          startX: boundary.startX,
          endX: boundary.endX,
        });
      }

      if (imageBlob) {
        question.hasImage = true; // always true when we have a crop
        blobRecords.push({ id: question.id, imageBlob });
      }

      cropDone += 1;
      if (cropDone % 5 === 0) {
        onProgress(PROCESSING_STAGES.CROPPING_REGIONS, { total: questions.length, done: cropDone });
      }
    }

    // Phase F: Persist blobs to IndexedDB
    if (blobRecords.length > 0) {
      onProgress(PROCESSING_STAGES.SAVING_DATA, { total: blobRecords.length });
      await saveBlobsBatch(blobRecords);
    }
  }

  // Phase F: Persist questions and answer key to IndexedDB
  onProgress(PROCESSING_STAGES.SAVING_DATA);
  await saveQuestions(questions);
  await saveAnswerKey(answerKey);

  onProgress(PROCESSING_STAGES.DONE, { questionCount: questions.length });

  return {
    pdfType,
    pageCount,
    questions,
    answerKey,
    instructions,
    pages: extractedPages.map((p) => ({
      pageNumber: p.pageNumber,
      width: p.width,
      height: p.height,
      rotation: p.rotation,
      hasTextLayer: p.hasTextLayer,
      isNonQuestionPage: nonQuestionPages.has(p.pageNumber),
    })),
    ocrFailedPages,
  };
}

export { PDF_TYPES };
