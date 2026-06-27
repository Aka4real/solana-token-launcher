import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Solana web3.js needs global and process to be defined in browser
    global: 'globalThis',
    'process.env': {},
  },
});
