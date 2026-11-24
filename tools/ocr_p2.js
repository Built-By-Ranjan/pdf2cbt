import fs from 'fs';
import { createWorker } from 'tesseract.js';

async function ocrP2() {
  const worker = await createWorker('eng');
  const { data: { text, blocks } } = await worker.recognize('tools/ch14_page2.png');
  console.log('--- Page 2 OCR text ---');
  console.log(text);
  await worker.terminate();
}
ocrP2();
