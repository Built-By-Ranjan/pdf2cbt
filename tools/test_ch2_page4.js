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

      // Non-white pixel
      if (a > 30 && (r < 235 || g < 235 || b < 235)) {
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

async function testCh2Page4() {
  const data = new Uint8Array(fs.readFileSync('Adi/Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const p = await doc.getPage(4);
  const scale = 2.0;
  const vp = p.getViewport({ scale });
  const tc = await p.getTextContent();

  const pageW = vp.width / scale; // 540
  const pageH = vp.height / scale; // 780
  const midX = pageW * 0.5; // 270

  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;

  // Find question start tokens
  const qRegex = /^\s*(\d{1,3})\s*[.)]/;
  const col1 = [];
  const col2 = [];

  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const m = it.str.match(qRegex);
    if (m) {
      const qNum = parseInt(m[1], 10);
      const x = it.transform[4];
      const y = it.transform[5];
      const topY = pageH - y;
      if (x < midX) {
        col1.push({ qNum, topY, x });
      } else {
        col2.push({ qNum, topY, x });
      }
    }
  }

  col1.sort((a, b) => a.topY - b.topY);
  col2.sort((a, b) => a.topY - b.topY);

  console.log('Col 1 questions:', col1.map(q => `Q${q.qNum} at topY=${Math.round(q.topY)}`));
  console.log('Col 2 questions:', col2.map(q => `Q${q.qNum} at topY=${Math.round(q.topY)}`));

  const footerTopY = pageH - 54; // Solution link at y=54 -> topY = 726

  const outDir = 'tools/ch2_p4_crops';
  fs.mkdirSync(outDir, { recursive: true });

  // Crop Col 1
  for (let i = 0; i < col1.length; i++) {
    const cur = col1[i];
    const next = col1[i + 1];
    const startY = Math.max(0, cur.topY - 10);
    const endY = next ? (next.topY - 6) : (footerTopY - 6);

    const cX = Math.floor(0 * scale);
    const cY = Math.floor(startY * scale);
    const cW = Math.ceil(midX * scale);
    const cH = Math.ceil((endY - startY) * scale);

    const raw = createCanvas(cW, cH);
    const rCtx = raw.getContext('2d');
    rCtx.fillStyle = '#ffffff';
    rCtx.fillRect(0, 0, cW, cH);
    rCtx.drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

    const trimmed = autoTrimCanvas(raw, 12);
    const outPath = path.join(outDir, `Q${String(cur.qNum).padStart(3, '0')}.png`);
    fs.writeFileSync(outPath, trimmed.toBuffer('image/png'));
    console.log(`Saved Q${cur.qNum}: ${trimmed.width}x${trimmed.height}`);
  }

  // Crop Col 2
  for (let i = 0; i < col2.length; i++) {
    const cur = col2[i];
    const next = col2[i + 1];
    const startY = Math.max(0, cur.topY - 10);
    const endY = next ? (next.topY - 6) : (footerTopY - 6);

    const cX = Math.floor(midX * scale);
    const cY = Math.floor(startY * scale);
    const cW = Math.ceil((pageW - midX) * scale);
    const cH = Math.ceil((endY - startY) * scale);

    const raw = createCanvas(cW, cH);
    const rCtx = raw.getContext('2d');
    rCtx.fillStyle = '#ffffff';
    rCtx.fillRect(0, 0, cW, cH);
    rCtx.drawImage(canvas, cX, cY, cW, cH, 0, 0, cW, cH);

    const trimmed = autoTrimCanvas(raw, 12);
    const outPath = path.join(outDir, `Q${String(cur.qNum).padStart(3, '0')}.png`);
    fs.writeFileSync(outPath, trimmed.toBuffer('image/png'));
    console.log(`Saved Q${cur.qNum}: ${trimmed.width}x${trimmed.height}`);
  }
}

testCh2Page4();
