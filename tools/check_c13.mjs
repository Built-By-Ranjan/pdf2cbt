import fs from 'fs';
import * as pdfjsLib from '../paper2cbt/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

async function check() {
  const data = new Uint8Array(fs.readFileSync('P:/work/ptocbt/Adi/Challenge 13_Top 100 Graphical Questions.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  console.log('numPages:', doc.numPages);
  for (const pNum of [1, 2, 50, 97, 98]) {
    const p = await doc.getPage(pNum);
    const vp = p.getViewport({ scale: 1.0 });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    fs.writeFileSync(`tools/c13_p${pNum}.png`, canvas.toBuffer('image/png'));
    console.log(`Saved tools/c13_p${pNum}.png`);
  }
}
check();
