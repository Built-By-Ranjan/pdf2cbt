import fs from 'fs';

const cache = JSON.parse(fs.readFileSync('tools/adi_ocr_cache.json', 'utf8'));
const p98 = cache['Challenge 13_Top 100 Graphical Questions.pdf_p98'] || [];
console.log(`Page 98 items count: ${p98.length}`);
for (const item of p98) {
  console.log(item.text);
}
