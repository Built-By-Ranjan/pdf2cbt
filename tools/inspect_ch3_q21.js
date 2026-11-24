import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const ADI_DIR = 'P:/work/ptocbt/Adi';

async function checkCh3Q21() {
  const f = 'Challenge 3_Top 200 Questions of JEE Main 2024 Physics.pdf';
  const full = path.join(ADI_DIR, f);
  const data = new Uint8Array(fs.readFileSync(full));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const page = await doc.getPage(34);
  const tc = await page.getTextContent();
  const raw = tc.items.map(i => i.str).join(' ');
  const idx = raw.indexOf('20.');
  console.log('Snippet around 20.:', JSON.stringify(raw.substring(idx - 10, idx + 100)));
}

checkCh3Q21().catch(console.error);
