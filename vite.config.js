import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        squad: resolve(__dirname, 'squad.html'),
        route: resolve(__dirname, 'route.html'),
        chat: resolve(__dirname, 'chat.html'),
        archives: resolve(__dirname, 'archives.html'),
        // add any additional HTML files here
      }
    }
  }
});
