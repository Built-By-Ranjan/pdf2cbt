import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkP35() {
  const f = 'Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(35);
  const tc = await page.getTextContent();
  const raw = tc.items.map(i => i.str).join(' ');
  const idx = raw.indexOf('30');
  console.log('Around 30:', raw.substring(Math.max(0, idx - 50), idx + 200));
}

checkP35().catch(console.error);
