import { Button, Card, DataTable, PageHeader, SearchField, Toolbar } from '../ui';
import './price-history.css';

const records = [
  ['16/10/2026', 'Tiki', '₫18.490.000', '-₫500.000', 'Voucher'],
  ['12/10/2026', 'Shopee Mall', '₫18.990.000', '+₫300.000', 'Price update'],
  ['05/10/2026', 'CellphoneS', '₫18.690.000', '-₫200.000', 'Promotion'],
];

export function PriceHistory() {
  return <div className="price-history-page">
    <PageHeader eyebrow="CATALOG & PRICING" title="Price History" description="Theo dõi biến động giá và phát hiện bất thường."
      actions={<Button>⇩ Export report</Button>} />
    <Toolbar className="price-history-toolbar">
      <SearchField label="Search product" placeholder="Search product..." />
    </Toolbar>
    <Card className="price-history-chart-card">
      <div className="price-history-heading">
        <div><h2>iPhone 15 128GB</h2><p>Lowest price trend · 6 tháng gần nhất</p></div>
        <strong>₫18.490.000</strong>
      </div>
      <div className="price-history-chart" role="img" aria-label="Price trend over six months">
        <svg viewBox="0 0 800 230" preserveAspectRatio="none" aria-hidden="true"><path d="M0 170 C80 150 100 180 160 125 S260 160 320 95 S400 140 480 70 S560 110 650 52 S730 80 800 35" /></svg>
      </div>
    </Card>
    <Card className="price-history-table-card" aria-label="Price history records">
      <DataTable className="price-history-table-wrap">
        <thead><tr><th>Date</th><th>Shop</th><th>Price</th><th>Change</th><th>Event</th></tr></thead>
        <tbody>{records.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className={index === 3 && cell.startsWith('-') ? 'price-history-decrease' : index === 2 || index === 3 ? 'price-history-amount' : undefined}>{cell}</td>)}</tr>)}</tbody>
      </DataTable>
      <div className="price-history-footer">3 price records</div>
    </Card>
  </div>;
}
