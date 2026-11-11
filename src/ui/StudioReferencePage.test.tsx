import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioReferencePage } from './StudioReferencePage';

describe('Studio component reference', () => {
  afterEach(cleanup);
  it('exercises chip, switch, pager, toast, modal and drawer examples', () => {
    const { container } = render(<StudioReferencePage />);
    expect(container.querySelector('.studio-table td')).toHaveTextContent('MacBook Air M5');
    expect(container.querySelectorAll('.studio-button').length).toBeGreaterThan(0);
    const switchInput = screen.getByRole('switch', { name: 'Bật tùy chọn' });
    expect(switchInput.closest('.studio-switch')).toBeInTheDocument();
    expect(switchInput.nextElementSibling?.tagName).toBe('SPAN');
    expect([...container.querySelectorAll('button:not(.studio-button)')].every(button => button.closest('.studio-filter-chips'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Đang ẩn/ }));
    fireEvent.click(switchInput);
    expect(switchInput).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' })); expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử Toast' })); expect(screen.getByText('Đã lưu thay đổi.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Mở Modal' })[0]); expect(screen.getByRole('dialog', { name: 'Xác nhận hành động' })).toBeInTheDocument(); fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Mở Drawer' })[0]); expect(screen.getByRole('dialog', { name: 'Chi tiết' })).toBeInTheDocument(); fireEvent.keyDown(window, { key: 'Escape' });
  });
});
