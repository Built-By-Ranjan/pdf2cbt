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

async function sliceChallenge2() {
  const filePath = 'Adi/Challenge 2_Top 200 Questions of JEE Main 2023 Physics.pdf';
  const examId = 'challenge_2';
  const outDir = 'paper2cbt/public/exams/challenge_2';
  fs.mkdirSync(outDir, { recursive: true });

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const numPages = doc.numPages;

  console.log(`Processing Challenge 2 (${numPages} pages)`);

  const scale = 2.0; // Ultra-crisp 2x resolution
  const qRegex = /^\s*(?:Q\.?\s*)?(\d{1,3})\s*[.)]/;

  const extracted = [];

  for (let pNum = 1; pNum <= numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const vp = page.getViewport({ scale });
    const tc = await page.getTextContent();

    const pageW = vp.width / scale;
    const pageH = vp.height / scale;
    const midX = pageW * 0.5;

    // Check if cover / index page
    const rawText = tc.items.map(it => it.str).join(' ');
    if (
      /^\s*200\s+PHYSICS\s+QUESTIONS/i.test(rawText) ||
      /INTRODUCTION\s+PHYSICS\s+EDUNITI/i.test(rawText) ||
      (/INDEX\s+TOP\s+200/i.test(rawText) && /Chapter/i.test(rawText)) ||
      /OFFICIAL\s+ANSWER\s+KEY/i.test(rawText)
    ) {
      console.log(`Skipping non-question page ${pNum}`);
      page.cleanup();
      continue;
    }

    // Render page canvas once
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Find question markers
    const col1 = [];
    const col2 = [];

    // Find footer position if any (e.g. Solution Link, Mohit Goenka)
    let footerTopY = pageH - 30; // default bottom margin

    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const topY = pageH - y;

      if (/Solution\s+Link|Mohit\s+Goenka|LEARN\s+LIKE\s+NEVER|EDUNITI\s*$/i.test(it.str) && topY > pageH * 0.75) {
        if (topY < footerTopY) footerTopY = topY;
      }

      const m = it.str.match(qRegex);
      if (m) {
        const qNum = parseInt(m[1], 10);
        if (qNum > 0 && qNum <= 300) {
          if (x < midX) {
            col1.push({ qNum, topY, x });
          } else {
            col2.push({ qNum, topY, x });
          }
        }
      }
    }

    col1.sort((a, b) => a.topY - b.topY);
    col2.sort((a, b) => a.topY - b.topY);

    // If no questions on page, skip
    if (col1.length === 0 && col2.length === 0) {
      page.cleanup();
      continue;
    }

    // Process Column 1 (Left: 0 to midX)
    for (let i = 0; i < col1.length; i++) {
      const cur = col1[i];
      const next = col1[i + 1];
      const startY = Math.max(0, cur.topY - 12);
      const endY = next ? (next.topY - 4) : (footerTopY - 4);

      if (endY - startY < 20) continue;

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
      const fileName = `Q${String(cur.qNum).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(outDir, fileName), trimmed.toBuffer('image/png'));
      extracted.push(cur.qNum);
    }

    // Process Column 2 (Right: midX to pageW)
    for (let i = 0; i < col2.length; i++) {
      const cur = col2[i];
      const next = col2[i + 1];
      const startY = Math.max(0, cur.topY - 12);
      const endY = next ? (next.topY - 4) : (footerTopY - 4);

      if (endY - startY < 20) continue;

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
      const fileName = `Q${String(cur.qNum).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(outDir, fileName), trimmed.toBuffer('image/png'));
      extracted.push(cur.qNum);
    }

    page.cleanup();
  }

  console.log(`Extracted ${extracted.length} questions from Challenge 2!`);
  console.log(`Sample: Q1..Q10:`, extracted.slice(0, 10));
}

sliceChallenge2();
