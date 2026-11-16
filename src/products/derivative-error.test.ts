import { describe, expect, it } from 'vitest';
import { derivativeFailureMessage } from './derivative-error';

describe('derivativeFailureMessage', () => {
  it('explains oversized source images in plain language', () => {
    expect(derivativeFailureMessage('source_pixel_limit_exceeded')).toBe('Ảnh gốc quá lớn (vượt 24 megapixel)');
  });

  it('keeps unknown error codes visible with a general failure message', () => {
    expect(derivativeFailureMessage('storage_failed')).toBe('Tạo bản ảnh thất bại · mã lỗi: storage_failed');
  });

  it('uses a general retryable message when the API has no error code', () => {
    expect(derivativeFailureMessage(null)).toBe('Tạo bản ảnh thất bại · có thể thử lại');
  });
});
