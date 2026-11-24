import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function run() {
  const file3 = path.resolve('../test file/133003_IIT_JEE_MAINS_CONQUER_June_MINOR_03_02_08_2026_Faculty_Copy (1).pdf');
  const data = new Uint8Array(fs.readFileSync(file3));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const p3 = await doc.getPage(3);
  const tc = await p3.getTextContent();
  const text = tc.items.map(it => it.str).join(' ');
  console.log('--- PAGE 3 RAW TEXT ---');
  console.log(text);
}

run().catch(console.error);
