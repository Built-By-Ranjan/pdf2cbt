import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
const data = new Uint8Array(fs.readFileSync(pdfPath));

async function run() {
  const doc = await pdfjsLib.getDocument({ data }).promise;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(it => it.str).join(' ');
    console.log(`\n==================== PAGE ${i} ====================`);
    console.log(text.slice(0, 500));
  }
}

run().catch(console.error);
