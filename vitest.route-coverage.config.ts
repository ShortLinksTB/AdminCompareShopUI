import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/App.test.tsx'],
    coverage: {
      include: ['src/App.tsx'],
      reporter: ['text', 'json'],
    },
  },
});
