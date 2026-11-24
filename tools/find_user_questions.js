import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import { createCanvas } from '@napi-rs/canvas';

async function findUserQuestions() {
  const worker = await createWorker('eng');
  const files = fs.readdirSync('Adi').filter(f => f.endsWith('.pdf'));
  for (const f of files) {
    console.log('Scanning:', f);
    const data = new Uint8Array(fs.readFileSync('Adi/' + f));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    for (let pNum = 1; pNum <= Math.min(6, doc.numPages); pNum++) {
      const p = await doc.getPage(pNum);
      const vp = p.getViewport({ scale: 1.0 });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      const { data: { text } } = await worker.recognize(canvas.toBuffer('image/png'));
      if (/resistances|travelling microscope|refractive|unit vector/i.test(text)) {
        console.log('!!! FOUND IN:', f, 'page:', pNum);
        console.log(text.substring(0, 300));
        await worker.terminate();
        return;
      }
    }
  }
  console.log('Not found in first 6 pages of any Adi PDF');
  await worker.terminate();
}
findUserQuestions();
