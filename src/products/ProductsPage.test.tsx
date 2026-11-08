import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { ProductsPage } from './ProductsPage';
import type { AdminProduct, AdminRequest } from './products-api';

const phone: AdminProduct = { id: 42, slug: 'phone-a', name: 'Phone A', brand: 'Brand A', description: 'Good phone', seoTitle: null, seoDescription: null, categoryId: 7, isActive: true, imageUrl: 'https://img.example/phone.jpg' };
const inactive = { ...phone, id: 43, slug: 'phone-b', name: 'Phone B', categoryId: 8, isActive: false, imageUrl: null };
const categoryList = [{ id: 1006, slug: 'electronics', name: 'Electronics', isActive: true, parentCategoryId: null }, { id: 7, slug: 'phones', name: 'Phones', isActive: true, parentCategoryId: 1006 }, { id: 8, slug: 'audio', name: 'Audio', isActive: true, parentCategoryId: 1006 }];
const pageResponse = (items: AdminProduct[] = [phone], pageNumber = 1, pageSize = 10, totalItems = items.length) => Response.json({ items, pageNumber, pageSize, totalItems });
const matching = { id: 501, name: 'Phone A Global Edition', externalSku: 'SKU-501', dataSourceId: 11, dataSourceDisplayName: 'Shop One', createdAtUtc: '2026-10-12T10:00:00Z' };

