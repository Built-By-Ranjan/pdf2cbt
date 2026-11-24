import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkAll() {
  const files = fs.readdirSync(ADI_DIR).filter(f => f.endsWith('.pdf'));
  console.log(`Checking ${files.length} files in Adi:`);

  for (const f of files) {
    const filePath = path.join(ADI_DIR, f);
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data }).promise;

    let sparsePages = 0;
    for (let pNum = 1; pNum <= doc.numPages; pNum++) {
      const page = await doc.getPage(pNum);
      const tc = await page.getTextContent();
      const str = tc.items.map(i => i.str).join(' ').trim();
      const cleanChars = str.replace(/\s+/g, '').length;
      if (cleanChars < 200 || tc.items.length <= 6) {
        sparsePages++;
      }
      page.cleanup();
    }
    const ratio = (sparsePages / doc.numPages).toFixed(2);
    console.log(`${f.padEnd(60)} : ${doc.numPages} pgs, ${sparsePages} sparse (${ratio})`);
  }
}

checkAll();
