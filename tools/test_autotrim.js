import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

function autoTrimCanvas(srcCanvas, padding = 12) {
  const ctx = srcCanvas.getContext('2d');
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // If not near-white and opaque
      if (a > 30 && (r < 240 || g < 240 || b < 240)) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) return srcCanvas;

  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropW = Math.min(w - cropX, (maxX - minX) + padding * 2);
  const cropH = Math.min(h - cropY, (maxY - minY) + padding * 2);

  const trimmed = createCanvas(cropW, cropH);
  const tCtx = trimmed.getContext('2d');
  tCtx.fillStyle = '#ffffff';
  tCtx.fillRect(0, 0, cropW, cropH);
  tCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return trimmed;
}

async function testTrim() {
  const data = new Uint8Array(fs.readFileSync('Adi/Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const p = await doc.getPage(1);
  const vp = p.getViewport({ scale: 2.0 });

  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;

  // Let's crop Q2: y from 248 to 372 at 2x scale, x from 0 to 540 (left half)
  const q2Raw = createCanvas(540, 140);
  const q2Ctx = q2Raw.getContext('2d');
  q2Ctx.fillStyle = '#ffffff';
  q2Ctx.fillRect(0, 0, 540, 140);
  q2Ctx.drawImage(canvas, 0, 248, 540, 140, 0, 0, 540, 140);

  const q2Trimmed = autoTrimCanvas(q2Raw, 14);
  fs.writeFileSync('tools/q2_trimmed.png', q2Trimmed.toBuffer('image/png'));
  console.log(`Q2 trimmed size: ${q2Trimmed.width}x${q2Trimmed.height}`);
}

testTrim();
