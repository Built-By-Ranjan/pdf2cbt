import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkSlidePdf(filename) {
  console.log(`\n================== ${filename} ==================`);
  const filePath = path.join(ADI_DIR, filename);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;
  console.log(`Total pages: ${numPages}`);

  const pageDetails = [];
  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();
    const str = tc.items.map(i => i.str).join(' ').trim();
    const lines = tc.items.filter(i => i.str && i.str.trim());
    pageDetails.push({
      page: p,
      width: vp.width,
      height: vp.height,
      isLandscape: vp.width > vp.height,
      itemsCount: lines.length,
      textLen: str.length,
      snippet: str.slice(0, 80)
    });
    page.cleanup();
  }

  const landscapes = pageDetails.filter(p => p.isLandscape).length;
  console.log(`Landscape pages: ${landscapes}/${numPages}`);
  const avgItems = (pageDetails.reduce((a, b) => a + b.itemsCount, 0) / numPages).toFixed(1);
  console.log(`Avg text items per page: ${avgItems}`);

  // Let's inspect first 3 and last 3 pages
  console.log('First 3 pages:');
  pageDetails.slice(0, 3).forEach(p => console.log(`  P${p.page} (${p.itemsCount} items): ${p.snippet}`));
  console.log('Last 3 pages:');
  pageDetails.slice(-3).forEach(p => console.log(`  P${p.page} (${p.itemsCount} items): ${p.snippet}`));
}

async function run() {
  await checkSlidePdf('Challenge 1_All PYQs of JEE Main 2019.pdf');
  await checkSlidePdf('Challenge 4_Top 200 Questions of JEE Main 2022 Physics.pdf');
  await checkSlidePdf('Challenge 13_Top 100 Graphical Questions.pdf');
}

run();
