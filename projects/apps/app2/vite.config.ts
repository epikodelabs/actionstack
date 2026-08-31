import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  root: __dirname, // projects/apps/app2
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      '@epikodelabs/actionstack': path.resolve(
        __dirname,
        '../../libraries/actionstack/src/public-api.ts'
      ),
      '@epikodelabs/actionstack/tools': path.resolve(
        __dirname,
        '../../libraries/actionstack/tools/src/public-api.ts'
      ),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
