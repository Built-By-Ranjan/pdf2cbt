import { defineConfig } from '../paper2cbt/node_modules/vite/dist/node/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const entryFile = path.resolve(__dirname, '.current_entry');
const entry = (fs.existsSync(entryFile) && fs.readFileSync(entryFile, 'utf-8').trim()) || process.env.TOOL_ENTRY || 'tools/run_adi_batch.js';
const outName = process.env.TOOL_OUT || 'tool_runner.cjs';

export default defineConfig({
  root: path.resolve(__dirname, '../paper2cbt'),
  resolve: {
    alias: {
      'pdfjs-dist/legacy/build/pdf.mjs': path.resolve(__dirname, '../paper2cbt/node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
      'tesseract.js': path.resolve(__dirname, '../paper2cbt/node_modules/tesseract.js/src/index.js'),
      '../src': path.resolve(__dirname, '../paper2cbt/src'),
      '../../src': path.resolve(__dirname, '../paper2cbt/src'),
    },
  },
  build: {
    target: 'node18',
    ssr: path.resolve(__dirname, '..', entry),
    outDir: path.resolve(__dirname, '../paper2cbt/dist-test'),
    emptyOutDir: false,
    rollupOptions: {
      external: ['@napi-rs/canvas', 'tesseract.js'],
      output: {
        entryFileNames: outName,
        format: 'cjs',
      },
    },
  },
});
