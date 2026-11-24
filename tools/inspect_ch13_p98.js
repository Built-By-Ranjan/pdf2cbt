import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const cache = JSON.parse(fs.readFileSync('tools/adi_ocr_cache.json', 'utf8'));

console.log('Page 98 OCR cache for Challenge 13:');
console.log(cache['Challenge 13_Top 100 Graphical Questions.pdf_p98']);
