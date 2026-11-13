import { Card, DataTable, EmptyState, ErrorState, Loading, PageHeader, Pill } from '../ui';
import { products } from '../mockData';
import './price-alerts.css';

const formatMoney = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
}).format(value);

const metrics = [
  { label: 'Active alerts', value: '8,420', detail: '+8.6%', icon: '▦' },
  { label: 'Triggered today', value: '186', detail: '+24 alerts', icon: '↗' },
  { label: 'Delivery rate', value: '99.1%', detail: 'Email & push', icon: '⌂' },
];

export function PriceAlertsPage() {
  return <div className="price-alerts-page">
    <PageHeader eyebrow="CUSTOMER" title="Price Alerts" description="Theo dõi các alert và trạng thái thông báo đến người dùng." />
    <section className="price-alerts-metrics" aria-label="Price alert summary">
      {metrics.map(metric => <Card as="article" className="price-alerts-metric" key={metric.label}>
        <span className="price-alerts-metric-label"><i aria-hidden="true">{metric.icon}</i>{metric.label}</span>
        <strong>{metric.value}</strong>
        <small>{metric.detail}</small>
      </Card>)}
    </section>
    <Card className="price-alerts-table-card" aria-label="Price alerts">
      <DataTable className="price-alerts-table-scroll">
        <thead><tr><th scope="col">Product</th><th scope="col">Target price</th><th scope="col">Current price</th><th scope="col">Subscribers</th><th scope="col">Last notified</th><th scope="col">Status</th></tr></thead>
        <tbody>{products.slice(0, 5).map((product, index) => <tr key={product.id}>
          <td><strong>{product.name}</strong><small>{product.brand}</small></td>
          <td className="price-alerts-money">{formatMoney(product.minPrice - (index + 1) * 300000)}</td>
          <td className="price-alerts-money">{formatMoney(product.minPrice)}</td>
          <td>{124 - index * 17}</td>
          <td>{index ? `${index + 1} giờ trước` : 'Hôm nay, 09:20'}</td>
          <td><Pill tone={index === 2 ? 'warn' : 'ok'}>{index === 2 ? 'Pending' : 'Active'}</Pill></td>
        </tr>)}</tbody>
      </DataTable>
      <footer className="price-alerts-footer"><span>5 alerts shown</span><span>Notifications: Email &amp; push</span></footer>
    </Card>
    <section className="price-alerts-state-examples" aria-label="Price alert state examples">
      <Card className="price-alerts-state price-alerts-loading"><b>Loading</b><Loading label="Price alerts are loading" /></Card>
      <Card className="price-alerts-state"><EmptyState title="Empty">No price alerts available.</EmptyState></Card>
      <Card className="price-alerts-state price-alerts-error"><ErrorState title="Error">Could not load price alerts.</ErrorState></Card>
    </section>
  </div>;
}
