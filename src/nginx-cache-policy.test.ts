import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nginxConfig = readFileSync(`${process.cwd()}/nginx.conf`, 'utf8');

describe('static asset cache policy', () => {
  it('revalidates the SPA document so deployments stop serving stale bundles', () => {
    expect(nginxConfig).toMatch(/location = \/index\.html\s*\{[^}]*Cache-Control "no-store, no-cache, must-revalidate"/s);
    expect(nginxConfig).toMatch(/location \/\s*\{[^}]*try_files \$uri \$uri\/ \/index\.html;[^}]*Cache-Control "no-store, no-cache, must-revalidate"/s);
  });

  it('allows content-hashed assets to be cached immutably', () => {
    expect(nginxConfig).toMatch(/location \/assets\/\s*\{[^}]*expires 1y;[^}]*Cache-Control "public, immutable"/s);
  });
});
