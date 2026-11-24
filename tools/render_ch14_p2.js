import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

async function renderP2() {
  const data = new Uint8Array(fs.readFileSync('Adi/Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const p = await doc.getPage(2);
  const vp = p.getViewport({ scale: 2.0 });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;
  fs.writeFileSync('tools/ch14_page2.png', canvas.toBuffer('image/png'));
  console.log('Saved tools/ch14_page2.png');
}
renderP2();
