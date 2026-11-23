/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // En GitHub Pages la app se sirve desde /<repositorio>/ (ver .github/workflows/pages.yml).
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Con VITE_API_URL=/api las consultas pasan por Vite hacia el backend local:
    // sin CORS y funciona también desde el celular (misma red / túnel).
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
  test: { environment: 'node' },
});
