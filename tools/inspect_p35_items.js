import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkP35Items() {
  const f = 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(35);
  const tc = await page.getTextContent();
  const raw = tc.items.map(i => i.str).join(' ');
  const idx = raw.indexOf('101');
  console.log('Around 101:', raw.substring(idx, idx + 400));
}

checkP35Items().catch(console.error);
