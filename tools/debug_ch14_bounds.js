import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

function groupIntoColumnAwareLines(textContent, pageWidth) {
  const items = (textContent.items || []).filter((it) => it.str && it.str.trim().length > 0);
  if (items.length === 0) return [];
  const rows = [];
  const Y_TOLERANCE = 3;
  for (const item of items) {
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ str: item.str, x });
  }
  rows.sort((a, b) => b.y - a.y);
  const midX = pageWidth * 0.5;
  const leftCol = [];
  const rightCol = [];
  const topHeaders = [];
  const gapThreshold = pageWidth * 0.08;
  let firstParallelY = -Infinity;
  for (const row of rows) {
    const xs = row.items.map((it) => it.x);
    const sortedXs = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < sortedXs.length - 1; i++) {
      if (sortedXs[i + 1] - sortedXs[i] >= gapThreshold) {
        firstParallelY = Math.max(firstParallelY, row.y);
        break;
      }
    }
  }
  for (const row of rows) {
    const leftItems = row.items.filter((it) => it.x < midX);
    const rightItems = row.items.filter((it) => it.x >= midX);
    if (row.y > firstParallelY + Y_TOLERANCE) {
      const sorted = row.items.sort((a, b) => a.x - b.x);
      const text = sorted.map((it) => it.str).join(' ').trim();
      if (text) topHeaders.push({ text, column: 0, y: row.y, x: sorted[0].x });
    } else {
      if (leftItems.length > 0) {
        const sorted = leftItems.sort((a, b) => a.x - b.x);
        const text = sorted.map((it) => it.str).join(' ').trim();
        if (text) leftCol.push({ text, column: 1, y: row.y, x: sorted[0].x });
      }
      if (rightItems.length > 0) {
        const sorted = rightItems.sort((a, b) => a.x - b.x);
        const text = sorted.map((it) => it.str).join(' ').trim();
        if (text) rightCol.push({ text, column: 2, y: row.y, x: sorted[0].x });
      }
    }
  }
  return [...topHeaders, ...leftCol, ...rightCol];
}

async function debug() {
  const data = new Uint8Array(fs.readFileSync('Adi/Challenge 14_30 Experiment & Instruments Questions_Eduniti.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const p = await doc.getPage(1);
  const vp = p.getViewport({ scale: 2.0 }); // 2x scale for ultra crisp rendering
  const tc = await p.getTextContent();
  const columnLines = groupIntoColumnAwareLines(tc, vp.width / 2.0);

  const pageW = vp.width / 2.0;
  const pageH = vp.height / 2.0;

  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;

  // Let's inspect column 1 question starts
  const col1Lines = columnLines.filter(l => l.column === 1);
  const col2Lines = columnLines.filter(l => l.column === 2);

  const toTopDown = (y) => pageH - y;

  const col1Starts = col1Lines
    .filter(l => /^\s*(\d{1,3})\s*[.)]/.test(l.text))
    .map(l => ({ num: parseInt(l.text.match(/^\s*(\d{1,3})/)[1]), topY: toTopDown(l.y) }));
  
  const col2Starts = col2Lines
    .filter(l => /^\s*(\d{1,3})\s*[.)]/.test(l.text))
    .map(l => ({ num: parseInt(l.text.match(/^\s*(\d{1,3})/)[1]), topY: toTopDown(l.y) }));

  col1Starts.sort((a, b) => a.topY - b.topY);
  col2Starts.sort((a, b) => a.topY - b.topY);

  const footerTopY = toTopDown(44); // 44 is solution click

  const crops = [];

  // Column 1: left half (0 to pageW * 0.5)
  for (let i = 0; i < col1Starts.length; i++) {
    const cur = col1Starts[i];
    const next = col1Starts[i + 1];
    const startY = Math.max(0, cur.topY - 14);
    const endY = next ? (next.topY - 6) : (footerTopY - 10);
    crops.push({
      num: cur.num,
      startX: 0,
      endX: pageW * 0.5,
      startY,
      endY
    });
  }

  // Column 2: right half (pageW * 0.5 to pageW)
  for (let i = 0; i < col2Starts.length; i++) {
    const cur = col2Starts[i];
    const next = col2Starts[i + 1];
    const startY = Math.max(0, cur.topY - 14);
    const endY = next ? (next.topY - 6) : (footerTopY - 10);
    crops.push({
      num: cur.num,
      startX: pageW * 0.5,
      endX: pageW,
      startY,
      endY
    });
  }

  const outDir = 'tools/test_crops';
  fs.mkdirSync(outDir, { recursive: true });

  const scale = 2.0;
  for (const c of crops) {
    const cropX = Math.floor(c.startX * scale);
    const cropY = Math.floor(c.startY * scale);
    const cropW = Math.ceil((c.endX - c.startX) * scale);
    const cropH = Math.ceil((c.endY - c.startY) * scale);

    const cropCanvas = createCanvas(cropW, cropH);
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, cropW, cropH);
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const outPath = path.join(outDir, `Q${String(c.num).padStart(3, '0')}.png`);
    fs.writeFileSync(outPath, cropCanvas.toBuffer('image/png'));
    console.log(`Saved Q${c.num}: ${cropW}x${cropH} at (${cropX}, ${cropY})`);
  }
}

debug();
