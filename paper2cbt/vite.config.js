import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for Paper2CBT
// - Splits pdfjs-dist and tesseract.js into separate chunks (they are heavy)
// - Copies the pdf.js worker automatically via ?url import in pdfService
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          tesseract: ['tesseract.js']
        }
      }
    }
  },
  worker: {
    format: 'es'
  }
});
