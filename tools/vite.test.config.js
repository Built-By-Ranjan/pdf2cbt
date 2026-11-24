import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node18',
    ssr: 'scripts/test_cbt_flow.js',
    outDir: 'dist-test',
    rollupOptions: {
      output: {
        entryFileNames: 'test_cbt_flow.cjs',
        format: 'cjs',
      },
    },
  },
});
