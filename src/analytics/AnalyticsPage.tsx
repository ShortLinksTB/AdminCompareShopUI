import { Card, DataTable, PageHeader, Select } from '../ui';
import { products, shops } from '../mockData';
import './analytics.css';

const clickSeries = [
  { date: 'Oct 17', value: 4200 }, { date: 'Oct 20', value: 5000 }, { date: 'Oct 23', value: 4400 },
  { date: 'Oct 26', value: 5900 }, { date: 'Oct 29', value: 5500 }, { date: 'Nov 1', value: 6600 },
  { date: 'Nov 4', value: 6200 }, { date: 'Nov 7', value: 7300 }, { date: 'Nov 9', value: 5800 },
  { date: 'Nov 11', value: 6900 }, { date: 'Nov 13', value: 7800 },
];

const conversionSeries = [
  { date: 'Oct 17', value: 2.8 }, { date: 'Oct 20', value: 2.6 }, { date: 'Oct 23', value: 3.1 },
  { date: 'Oct 26', value: 2.9 }, { date: 'Oct 29', value: 3.2 }, { date: 'Nov 1', value: 3.0 },
  { date: 'Nov 4', value: 3.5 }, { date: 'Nov 7', value: 3.2 }, { date: 'Nov 9', value: 3.6 },
  { date: 'Nov 11', value: 3.62 }, { date: 'Nov 13', value: 3.84 },
];

const revenueByShop = shops.map((shop, index) => ({
  ...shop,
  revenue: 184 - index * 31,
  width: 86 - index * 13,
}));

const clicks = (value: number) => `${value.toLocaleString('en-US')} lượt click`;
const money = (value: number) => `₫${value.toFixed(1)}M`;

export function AnalyticsPage() {
  return <div className="studio-analytics">
    <PageHeader eyebrow="REPORTING" title="Analytics & Revenue" description="Theo dõi view, click, conversion và revenue đã đối soát."
      actions={<Select aria-label="Khoảng thời gian" defaultValue="Last 30 days"><option>Last 30 days</option><option>Last 90 days</option></Select>} />

    <section className="analytics-kpi-grid" aria-label="Chỉ số Analytics">
      <AnalyticsKpi label="Product views" value="1.24M" change="+18.4%" icon="▦" tone="brand" />
      <AnalyticsKpi label="Affiliate clicks" value="84.2K" change="+12.8%" icon="↗" tone="cool" />
      <AnalyticsKpi label="Conversion rate" value="3.84%" change="+0.42%" icon="◎" tone="ok" />
      <AnalyticsKpi label="Revenue" value="₫482M" change="Đã đối soát" icon="₫" tone="warn" />
    </section>

    <section className="analytics-chart-grid" aria-label="Analytics charts">
      <Card className="analytics-panel analytics-clicks-panel">
        <div className="analytics-panel-heading"><div><h2>Clicks &amp; conversion</h2><p>Hiệu suất theo ngày</p></div></div>
        <ChartSection title="Affiliate clicks" scaleLabel="lượt click / ngày · thang 0–8k" series={clickSeries} kind="bars" />
        <ChartSection title="Conversion rate" scaleLabel="tỷ lệ / ngày (%) · thang 0–4%" series={conversionSeries} kind="line" />
        <details className="analytics-alternate-data">
          <summary>Bảng dữ liệu thay thế cho biểu đồ</summary>
          <DataTable><thead><tr><th>Ngày</th><th>Affiliate clicks</th><th>Conversion rate</th></tr></thead><tbody>
            <tr><td>17/10/2026</td><td>4.200 lượt click</td><td>2,8%</td></tr>
            <tr><td>31/10/2026</td><td>5.500 lượt click</td><td>3,2%</td></tr>
            <tr><td>13/11/2026</td><td>7.800 lượt click</td><td>3,84%</td></tr>
          </tbody></DataTable>
        </details>
      </Card>

      <Card className="analytics-panel analytics-products-panel">
        <div className="analytics-panel-heading"><div><h2>Top products</h2><p>Click nhiều nhất</p></div></div>
        <ol className="analytics-rank-list">{products.slice(0, 5).map((product, index) => <li className="analytics-rank-row" key={product.id}>
          <span className="analytics-rank-number">{index + 1}</span>
          <span className="analytics-rank-product"><strong>{product.name}</strong><small>{(12400 - index * 1470).toLocaleString('en-US')} clicks</small></span>
          <strong className="analytics-rate">{(8.4 - index * .8).toFixed(1)}%</strong>
        </li>)}</ol>
      </Card>
    </section>

    <Card className="analytics-panel analytics-revenue-panel">
      <div className="analytics-panel-heading"><div><h2>Revenue by partner shop</h2><p>Chỉ hiển thị revenue đã có dữ liệu đối soát.</p></div></div>
      <div className="analytics-revenue-list">{revenueByShop.map(shop => <div className="analytics-revenue-row" key={shop.name}>
        <span className="analytics-shop-name"><strong>{shop.name}</strong><small>{shop.offers.toLocaleString('en-US')} active offers</small></span>
        <div className="analytics-revenue-track" role="img" aria-label={`${shop.name} revenue relative to other partner shops: ${shop.revenue} triệu đồng`}><span style={{ width: `${shop.width}%` }} /></div>
        <strong className="analytics-revenue-value">{money(shop.revenue)}</strong>
      </div>)}</div>
      <details className="analytics-alternate-data">
        <summary>Bảng dữ liệu thay thế cho biểu đồ</summary>
        <DataTable><thead><tr><th>Partner shop</th><th>Active offers</th><th>Revenue đã đối soát</th></tr></thead><tbody>
          {revenueByShop.map(shop => <tr key={shop.name}><td>{shop.name}</td><td>{shop.offers.toLocaleString('en-US')}</td><td className="analytics-money">₫{(shop.revenue * 1_000_000).toLocaleString('vi-VN')}</td></tr>)}
        </tbody></DataTable>
      </details>
    </Card>

    <details className="analytics-state-reference"><summary>Trạng thái biểu đồ · tham chiếu thiết kế</summary>
      <div className="analytics-state-grid">
        <div className="analytics-state analytics-loading-state"><strong>Loading data…</strong><span>Giữ kích thước chart card và trục để hạn chế layout shift.</span></div>
        <div className="analytics-state analytics-error-state" role="alert"><strong>Could not load analytics.</strong><span>Thông báo có chữ và biểu tượng; vùng chart không hiển thị dữ liệu cũ như dữ liệu mới.</span></div>
        <div className="analytics-state analytics-empty-state"><strong>No analytics data</strong><span>Dữ liệu sẽ xuất hiện khi có lượt xem hoặc click trong khoảng đã chọn.</span></div>
      </div>
    </details>
  </div>;
}

