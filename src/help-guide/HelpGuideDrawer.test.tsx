import { describe, expect, it } from 'vitest';
import { getHelpGuide } from './HelpGuideDrawer';
import { helpGuides } from '../helpGuideContent';

describe('contextual help guide routing', () => {
  it('provides a static guide for all 20 approved route entries', () => {
    expect(Object.keys(helpGuides)).toHaveLength(20);
    expect(Object.values(helpGuides).every(guide => guide.title && guide.eyebrow && guide.steps.length > 0 && guide.notes.length > 0)).toBe(true);
  });

  it('maps one-segment product detail routes and banned item creation to their approved guides', () => {
    expect(getHelpGuide('/products/sku-42')?.title).toBe('Product Detail');
    expect(getHelpGuide('/products/sku-42/images')).toBeUndefined();
    expect(getHelpGuide('/banned-items/new')).toBe(getHelpGuide('/banned-items'));
  });

  it('does not fall back to a different page guide for unsupported paths', () => {
    expect(getHelpGuide('/studio-components')).toBeUndefined();
    expect(getHelpGuide('/products/sku-42/unknown')).toBeUndefined();
  });

  it('preserves approved Affiliate Links permission wording as static copy', () => {
    expect(getHelpGuide('/affiliate-links')?.permission).toBe('🔒 Chưa gắn permission — mọi admin đã đăng nhập đều xem được qua URL trực tiếp.');
  });
});
