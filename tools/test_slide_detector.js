import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

function groupIntoLines(textContent) {
  const items = (textContent.items || []).filter((it) => it.str && it.str.trim().length > 0);
  if (items.length === 0) return [];
  const rows = [];
  for (const item of items) {
    let row = rows.find((r) => Math.abs(r.y - item.transform[5]) <= 3);
    if (!row) {
      row = { y: item.transform[5], items: [] };
      rows.push(row);
    }
    row.items.push(item.str);
  }
  return rows.map((r) => r.items.join(' ').trim()).filter((t) => t.length > 0);
}

export function isSlideModeDocument(pages) {
  if (!pages || pages.length < 4) return false;

  let sparsePages = 0;
  for (const p of pages) {
    const lines = p.lines || [];
    // Count non-header/footer lines:
    const contentLines = lines.filter(l => !/^(youtube|click for|eduniti|mohit goenka|index|s\.no\.|learn like)/i.test(l.text || l));
    if (contentLines.length <= 6) {
      sparsePages++;
    }
  }

  const sparseRatio = sparsePages / pages.length;
  return sparseRatio >= 0.70;
}

async function testPdf(filename) {
  const filePath = path.join(ADI_DIR, filename);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();
    const lineTexts = groupIntoLines(tc);
    const str = lineTexts.join('\n');
    pages.push({
      pageNumber: p,
      width: vp.width,
      height: vp.height,
      lines: lineTexts.map(t => ({ text: t })),
      text: str,
      hasTextLayer: str.length > 0
    });
    page.cleanup();
  }

  const isSlide = isSlideModeDocument(pages);
  const sparseCount = pages.filter(p => {
    const cl = (p.lines||[]).filter(l => !/^(youtube|click for|eduniti|mohit goenka|index|s\.no\.|learn like)/i.test(l.text));
    return cl.length <= 6;
  }).length;
  console.log(`${filename}: isSlideMode = ${isSlide} (${sparseCount}/${pages.length} sparse pages)`);
}

async function run() {
  await testPdf('Challenge 1_All PYQs of JEE Main 2019.pdf');
  await testPdf('Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf');
  await testPdf('Challenge 13_Top 100 Graphical Questions.pdf');
  await testPdf('Challenge 7_Top 100 Questions of JEE Main 2020 Physics.pdf');
}

run();