function AnalyticsKpi({ label, value, change, icon, tone }: { label: string; value: string; change: string; icon: string; tone: 'brand' | 'cool' | 'ok' | 'warn' }) {
  return <Card as="article" className="analytics-kpi">
    <span className={`analytics-kpi-icon analytics-kpi-icon-${tone}`} aria-hidden="true">{icon}</span>
    <span className="analytics-kpi-label">{label}</span><strong>{value}</strong><small className={change.startsWith('+') ? 'analytics-positive' : ''}>{change}</small>
  </Card>;
}

function ChartSection({ title, scaleLabel, series, kind }: { title: string; scaleLabel: string; series: { date: string; value: number }[]; kind: 'bars' | 'line' }) {
  const chartId = `analytics-${kind}-title`;
  if (kind === 'bars') {
    const plotHeight = 96;
    return <section className="analytics-chart-section" aria-labelledby={chartId}>
      <div className="analytics-chart-title"><h3 id={chartId}>{title}</h3><span>{scaleLabel}</span></div>
      <div className="analytics-legend"><span><i className="analytics-legend-clicks" />Affiliate clicks</span></div>
      <div className="analytics-plot-wrap"><div className="analytics-y-labels" aria-hidden="true"><span>8k</span><span>4k</span><span>0</span></div>
        <svg className="analytics-plot analytics-bar-plot" viewBox="0 0 600 110" role="group" aria-labelledby={chartId}>
          {series.map((point, index) => {
            const height = point.value / 8000 * plotHeight;
            const x = 10 + index * 53;
            return <rect key={point.date} x={x} y={110 - height} width="26" height={height} rx="5" tabIndex={0} aria-label={`${point.date}: ${clicks(point.value)}`}>
              <title>{point.date} · {clicks(point.value)}</title>
            </rect>;
          })}
        </svg>
      </div>
      <div className="analytics-x-labels"><span>Oct 17</span><span>Oct 24</span><span>Oct 31</span><span>Nov 7</span><span>Nov 13</span></div>
    </section>;
  }

  const points = series.map((point, index) => ({ ...point, x: index / (series.length - 1) * 600, y: 110 - point.value / 4 * 100 }));
  const path = points.map(point => `${point.x === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  return <section className="analytics-chart-section analytics-conversion-section" aria-labelledby={chartId}>
    <div className="analytics-chart-title"><h3 id={chartId}>{title}</h3><span>{scaleLabel}</span></div>
    <div className="analytics-legend"><span><i className="analytics-legend-conversion" />Conversion rate</span></div>
    <div className="analytics-plot-wrap"><div className="analytics-y-labels" aria-hidden="true"><span>4%</span><span>2%</span><span>0</span></div>
      <svg className="analytics-plot analytics-line-plot" viewBox="0 0 600 110" role="group" aria-labelledby={chartId}>
        <path d={path} />
        {points.map(point => <circle key={point.date} cx={point.x} cy={point.y} r="4" tabIndex={0} aria-label={`${point.date}: ${point.value}%`}><title>{point.date} · {point.value}%</title></circle>)}
      </svg>
    </div>
    <div className="analytics-x-labels"><span>Oct 17</span><span>Oct 24</span><span>Oct 31</span><span>Nov 7</span><span>Nov 13</span></div>
  </section>;
}
