export function derivativeFailureMessage(errorCode?: string | null): string {
  if (errorCode === 'source_pixel_limit_exceeded') return 'Ảnh gốc quá lớn (vượt 24 megapixel)';
  if (errorCode) return `Tạo bản ảnh thất bại · mã lỗi: ${errorCode}`;
  return 'Tạo bản ảnh thất bại · có thể thử lại';
}
