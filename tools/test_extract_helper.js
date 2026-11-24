import { COLUMN_GAP_RATIO } from '../src/utils/constants.js';
import { matchQuestionStart } from '../src/utils/regexPatterns.js';

export function groupIntoColumnAwareLines(textContent, pageWidth) {
  const items = textContent.items.filter((it) => it.str && it.str.trim().length > 0);
  if (items.length === 0) return [];

  // Step 1: Bucket glyph items into rows using baseline y
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

  // Sort rows top-to-bottom (PDF y-axis descends)
  rows.sort((a, b) => b.y - a.y);

  // Check if question starts appear at two distinct column positions (e.g. left and right half)
  const midX = pageWidth * 0.5;
  let qStartsLeft = 0;
  let qStartsRight = 0;

  for (const row of rows) {
    const sorted = [...row.items].sort((a, b) => a.x - b.x);
    const leftText = sorted.filter(it => it.x < midX).map(it => it.str).join(' ').trim();
    const rightText = sorted.filter(it => it.x >= midX).map(it => it.str).join(' ').trim();

    if (matchQuestionStart(leftText)) qStartsLeft++;
    if (matchQuestionStart(rightText)) qStartsRight++;
  }

  const isMultiColumn = qStartsLeft >= 2 && qStartsRight >= 2;

  if (!isMultiColumn) {
    // Single column page: emit all rows top-to-bottom, joining glyphs left-to-right
    const lines = [];
    for (const row of rows) {
      const text = row.items
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      const leftX = Math.min(...row.items.map((it) => it.x));
      lines.push({ text, x: leftX, y: row.y, column: 0 });
    }
    return lines;
  }

  // Multi-column page:
  const topHeaders = [];
  const leftCol = [];
  const rightCol = [];

  for (const row of rows) {
    const leftItems = row.items.filter((it) => it.x < midX);
    const rightItems = row.items.filter((it) => it.x >= midX);

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

export async function extractAllPages(pdfDoc) {
  const total = pdfDoc.numPages;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const lines = groupIntoColumnAwareLines(textContent, viewport.width);
    const text = lines.map(l => l.text).join('\n');
    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      rotation: page.rotate || 0,
      text,
      hasTextLayer: text.length > 20,
      lines,
    });
  }
  return pages;
}
