import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/auth.tsx', 'src/auth-service.ts', 'src/auth-utils.ts', 'src/api-client.ts', 'src/matching/MatchingPage.tsx', 'src/matching/matching-api.ts', 'src/BannedItems.tsx', 'src/bannedItemsApi.ts'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
