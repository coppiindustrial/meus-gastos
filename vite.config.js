import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH publica numa subpasta (GitHub Pages em /meus-gastos/). Em dev fica na raiz.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: { port: 5182, strictPort: true },
});
