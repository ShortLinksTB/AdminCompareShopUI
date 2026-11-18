import { useEffect, useState } from 'react';
import { Button, Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, Pager, Pill, TableFooter } from '../ui';
import type { AdminRequest } from '../bannedItemsApi';
import { getPriceAlerts, type PriceAlertPage } from './price-alerts-api';
import './price-alerts.css';

const PAGE_SIZE = 25;

type RequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; page: PriceAlertPage };

const formatMoney = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(value);

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function PriceAlertsPage({ requestAdmin }: { requestAdmin: AdminRequest }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<RequestState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void getPriceAlerts(requestAdmin, pageNumber, PAGE_SIZE, controller.signal)
      .then(page => { if (!controller.signal.aborted) setState({ status: 'success', page }); })
      .catch(reason => {
        if (!controller.signal.aborted) setState({ status: 'error', message: reason instanceof Error ? reason.message : 'Could not load price alerts.' });
      });
    return () => controller.abort();
  }, [requestAdmin, pageNumber, reload]);

  const result = state.status === 'success' ? state.page : null;
  const page = result?.pageNumber ?? pageNumber;
  const pageSize = result?.pageSize ?? PAGE_SIZE;
  const total = result?.totalItems ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);

  function changePage(nextPage: number) {
    setState({ status: 'loading' });
    setPageNumber(nextPage);
  }

  function retry() {
    setState({ status: 'loading' });
    setReload(value => value + 1);
  }

  return <div className="price-alerts-page">
    <PageHeader eyebrow="CUSTOMER" title="Price Alerts" description="Theo dõi các alert mà người dùng đã tạo và trạng thái bật/tắt. Chỉ hiển thị dữ liệu mà API hiện có thật — product, target price, trạng thái và ngày tạo." />
    <Card className="price-alerts-table-card" aria-label="Price alerts">
      {state.status === 'loading' ? <div className="price-alerts-request-state"><Loading label="Đang tải Price Alerts" /></div>
        : state.status === 'error' ? <div className="price-alerts-request-state price-alerts-error">
          <ErrorState title={state.message} />
          <Button size="sm" onClick={retry}>Thử lại</Button>
        </div>
          : state.status === 'success' && state.page.items.length === 0 ? <div className="price-alerts-request-state">
            <EmptyState title="No price alerts available.">Danh sách cảnh báo giá hiện chưa có dữ liệu.</EmptyState>
          </div>
            : state.status === 'success' ? <>
              <DataTable className="price-alerts-table-scroll">
                <thead><tr><th scope="col">Product</th><th scope="col">Target price</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead>
                <tbody>{state.page.items.map(alert => <tr key={alert.id}>
                  <td><strong>{alert.productName}</strong>{alert.productSlug && <small>{alert.productSlug}</small>}</td>
                  <td className="price-alerts-money">{formatMoney(alert.targetPrice)}</td>
                  <td><Pill tone={alert.isActive ? 'ok' : 'warn'}>{alert.isActive ? 'Active' : 'Inactive'}</Pill></td>
                  <td>{dateLabel(alert.createdAtUtc)}</td>
                </tr>)}</tbody>
              </DataTable>
              <TableFooter start={start} end={end} total={total}>
                <Pager page={page} pages={pages} onChange={changePage} />
              </TableFooter>
            </> : null}
    </Card>
  </div>;
}
