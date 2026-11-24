import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

async function testCrop() {
  const filePath = 'P:/work/ptocbt/Adi/Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf';
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(2);
  const vp = page.getViewport({ scale: 1 });
  console.log(`Page width: ${vp.width}, height: ${vp.height}`);

  // Let's test cropping top 200 pts of page 2 (rawTop = 50, rawBottom = 250)
  const rawTop = 50;
  const rawBottom = 250;
  const cropH = rawBottom - rawTop;
  const scale = 1.5;

  // Way A: old formula
  const vpA = page.getViewport({
    scale,
    offsetX: 0,
    offsetY: -(vp.height - rawBottom) * scale
  });
  console.log('vpA transform:', vpA.transform);

  // Way B: top-down offset
  const vpB = page.getViewport({
    scale,
    offsetX: 0,
    offsetY: -rawTop * scale
  });
  console.log('vpB transform:', vpB.transform);

  // Render both to canvas and check
  const cA = createCanvas(Math.ceil(vp.width * scale), Math.ceil(cropH * scale));
  const ctxA = cA.getContext('2d');
  ctxA.fillStyle = '#ffffff';
  ctxA.fillRect(0, 0, cA.width, cA.height);
  await page.render({ canvasContext: ctxA, viewport: vpA }).promise;
  fs.writeFileSync('tools/crop_test_A.png', cA.toBuffer('image/png'));

  const cB = createCanvas(Math.ceil(vp.width * scale), Math.ceil(cropH * scale));
  const ctxB = cB.getContext('2d');
  ctxB.fillStyle = '#ffffff';
  ctxB.fillRect(0, 0, cB.width, cB.height);
  await page.render({ canvasContext: ctxB, viewport: vpB }).promise;
  fs.writeFileSync('tools/crop_test_B.png', cB.toBuffer('image/png'));

  console.log('Rendered crop_test_A.png and crop_test_B.png');
}

testCrop();
