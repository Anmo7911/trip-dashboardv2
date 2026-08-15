import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        squad: resolve(__dirname, 'squad.html'),
        route: resolve(__dirname, 'route.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
});
