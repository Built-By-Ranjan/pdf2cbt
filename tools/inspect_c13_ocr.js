import fs from 'fs';

const cache = JSON.parse(fs.readFileSync('tools/adi_ocr_cache.json', 'utf8'));
const k = Object.keys(cache).filter(k => k.includes('Challenge 13'));
console.log(`Found ${k.length} entries for Challenge 13 in OCR cache.`);
for (const key of k.slice(-5)) {
  console.log(`\n--- ${key} ---`);
  console.log(cache[key].slice(0, 200));
}
