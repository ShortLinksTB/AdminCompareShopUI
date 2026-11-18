import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/App.tsx', 'src/dashboard/Dashboard.tsx', 'src/dashboard/dashboard-api.ts', 'src/auth.tsx', 'src/auth-service.ts', 'src/auth-utils.ts', 'src/api-client.ts', 'src/matching/MatchingPage.tsx', 'src/matching/matching-api.ts', 'src/BannedItems.tsx', 'src/bannedItemsApi.ts', 'src/PartnerShops.tsx', 'src/shopsApi.ts', 'src/products/ProductsPage.tsx', 'src/products/products-api.ts', 'src/products/AdminCompareShopProductImages.tsx', 'src/products/product-images-api.ts', 'src/offers/OffersPage.tsx', 'src/offers/offers-api.ts', 'src/sync-jobs/SyncJobsPage.tsx', 'src/sync-jobs/sync-jobs-api.ts', 'src/categories/CategoriesPage.tsx', 'src/categories/categories-api.ts', 'src/users/UsersPage.tsx', 'src/users/users-api.ts', 'src/auditLogs/AuditLogsPage.tsx', 'src/auditLogs/audit-logs-api.ts', 'src/files/FilesPage.tsx', 'src/files/DerivativeModal.tsx', 'src/files/files-api.ts', 'src/blog/AdminCompareShopBlog.tsx', 'src/blog/articles-api.ts', 'src/ui/index.tsx', 'src/ui/StudioReferencePage.tsx', 'src/settings/SettingsPage.tsx', 'src/price-alerts/PriceAlertsPage.tsx', 'src/price-history/PriceHistoryPage.tsx', 'src/data-sources/DataSourcesPage.tsx', 'src/home-showcase/HomeShowcasePage.tsx', 'src/home-showcase/home-showcase-api.ts', 'src/helpGuide/HelpGuide.tsx'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
