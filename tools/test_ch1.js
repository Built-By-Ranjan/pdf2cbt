import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

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
  return rows.map(r => ({ text: r.items.map(it => it.str).join(' '), y: r.y }));
}

const data = new Uint8Array(fs.readFileSync('P:/work/ptocbt/Adi/Challenge 1_All PYQs of JEE Main 2019.pdf'));
const doc = await pdfjsLib.getDocument({ data }).promise;

const page = await doc.getPage(3);
const tc = await page.getTextContent();
console.log('Items:', tc.items.map(i => i.str).filter(s => s.trim().length > 0));
const lines = groupIntoColumnAwareLines(tc, page.view[2]);
console.log('Lines:', lines);
