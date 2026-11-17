import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpGuide, guideForPath } from './HelpGuide';
import guides from './helpGuides.json';

afterEach(cleanup);

describe('route-keyed help guide', () => {
  it('contains the approved static guide for each of the 20 routes', () => {
    expect(guides).toHaveLength(20);
    expect(guideForPath('/')).toMatchObject({ title: 'Dashboard', route: '/' });
    expect(guideForPath('/affiliate-links')?.permission).toBe('🔒 Chưa gắn permission — mọi admin đã đăng nhập đều xem được qua URL trực tiếp.');
    expect(guideForPath('/studio-components')).toBeUndefined();
    expect(guideForPath('/products/42/images')).toBeUndefined();
  });

  it('maps supported dynamic and shared routes to their specified guides', () => {
    expect(guideForPath('/products/42')?.title).toBe('Product Detail');
    expect(guideForPath('/products/42/')?.title).toBe('Product Detail');
    expect(guideForPath('/banned-items/new')?.title).toBe('Banned items');
  });

  it('does not render a trigger for an unsupported route', () => {
    render(<HelpGuide pathname="/studio-components" />);
    expect(screen.queryByRole('button', { name: 'Hướng dẫn trang này' })).not.toBeInTheDocument();
  });

  it('opens route-specific copy and returns focus after Escape and overlay close', () => {
    const apiCall = vi.fn();
    render(<div className="studio-shell"><HelpGuide pathname="/products" /></div>);
    const trigger = screen.getByRole('button', { name: 'Hướng dẫn trang này' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Products');
    const layer = document.querySelector<HTMLElement>('.help-guide-layer')!;
    expect(layer.parentElement).toHaveClass('studio-shell');
    expect(layer).toHaveClass('help-guide-layer');
    expect(layer).toHaveStyle({ width: '100vw', height: '100dvh' });
    expect(screen.getByText('Hướng dẫn sử dụng')).toBeInTheDocument();
    expect(screen.getByText('Dùng ô tìm kiếm để lọc theo tên sản phẩm, brand hoặc SKU; dùng bộ lọc trạng thái và "Filters" để thu hẹp danh sách.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();
    expect(apiCall).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.querySelector('.help-guide-overlay')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders danger callouts and closes with the drawer button', () => {
    render(<div className="studio-shell"><HelpGuide pathname="/" /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn trang này' }));
    expect(document.querySelector('.help-guide-notes .danger')).toHaveTextContent('Data health dưới 90%');
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
