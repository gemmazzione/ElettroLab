/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Variabili d'ambiente di Node (senza dipendere da @types/node).
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // Percorsi relativi: la build funziona nella radice del sito o in una sottocartella (es. hosting Aruba).
  base: './',
  plugins: [react(), tailwindcss()],
  // Sviluppo: con ELECTROLAB_API_PROXY (es. http://127.0.0.1:8099) le chiamate a /api vanno a un server PHP locale.
  server: process.env.ELECTROLAB_API_PROXY ? { proxy: { '/api': { target: process.env.ELECTROLAB_API_PROXY, changeOrigin: false } } } : undefined,
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
