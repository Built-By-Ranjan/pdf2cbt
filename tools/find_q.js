import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function findQuestion() {
  const files = fs.readdirSync(ADI_DIR).filter(f => f.endsWith('.pdf'));
  for (const f of files) {
    const data = new Uint8Array(fs.readFileSync(path.join(ADI_DIR, f)));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const text = tc.items.map(i => i.str).join(' ');
      if (text.includes('Two resistances are given') || text.includes('travelling microscope') || text.includes('unit vector in the direction') || text.includes('refractive index')) {
        console.log(`FOUND IN: ${f} on page ${p}`);
      }
      page.cleanup();
    }
  }
}
findQuestion();
