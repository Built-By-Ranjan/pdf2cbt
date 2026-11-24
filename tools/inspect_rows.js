import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

function groupIntoColumnAwareLines(textContent, pageWidth) {
  const items = textContent.items.filter((it) => it.str && it.str.trim().length > 0);
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
  return rows.map(r => ({
    y: r.y,
    minX: Math.min(...r.items.map(it => it.x)),
    maxX: Math.max(...r.items.map(it => it.x)),
    text: r.items.sort((a, b) => a.x - b.x).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim()
  }));
}

async function run() {
  const file1 = path.resolve('../test file/114001_IIT_GROWTH_3_July_MINOR_01_02_08_2026_Student_Copy.pdf');
  const data = new Uint8Array(fs.readFileSync(file1));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  const p4 = await doc.getPage(4);
  const vp = p4.getViewport({ scale: 1 });
  const tc = await p4.getTextContent();
  const rows = groupIntoColumnAwareLines(tc, vp.width);
  console.log(`Page width: ${vp.width}, Page height: ${vp.height}`);
  for (let i = 0; i < rows.length; i++) {
    if (/part|math|section/i.test(rows[i].text)) {
      console.log(`Row ${i}: y=${rows[i].y}, minX=${rows[i].minX}, text="${rows[i].text}"`);
    }
  }
}

run().catch(console.error);