function requestFor(rows = [phone, inactive]): ReturnType<typeof vi.fn<AdminRequest>> {
  return vi.fn<AdminRequest>().mockImplementation(path => path.startsWith('/admin/categories')
    ? Promise.resolve(Response.json({ items: categoryList, pageNumber: 1, pageSize: 100, totalItems: categoryList.length }))
    : Promise.resolve(pageResponse(rows, 1, 10, rows.length)));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ProductsPage', () => {
  it('loads paged products and category names with the default page size of 10', async () => {
    const requestAdmin = requestFor();
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read']} />);

    expect(await screen.findByText('Phone A')).toBeInTheDocument();
    expect(screen.getByText('Phones')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('phone-a')).toBeInTheDocument();
    expect(screen.queryByText(/ID 42/)).not.toBeInTheDocument();
    expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=10', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(requestAdmin).toHaveBeenCalledWith('/admin/categories?page=1&pageSize=100', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(document.querySelector('.products-total')).toHaveTextContent('Tổng 2 sản phẩm');
  });

  it('keeps the loading state until the API resolves and shows an empty state', async () => {
    let resolveProducts!: (response: Response) => void;
    const requestAdmin = vi.fn<AdminRequest>().mockImplementation(path => path.startsWith('/admin/categories')
      ? Promise.resolve(Response.json({ items: categoryList }))
      : new Promise(resolve => { resolveProducts = resolve; }));
    render(<ProductsPage requestAdmin={requestAdmin} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading products');
    resolveProducts(pageResponse([], 1, 10, 0));
    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('applies status filtering on the server and uses the returned filtered total', async () => {
    const requestAdmin = requestFor([phone, inactive]);
    render(<ProductsPage requestAdmin={requestAdmin} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'All status' }));
    fireEvent.click(screen.getByRole('option', { name: /Inactive/ }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=10&isActive=false', expect.any(Object)));
    expect(document.querySelector('.products-total')).toHaveTextContent('Tổng 2 sản phẩm');
    expect(screen.getByRole('button', { name: 'Inactive' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Filter by status' })).not.toBeInTheDocument();
  });

  it.each([
    'All status',
    'Active',
    'Inactive',
  ])('closes the status menu after selecting %s', async (label) => {
    render(<ProductsPage requestAdmin={requestFor()} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'All status' }));
    fireEvent.click(screen.getByRole('option', { name: new RegExp(label) }));

    expect(screen.queryByRole('listbox', { name: 'Filter by status' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false');
  });

  it('changes page size through the API and moves to the first page', async () => {
    const requestAdmin = requestFor();
    render(<ProductsPage requestAdmin={requestAdmin} />);
    await screen.findByText('Phone A');
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '20' } });
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products?page=1&pageSize=20', expect.any(Object)));
  });

  it('selects the current page rows through the table checkboxes', async () => {
    render(<ProductsPage requestAdmin={requestFor()} />);
    await screen.findByText('Phone A');
    const all = screen.getByRole('checkbox', { name: 'Select all products' });
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone A' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Phone B' })).toBeChecked();
  });

  it('shows missing-image text and opens a zoomable lightbox that closes with Escape', async () => {
    const addEventListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const requestAdmin = requestFor();
    render(<ProductsPage requestAdmin={requestAdmin} />);
    await screen.findByText('Phone A');
    expect(screen.getByText('No image')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View image of Phone A' }));
    const image = screen.getByRole('img', { name: 'Phone A' });
    expect(image).toBeInTheDocument();
    expect(addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    fireEvent.wheel(image.parentElement!, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(await screen.findByText('115%')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('img', { name: 'Phone A' })).not.toBeInTheDocument();
  });

  it('opens the permission-gated edit form and sends current ImageUrl in the full replacement PUT', async () => {
    const requestAdmin = requestFor();
    requestAdmin.mockImplementation(path => {
      if (path.startsWith('/admin/categories')) return Promise.resolve(Response.json({ items: categoryList }));
      if (path === '/admin/products?page=1&pageSize=10') return Promise.resolve(pageResponse([phone]));
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'Phone A updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', expect.objectContaining({ method: 'PUT' })));
    const put = requestAdmin.mock.calls.find(([path, init]) => path === '/admin/products/42' && init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ name: 'Phone A updated', imageUrl: phone.imageUrl, categoryId: 7 });
  });

  it('supports arrow navigation, Enter and Space selection, and Escape focus restoration in the grouped category picker', async () => {
    const user = userEvent.setup();
    const requestAdmin = requestFor([phone]);
    requestAdmin.mockImplementation(path => {
      if (path.startsWith('/admin/categories')) return Promise.resolve(Response.json({ items: categoryList }));
      if (path === '/admin/products?page=1&pageSize=10') return Promise.resolve(pageResponse([phone]));
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const trigger = screen.getByRole('button', { name: 'Category Phones' });
    expect(trigger).toHaveAccessibleName('Category Phones');
    await user.click(trigger);
    const listbox = screen.getByRole('listbox', { name: 'Choose a Level 2 category' });
    expect(within(listbox).getByText('Electronics')).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /Phones/ })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /Electronics/ })).not.toBeInTheDocument();
    const phonesOption = within(listbox).getByRole('option', { name: /Phones/ });
    const audioOption = within(listbox).getByRole('option', { name: /Audio/ });
    expect(phonesOption).toHaveFocus();
    expect(phonesOption).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(audioOption).toHaveFocus();
    expect(audioOption).toHaveAttribute('aria-selected', 'false');
    expect(phonesOption).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('listbox', { name: 'Choose a Level 2 category' })).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Audio');
    expect(trigger).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    let reopenedListbox = screen.getByRole('listbox', { name: 'Choose a Level 2 category' });
    let reopenedAudioOption = within(reopenedListbox).getByRole('option', { name: /Audio/ });
    expect(reopenedAudioOption).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Choose a Level 2 category' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    reopenedListbox = screen.getByRole('listbox', { name: 'Choose a Level 2 category' });
    const reopenedPhonesOption = within(reopenedListbox).getByRole('option', { name: /Phones/ });
    await user.keyboard('{ArrowUp}');
    expect(reopenedPhonesOption).toHaveFocus();
    await user.keyboard(' ');
    expect(trigger).toHaveTextContent('Phones');
    expect(trigger).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', expect.objectContaining({ method: 'PUT' })));
    const put = requestAdmin.mock.calls.find(([path, init]) => path === '/admin/products/42' && init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ categoryId: 7 });
  });

  it('loads attached matchings in edit, displays contract fields, and unlinks only after success', async () => {
    const requestAdmin = requestFor([phone]);
    requestAdmin.mockImplementation(path => {
      if (path.startsWith('/admin/categories')) return Promise.resolve(Response.json({ items: categoryList }));
      if (path === '/admin/products?page=1&pageSize=10') return Promise.resolve(pageResponse([phone]));
      if (path === '/admin/products/42/matchings') return Promise.resolve(Response.json([matching]));
      if (path === '/admin/matching/501') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(await screen.findByText('Phone A Global Edition')).toBeInTheDocument();
    expect(screen.getByText(/Shop One/)).toBeInTheDocument();
    expect(screen.getByText(/SKU-501/)).toBeInTheDocument();
    expect(screen.getByText(/12\/10\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác matching Phone A Global Edition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/matching/501', { method: 'DELETE' }));
    expect(await screen.findByText('Chưa có product matching nào được gắn.')).toBeInTheDocument();
  });

  it('keeps matching loading separate until a successful empty response arrives', async () => {
    let resolveMatchings!: (response: Response) => void;
    const requestAdmin = requestFor([phone]);
    requestAdmin.mockImplementation(path => path.startsWith('/admin/categories')
      ? Promise.resolve(Response.json({ items: categoryList }))
      : path === '/admin/products?page=1&pageSize=10' ? Promise.resolve(pageResponse([phone]))
        : path === '/admin/products/42/matchings' ? new Promise(resolve => { resolveMatchings = resolve; })
          : Promise.resolve(new Response(null, { status: 204 })));
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải product matching');
    expect(screen.queryByText('Chưa có product matching nào được gắn.')).not.toBeInTheDocument();
    resolveMatchings(Response.json([]));
    expect(await screen.findByText('Chưa có product matching nào được gắn.')).toBeInTheDocument();
  });

  it('keeps matching rows and reports unlink failures, with retryable load errors distinct from empty', async () => {
    const requestAdmin = requestFor([phone]);
    let failLoad = true;
    requestAdmin.mockImplementation(path => {
      if (path.startsWith('/admin/categories')) return Promise.resolve(Response.json({ items: categoryList }));
      if (path === '/admin/products?page=1&pageSize=10') return Promise.resolve(pageResponse([phone]));
      if (path === '/admin/products/42/matchings') return Promise.resolve(failLoad ? new Response(null, { status: 403 }) : Response.json([matching]));
      if (path === '/admin/matching/501') return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permission');
    expect(screen.queryByText('Chưa có product matching nào được gắn.')).not.toBeInTheDocument();
    failLoad = false;
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Phone A Global Edition');
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác matching Phone A Global Edition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status 500');
    expect(screen.getByText('Phone A Global Edition')).toBeInTheDocument();
  });

  it('opens image preview in the existing lightbox and keeps No image non-clickable', async () => {
    render(<ProductsPage requestAdmin={requestFor([phone, inactive])} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    fireEvent.click(screen.getByRole('button', { name: 'View product preview' }));
    expect(document.querySelector('.product-lightbox-box')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.product-lightbox')).not.toBeInTheDocument();
    expect(screen.getByText('No image').closest('button')).toBeNull();
  });

  it('hides row actions without update or delete permission and confirms deletion before DELETE', async () => {
    const requestAdmin = requestFor([phone]);
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read']} />);
    await screen.findByText('Phone A');
    expect(screen.queryByRole('button', { name: 'Actions for Phone A' })).not.toBeInTheDocument();

    cleanup();
    requestAdmin.mockImplementation(path => path.startsWith('/admin/categories')
      ? Promise.resolve(Response.json({ items: categoryList }))
      : path === '/admin/products?page=1&pageSize=10' ? Promise.resolve(pageResponse([phone])) : Promise.resolve(new Response(null, { status: 204 })));
    render(<ProductsPage requestAdmin={requestAdmin} permissions={['products.read', 'products.delete']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(requestAdmin).not.toHaveBeenCalledWith('/admin/products/42', expect.objectContaining({ method: 'DELETE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá sản phẩm' }));
    await waitFor(() => expect(requestAdmin).toHaveBeenCalledWith('/admin/products/42', { method: 'DELETE' }));
  });

  it('closes row menus on outside click and Escape', async () => {
    render(<ProductsPage requestAdmin={requestFor()} permissions={['products.read', 'products.update']} />);
    await screen.findByText('Phone A');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Phone A' }));
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  });
});
