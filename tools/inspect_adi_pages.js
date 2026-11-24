import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function check() {
  const files = fs.readdirSync(ADI_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`Checking ${files.length} PDFs in ${ADI_DIR}...`);

  for (const f of files) {
    const full = path.join(ADI_DIR, f);
    const data = new Uint8Array(fs.readFileSync(full));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    
    // Check first 3 pages for text
    let totalTextChars = 0;
    const checkPages = Math.min(3, doc.numPages);
    for (let p = 1; p <= checkPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const str = (tc.items || []).map(i => i.str).join('');
      totalTextChars += str.trim().length;
      page.cleanup();
    }
    
    const avgChars = (totalTextChars / checkPages).toFixed(0);
    const hasText = avgChars > 50;
    console.log(`- ${f}: ${doc.numPages} pages, avg chars/page (first 3): ${avgChars} -> ${hasText ? 'TEXT' : 'IMAGE/SCAN'}`);
  }
}

check().catch(console.error);
