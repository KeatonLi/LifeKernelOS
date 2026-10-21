import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 4173,
    allowedHosts: ['terminal.local'],
    proxy: {
      '/api': 'http://127.0.0.1:3000'
    }
  }
});
